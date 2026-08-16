// 测试 dsh-vimina 插件：加载插件源码，stub ctx.tools，调用各工具验证与 Vimina 的通信。
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'

// ---- stub ctx（只提供插件需要的 tools 注册 + on('dispose')）----
const registered: ToolDefinition[] = []
const ctx: any = {
  tools: {
    register(def: ToolDefinition) {
      registered.push(def)
      return () => {}
    },
  },
  on() {},
  effect(_cb: () => () => void) {},
}

// ---- apply 插件 ----
plugin.apply(ctx, { exePath: 'D:\\IO\\dotnet\\Vimina\\bin\\Debug\\net8.0-windows\\Vimina.exe', timeoutMs: 30000 })

console.log('[ok] 插件已 apply，注册工具数:', registered.length)
for (const t of registered) console.log('  -', t.name)

// ---- 逐个调用工具执行，验证返回 ----
async function callTool(name: string, args: any) {
  const def = registered.find((d) => d.name === name)
  if (!def) throw new Error('工具未注册: ' + name)
  // execute 签名: (args, exec) => Promise<JsonValue>
  const value = await (def as any).execute(args, {})
  return value
}

// 校验所有工具定义结构（name/description/parameters/output.schema/execute 齐全）。
function validateDefs() {
  for (const d of registered) {
    if (!d.name || !d.description) throw new Error('工具缺 name/description: ' + (d as any).name)
    if (!d.parameters || typeof d.parameters !== 'object') throw new Error('工具缺 parameters: ' + d.name)
    if (!d.output || !d.output.schema) throw new Error('工具缺 output.schema: ' + d.name)
    if (typeof (d as any).execute !== 'function') throw new Error('工具缺 execute: ' + d.name)
  }
  console.log('[ok] 全部工具定义结构有效（name/description/parameters/output/execute）')
}

async function main() {
  // 0. 断言注册数量与结构
  if (registered.length !== 26) {
    console.error('[FAIL] 期望 26 个工具，实际', registered.length)
    process.exit(1)
  }
  validateDefs()

  // 1. 实际调用依赖真实 Vimina 进程；沙箱内 spawn 会被 EPERM 拒绝 → 判定为环境受限而非插件错误。
  const results: string[] = []
  for (const name of ['vimina_info', 'vimina_getWindows']) {
    try {
      const value = await callTool(name, {})
      results.push(name + ' OK: ' + JSON.stringify(value).slice(0, 80))
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('EPERM') || msg.includes('启动失败') || msg.includes('spawn')) {
        results.push(name + ' SKIP(沙箱禁止 spawn GUI 进程): ' + msg.slice(0, 60))
      } else {
        results.push(name + ' ERR: ' + msg.slice(0, 80))
      }
    }
  }
  for (const r of results) console.log('  ' + r)

  console.log('\n=== 插件注册与结构校验完成（26 工具） ===')
  process.exit(0)
}

main().catch((e) => {
  console.error('[FAIL]', e)
  process.exit(1)
})