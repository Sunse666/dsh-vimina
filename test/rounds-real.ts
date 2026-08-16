// 多轮真实功能测试：观察前台窗口、扫描控件、执行脚本、鼠标操作
// 用法: node --experimental-strip-types test/rounds-real.ts [轮数]
import * as plugin from '../src/index.ts'
import { VIMINA_EXE } from './exe.ts'

const ROUNDS = Number(process.argv[2] ?? 4)

const registered: any[] = []
const ctx: any = {
  tools: { register(d: any) { registered.push(d); return () => {} } },
  on() {},
  effect() {},
}
plugin.apply(ctx, {
  exePath: VIMINA_EXE,
  timeoutMs: 30000,
})

function tool(name: string) {
  const d = registered.find((x) => x.name === name)
  if (!d) throw new Error('工具未注册: ' + name)
  return (args: any) => (d as any).execute(args, {})
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 安全的后台点击（不移动鼠标、不抢前台）
async function safeBackendClick(x: number, y: number) {
  const r = await tool('vimina_clickAt')({ x, y, backend: true })
  return r
}

async function main() {
  const info = await tool('vimina_info')({})
  console.log('[启动] Vimina 版本:', info.version, '| 端口:', info.apiPort, '| auth:', info.auth)

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n========== 第 ${round} 轮 ==========`)

    // 1. 前台窗口标题
    const w = await tool('vimina_getWindows')({})
    const wins = (w.windows ?? w) as any[]
    console.log(`[窗口] 共 ${wins.length} 个，前 5 个:`)
    wins.slice(0, 5).forEach((x, i) => console.log(`   ${i}. ${x.title}  (${x.className}, hwnd=${x.hwnd})`))

    // 2. 扫描前台窗口（可交互控件）
    const scan = await tool('vimina_scan')({})
    console.log(`[扫描] 前台窗口「${scan.windowTitle}」可交互控件 ${scan.total} 个`)
    if (scan.controls?.length) {
      scan.controls.slice(0, 12).forEach((c: any) =>
        console.log(`   ${c.label}: ${(c.name || '(无名称)').slice(0, 40)} (${c.type}) [${c.x},${c.y} ${c.width}x${c.height}]`))
      if (scan.controls.length > 12) console.log(`   ... 等 ${scan.controls.length - 12} 个`)
    }

    // 3. 坐标处控件（取一个固定中心点）
    const cx = 960, cy = 540
    const at = await tool('vimina_getControlAt')({ x: cx, y: cy })
    if (at && at.name !== undefined) {
      console.log(`[控件@(${cx},${cy})] ${at.label}: ${(at.name || '').slice(0, 40)} (${at.type})`)
    } else {
      console.log(`[控件@(${cx},${cy})] 无`)
    }

    // 4. 后台点击测试（安全，不移动鼠标）：点第 1 个可点击控件中心
    const firstClickable = scan.controls?.find((c: any) => c.enabled)
    if (firstClickable) {
      const r = await safeBackendClick(Math.round(firstClickable.x + firstClickable.width / 2), Math.round(firstClickable.y + firstClickable.height / 2))
      console.log(`[后台点击] ${firstClickable.label} @ (${Math.round(firstClickable.x + firstClickable.width / 2)},${Math.round(firstClickable.y + firstClickable.height / 2)}) -> ${r.message ?? 'ok'}`)
    }

    // 5. 鼠标位置
    const mp = await tool('vimina_getMousePos')({})
    console.log(`[鼠标] 位置 (${mp.x}, ${mp.y})`)

    // 6. 跑一段 VMA 脚本
    const run = await tool('vimina_runVma')({
      script: `rand(1,1000)\nvar v = _return\nlog('round-${round} random=' + v)\nsleep(50)`,
    })
    console.log(`[脚本] success=${run.success} lines=${run.linesExecuted} log=${JSON.stringify(run.log)} _return=${run.variables?._return}`)

    await sleep(400) // 轮间留白
  }

  console.log(`\n===== ${ROUNDS} 轮全部完成 =====`)
  process.exit(0)
}

main().catch((e) => { console.error('[FAIL]', e); process.exit(1) })
