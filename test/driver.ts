import * as plugin from '../src/index.ts'
const registered: any[] = []
const ctx: any = { tools: { register(d: any) { registered.push(d); return () => {} } }, on() {}, effect() {} }
plugin.apply(ctx, { exePath: 'D:\\IO\\dotnet\\Vimina\\bin\\Debug\\net8.0-windows\\Vimina.exe', timeoutMs: 25000 })
const tools: Record<string, (a: any) => Promise<any>> = {}
for (const d of registered) { const name = (d as any).name; tools[name] = (a: any) => (d as any).execute(a, {}) }
;(globalThis as any).__viminaTools = tools
console.log('READY tools=' + Object.keys(tools).length)
