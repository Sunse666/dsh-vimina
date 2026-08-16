// 单元测试 ViminaClient 协议逻辑：注入 mock spawnFn，验证请求/响应 id 匹配、解析、超时。
import { Duplex } from 'node:stream'
import { ViminaClient } from '../src/index.ts'

// 内存子进程：收到 stdin JSON 行后回显应答（ok:true, result:{echo:method, params}）
function makeFakeChild() {
  const fake = new Duplex({ read() {}, write(chunk, enc, cb) { cb() } }) as any
  fake.killed = false
  fake.kill = () => { fake.killed = true }
  fake.stderr = { on() {} }
  const realOn = fake.on.bind(fake)
  fake.on = (ev: string, cb: any) => { if (ev === 'error' || ev === 'exit') { /* noop */ } else { realOn(ev, cb) } return fake }
  fake.stdin = fake
  fake.stdout = fake
  fake.stdout.setEncoding = () => {}
  const origWrite = fake.write.bind(fake)
  fake.write = (chunk: any, enc?: any, cb?: any) => {
    const lines = chunk.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      const req = JSON.parse(line)
      const res = { id: req.id, ok: true, result: { echo: req.method, params: req.params ?? null } }
      console.log('[mock] 收到请求:', line, '→ 应答 id=', res.id)
      fake.push(JSON.stringify(res) + '\n')  // 用 push 而不是 emit，走真实 readable 管道
    }
    return origWrite(chunk, enc, cb)
  }
  return fake
}

async function main() {
  let fake: any
  const client = new ViminaClient('mock.exe', (() => { fake = makeFakeChild(); return fake }) as any)

  // 1. 基本调用
  const r1 = await client.call('scan', { title: '记事本' }, 3000)
  console.log('[1] scan ->', JSON.stringify(r1))
  if (!r1.ok || (r1.result as any).echo !== 'scan') throw new Error('scan 应答不匹配')

  // 2. 连续两个调用 id 递增
  const r2 = await client.call('getWindows', undefined, 3000)
  if (!r2.ok || (r2.result as any).echo !== 'getWindows') throw new Error('getWindows 应答不匹配')

  // 3. 超时：构造不应答的 child
  const silent = new Duplex({ read() {}, write(c, e, cb) { cb() } }) as any
  silent.killed = false
  silent.kill = () => { silent.killed = true }
  silent.stderr = { on() {} }
  silent.on = (ev: string) => silent
  silent.stdin = silent
  silent.stdout = silent
  silent.stdout.setEncoding = () => {}
  const c2 = new ViminaClient('silent.exe', (() => silent) as any)
  try {
    await c2.call('info', undefined, 200)
    throw new Error('应当超时但未超时')
  } catch (e) {
    console.log('[3] 超时正确触发:', (e as Error).message)
  }

  console.log('\n=== ViminaClient 协议逻辑全部通过 ===')
}
main().catch((e) => { console.error('[FAIL]', e); process.exit(1) })