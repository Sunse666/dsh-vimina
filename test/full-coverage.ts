// 全覆盖测试：逐轮调用全部 25 个工具，统计每轮 OK/FAIL
// 用法: node --experimental-strip-types test/full-coverage.ts [轮数]
import * as plugin from '../src/index.ts'

const ROUNDS = Number(process.argv[2] ?? 3)
const registered: any[] = []
const ctx: any = {
  tools: { register(d: any) { registered.push(d); return () => {} } },
  on() {},
  effect() {},
}
plugin.apply(ctx, {
  exePath: 'D:\\IO\\dotnet\\Vimina\\bin\\Debug\\net8.0-windows\\Vimina.exe',
  timeoutMs: 20000,
})
function tool(name: string) {
  const d = registered.find((x) => x.name === name)
  if (!d) throw new Error('工具未注册: ' + name)
  return (args: any) => (d as any).execute(args, {})
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runRound(round: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const call = async (name: string, args: any) => {
    try {
      await tool(name)(args)
      out[name] = 'OK'
    } catch (e) {
      out[name] = 'ERR: ' + (e as Error).message.slice(0, 50)
    }
  }

  // ---- 只读/查询 ----
  await call('vimina_info', {})
  await call('vimina_getWindows', {})
  await call('vimina_scan', {})
  await call('vimina_getMousePos', {})
  await call('vimina_vmaStatus', {})

  // ---- 扫描/查询 ----
  await call('vimina_scanByTitle', { title: 'Cent Browser' })
  await call('vimina_getElement', { name: '播放' })
  await call('vimina_getControlAt', { x: 960, y: 540 })

  // ---- 点击（后台安全） ----
  const scan = await tool('vimina_scan')({}) as any
  const clickable = (scan?.controls ?? []).find((c: any) => c.enabled)
  if (clickable) {
    await call('vimina_clickAt', { x: Math.round(clickable.x + clickable.width / 2), y: Math.round(clickable.y + clickable.height / 2), backend: true })
  } else {
    await call('vimina_clickAt', { x: 10, y: 10, backend: true })
  }
  // clickLabel：依赖 scanByTitle 持久化的标签映射
  const stb = await tool('vimina_scanByTitle')({ title: 'Cent Browser' }) as any
  const stbClickable = (stb?.controls ?? []).find((c: any) => c.enabled)
  if (stbClickable) {
    await call('vimina_clickLabel', { label: stbClickable.label })
  } else {
    await call('vimina_clickLabel', { label: 'NONE' })
  }

  // ---- 键盘 ----
  await call('vimina_keyDown', { keys: 'Shift' })
  await call('vimina_keyUp', { keys: 'Shift' })
  await call('vimina_key', { keys: 'F12' })
  await call('vimina_input', { text: 'x' })

  // ---- 鼠标 ----
  await call('vimina_moveMouse', { x: 5, y: 5 })
  await call('vimina_drag', { x1: 10, y1: 10, x2: 40, y2: 40 })
  await call('vimina_mouseDown', { x: 5, y: 5 })
  await call('vimina_mouseUp', { x: 5, y: 5 })

  // ---- 窗口 ----
  await call('vimina_activate', { title: 'PowerShell' })

  // ---- 脚本 ----
  await call('vimina_runVma', { script: `rand(1,999)\nvar v = _return\nlog('full-${round}='+v)` })
  await call('vimina_vmaLog', {})
  await call('vimina_vmaPause', {})
  await call('vimina_vmaResume', {})
  await call('vimina_vmaStop', {})

  // ---- 截图 ----
  await call('vimina_screenshot', { filename: `full_${round}.png` })

  return out
}

async function main() {
  const names = registered.map((d: any) => d.name)
  console.log('工具总数:', names.length)
  const all: Record<string, string[]> = {}
  for (const n of names) all[n] = []

  for (let r = 1; r <= ROUNDS; r++) {
    const res = await runRound(r)
    for (const n of names) all[n].push(res[n] ?? '未调用')
    const ok = Object.values(res).filter((v) => v === 'OK').length
    console.log(`第 ${r} 轮: ${ok}/${names.length} OK`)
    await sleep(300)
  }

  console.log('\n========== 汇总 ==========')
  for (const n of names) {
    const states = all[n]
    console.log(`  ${states.every((s) => s === 'OK') ? '✅' : '❌'} ${n}: ${states.join(' | ')}`)
  }
  const total = names.length * ROUNDS
  const okCount = names.reduce((a, n) => a + all[n].filter((s) => s === 'OK').length, 0)
  console.log(`\n总计: ${okCount}/${total} 成功（${Math.round((okCount / total) * 100)}%）`)
  process.exit(0)
}
main().catch((e) => { console.error('[FAIL]', e); process.exit(1) })
