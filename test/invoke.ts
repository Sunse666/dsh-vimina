// 通用工具调用器：node invoke.ts <toolName> '<jsonArgs>'
// 每次调用一个 Vimina 工具并打印 JSON 结果（模拟 agent 单步工具调用）
import * as plugin from '../src/index.ts'
const toolName = process.argv[2] ?? process.env.VIMINA_TOOL
const argsJson = process.argv[3] ?? process.env.VIMINA_ARGS ?? '{}'
const registered: any[] = []
const ctx: any = { tools: { register(d: any) { registered.push(d); return () => {} } }, on() {}, effect() {} }
plugin.apply(ctx, { exePath: 'D:\\IO\\dotnet\\Vimina\\bin\\Debug\\net8.0-windows\\Vimina.exe', timeoutMs: 25000 })
const def = registered.find((d: any) => d.name === toolName)
if (!def) { console.error('NO_TOOL:' + toolName); process.exit(2) }
const args = argsJson ? JSON.parse(argsJson) : {}
;(def as any).execute(args, {})
  .then((v: any) => { console.log(JSON.stringify(v)); process.exit(0) })
  .catch((e: any) => { console.error('TOOL_ERR:' + (e.message || e).slice(0, 300)); process.exit(1) })
