// 真实端到端：通过插件工具调用 Vimina 的多个方法（需要能 spawn Vimina.exe 的环境）
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'

const registered: ToolDefinition[] = []
const ctx: any = {
  tools: { register(d: ToolDefinition) { registered.push(d); return () => {} } },
  on() {},
  effect() {},
}
plugin.apply(ctx, { exePath: 'D:\\IO\\dotnet\\Vimina\\bin\\Debug\\net8.0-windows\\Vimina.exe', timeoutMs: 30000 })

async function callTool(name: string, args: any) {
  const def = registered.find((d) => d.name === name)
  if (!def) throw new Error('工具未注册: ' + name)
  return (def as any).execute(args, {})
}

async function main() {
  const results: Record<string, string> = {}

  // 1. info
  const info = await callTool('vimina_info', {}) as any
  results.info = '版本=' + info.version + ' 工具数=' + info.tools.length

  // 2. getWindows
  const w = await callTool('vimina_getWindows', {}) as any
  results.getWindows = '窗口数=' + (w.windows?.length ?? 'n/a')

  // 3. runVma（执行脚本，返回变量）
  const run = await callTool('vimina_runVma', { script: 'rand(1,100)\nlog(\'plugin-e2e\')' }) as any
  results.runVma = 'success=' + run.success + ' log=' + JSON.stringify(run.log) + ' _return=' + run.variables?._return

  // 4. screenshot（截图落盘）
  const shot = await callTool('vimina_screenshot', { filename: 'plugin_e2e_test.png' }) as any
  results.screenshot = 'path=' + shot.path

  // 5. getMousePos
  const mp = await callTool('vimina_getMousePos', {}) as any
  results.getMousePos = 'x=' + mp.x + ' y=' + mp.y

  // 6. vmaStatus
  const st = await callTool('vimina_vmaStatus', {}) as any
  results.vmaStatus = 'running=' + st.running

  console.log('\n=== 真实端到端结果 ===')
  for (const [k, v] of Object.entries(results)) console.log('  ' + k + ': ' + v)
  console.log('\n=== 全部真实调用成功 ===')
  process.exit(0)
}
main().catch((e) => { console.error('[FAIL]', e); process.exit(1) })