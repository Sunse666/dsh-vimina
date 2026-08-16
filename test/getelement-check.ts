import * as plugin from '../src/index.ts'
import { VIMINA_EXE } from './exe.ts'
const registered: any[] = []
const ctx: any = { tools: { register(d: any) { registered.push(d); return () => {} } }, on() {}, effect() {} }
plugin.apply(ctx, { exePath: VIMINA_EXE, timeoutMs: 20000 })
function tool(n: string) { const d = registered.find((x: any) => x.name === n); if (!d) throw new Error('no tool ' + n); return (a: any) => (d as any).execute(a, {}) }

async function main() {
  // 1. 扫描前台，拿真实控件名
  const scan = await tool('vimina_scan')({}) as any
  console.log('前台窗口:', scan.windowTitle, '| 控件数:', scan.total)
  const withName = (scan.controls ?? []).filter((c: any) => c.name && c.name.trim())
  console.log('有名称控件示例:', withName.slice(0, 5).map((c: any) => c.name).join(' | '))
  if (!withName.length) { console.log('前台无有名称控件，用全扫描'); process.exit(0) }

  // 2. 用真实名称调用 getElement
  const target = withName[0].name
  const el = await tool('vimina_getElement')({ name: target })
  console.log('\ngetElement("' + target + '"):', JSON.stringify(el).slice(0, 200))

  // 3. 反向验证：不存在的名称应报"未找到"
  try {
    await tool('vimina_getElement')({ name: '__不存在__' })
    console.log('不存在名称: 意外成功')
  } catch (e) {
    console.log('不存在名称: 正确报错 ->', (e as Error).message.slice(0, 40))
  }
  console.log('\ngetElement 功能验证完成')
  process.exit(0)
}
main().catch((e) => { console.error('[FAIL]', e); process.exit(1) })
