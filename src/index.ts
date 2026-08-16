import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { TOOL_NAMES, USAGE_GUIDE } from './usage.ts'

export const name = 'vimina'

export const inject = ['tools']

export interface Config {
  /** Vimina executable path. Defaults to resolving 'Vimina.exe' on PATH. */
  exePath?: string
  /** Timeout per tool call in ms. */
  timeoutMs?: number
}

import Schema from '@deepseek-ai/schemastery'

export const Config: Schema<Config> = Schema.object({
  exePath: Schema.string().default('Vimina.exe'),
  timeoutMs: Schema.number().default(60000),
})

// ---------- stdio JSON-RPC client ----------

interface StdioRequest {
  id: number
  method: string
  params?: unknown
}

interface StdioResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

/**
 * Drives `Vimina.exe serve` over stdio (line-delimited JSON).
 * Spawned lazily on first call; torn down on plugin dispose.
 */
export class ViminaClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, (r: StdioResponse) => void>()
  private buffer = ''
  private connecting: Promise<void> | null = null
  private readonly exePath: string
  private readonly spawnFn: (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams

  constructor(exePath: string, spawnFn?: (cmd: string, args: string[], opts: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams) {
    this.exePath = exePath
    this.spawnFn = spawnFn ?? ((cmd, args, opts) => nodeSpawn(cmd, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams)
  }

  private ensure(): Promise<void> {
    if (this.child && !this.child.killed) return Promise.resolve()
    if (this.connecting) return this.connecting

    this.connecting = new Promise<void>((resolve, reject) => {
      const child = this.spawnFn(this.exePath, ['serve'], { windowsHide: true })
      this.child = child

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => this.onData(chunk))
      child.stderr.on('data', (chunk: Buffer) => {
        // surface stderr as console noise only
        process.stderr.write(`[vimina] ${chunk.toString()}`)
      })
      child.on('error', (err) => {
        this.child = null
        for (const [, cb] of this.pending) cb({ id: 0, ok: false, error: `Vimina 启动失败: ${err.message}` })
        this.pending.clear()
        reject(err)
      })
      child.on('exit', (code) => {
        this.child = null
        this.connecting = null
        for (const [, cb] of this.pending) cb({ id: 0, ok: false, error: `Vimina 已退出 (code=${code})` })
        this.pending.clear()
      })
      resolve()
    }).finally(() => {
      this.connecting = null
    })

    return this.connecting
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      try {
        const res = JSON.parse(line) as StdioResponse
        const cb = this.pending.get(res.id)
        if (cb) {
          this.pending.delete(res.id)
          cb(res)
        }
      } catch {
        // ignore malformed line
      }
    }
  }

  /** Send one request and await its matching response. */
  async call(method: string, params?: unknown, timeoutMs = 60000): Promise<StdioResponse> {
    await this.ensure()

    return new Promise<StdioResponse>((resolve, reject) => {
      if (!this.child) {
        reject(new Error('Vimina 未运行'))
        return
      }

      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Vimina 调用超时: ${method}`))
      }, timeoutMs)

      this.pending.set(id, (res) => {
        clearTimeout(timer)
        resolve(res)
      })

      const req: StdioRequest = { id, method, ...(params !== undefined ? { params } : {}) }
      try {
        this.child.stdin.write(JSON.stringify(req) + '\n')
      } catch (e) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new Error(`Vimina 写入失败: ${(e as Error).message}`))
      }
    })
  }

  dispose(): void {
    if (this.child && !this.child.killed) {
      try {
        this.child.stdin.write(JSON.stringify({ id: this.nextId++, method: 'exit' }) + '\n')
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (this.child && !this.child.killed) this.child.kill()
      }, 500).unref()
    }
  }
}

// ---------- tool helpers ----------

type ToolArgs = Record<string, unknown>

function textBlock(text: string) {
  return [{ type: 'text' as const, text }]
}

function mkTool(client: ViminaClient, timeoutMs: number, options: {
  name: string
  description: string
  parameters: ParameterSchemaSpec
  method: string
  mapArgs: (a: ToolArgs) => unknown
  /** 可选的返回增强：在调用成功后对 result 做合并/改写（如附加使用指南）。 */
  augment?: (result: unknown) => unknown
}) {
  return defineTool({
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    output: {
      schema: { type: 'object', additionalProperties: true } as never,
      render: (_args, value) => textBlock(JSON.stringify(value, null, 2)),
    },
    async execute(args: ToolArgs) {
      const res = await client.call(options.method, options.mapArgs(args), timeoutMs)
      if (!res.ok) throw new Error(`${options.method} 失败: ${res.error ?? '未知错误'}`)
      const result = res.result ?? {}
      return (options.augment ? options.augment(result) : result) as never
    },
  })
}

// ---------- plugin ----------

export function apply(ctx: Context, config: Config = {}): void {
  const exePath = config.exePath ?? 'Vimina.exe'
  const timeoutMs = config.timeoutMs ?? 60000
  const client = new ViminaClient(exePath)

  const tools = [
    mkTool(client, timeoutMs, {
      name: 'vimina_info',
      description: 'Vimina 能力自描述：返回版本、工具清单与【完整 AI 使用指南】（含各任务 playbook 与常见错误规避）。首次使用务必先调用本工具。',
      parameters: {},
      method: 'info',
      mapArgs: () => ({}),
      augment: (result) => ({ ...(result as object), tools: TOOL_NAMES, usageGuide: USAGE_GUIDE }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_getWindows',
      description: '列出当前所有可见窗口（标题/类名/句柄）。',
      parameters: {},
      method: 'getWindows',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_scan',
      description: '扫描前台窗口（或指定标题窗口）的控件，返回带标签的控件清单。注意：Chromium 浏览器的网页内容（播放器按钮、评论区、推荐列表等）在页面滚动后才暴露给 UIA；未滚动时通常只见浏览器框架控件。',
      parameters: {
        title: { type: 'string', description: '窗口标题（模糊匹配），留空扫前台窗口' },
        all: { type: 'boolean', description: 'true=全部控件，false=仅可交互控件' },
      },
      method: 'scan',
      mapArgs: (a) => ({ title: a.title ?? '', all: a.all === true }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_clickLabel',
      description: '按标签点击控件（需先在同一会话内用 vimina_scanByTitle 扫描该窗口生成标签映射；会话内未扫描或窗口已关闭会报错）。',
      parameters: {
        label: { type: 'string', required: true, description: '控件标签，如 DJ' },
        right: { type: 'boolean', description: '右键' },
        dbl: { type: 'boolean', description: '双击' },
      },
      method: 'clickLabel',
      mapArgs: (a) => ({ label: a.label, right: a.right === true, dbl: a.dbl === true }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_clickAt',
      description: '在屏幕坐标处点击。backend=true 用 FlaUI 后台点击（不移动鼠标，只对原生应用有效）；缺省/backend=false 为真实点击并激活窗口——浏览器网页必须用真实点击（缺省即可）。',
      parameters: {
        x: { type: 'integer', required: true, description: 'X 坐标' },
        y: { type: 'integer', required: true, description: 'Y 坐标' },
        right: { type: 'boolean', description: '右键' },
        dbl: { type: 'boolean', description: '双击' },
        backend: { type: 'boolean', description: '后台点击（不移动鼠标）' },
        window: { type: 'string', description: '目标窗口标题' },
      },
      method: 'clickAt',
      mapArgs: (a) => ({ x: a.x, y: a.y, right: a.right === true, dbl: a.dbl === true, backend: a.backend === true, window: a.window ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_input',
      description: '输入文本（可先激活指定窗口）。',
      parameters: {
        text: { type: 'string', required: true, description: '要输入的文本' },
        window: { type: 'string', description: '目标窗口标题' },
      },
      method: 'input',
      mapArgs: (a) => ({ text: a.text, window: a.window ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_key',
      description: '发送组合键（如 Ctrl+A / Alt+F4）。',
      parameters: {
        keys: { type: 'string', required: true, description: '按键组合，如 Ctrl+A' },
        window: { type: 'string', description: '目标窗口标题' },
      },
      method: 'key',
      mapArgs: (a) => ({ keys: a.keys, window: a.window ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_runVma',
      description: '执行一段 VMA 脚本，返回日志与变量（含 _return）。',
      parameters: {
        script: { type: 'string', required: true, description: 'VMA 脚本源码' },
      },
      method: 'runVma',
      mapArgs: (a) => ({ script: a.script }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_scroll',
      description: '滚动鼠标滚轮（先 moveMouse 悬停到目标区域上方再调用；delta 正数向上、负数向下）。',
      parameters: {
        delta: { type: 'integer', required: true, description: '滚动格数：正数向上滚，负数向下滚（如 -5）' },
      },
      method: 'runVma',
      mapArgs: (a) => ({ script: 'scroll ' + (a.delta as number) }), // 数值形式（scroll -5），避免 delta= 被当比较表达式
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_screenshot',
      description: '截取全屏并保存，返回图片路径。',
      parameters: {
        filename: { type: 'string', description: '可选文件名（默认自动）' },
      },
      method: 'screenshot',
      mapArgs: (a) => ({ filename: a.filename ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_getElement',
      description: '按名称在指定窗口查找控件（匹配 UIA Name，子串不区分大小写）。网页文本若不作为控件暴露则查不到，请配合 scan。',
      parameters: {
        name: { type: 'string', required: true, description: '控件名称' },
        window: { type: 'string', description: '窗口标题' },
      },
      method: 'getElement',
      mapArgs: (a) => ({ name: a.name, window: a.window ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_getControlAt',
      description: '查询屏幕坐标处的控件信息（返回该点面积最小的命中控件）。浏览器网页内层控件不暴露 UIA 时可能只返回外层容器。',
      parameters: {
        x: { type: 'integer', required: true },
        y: { type: 'integer', required: true },
        window: { type: 'string', description: '窗口标题' },
      },
      method: 'getControlAt',
      mapArgs: (a) => ({ x: a.x, y: a.y, window: a.window ?? undefined }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_activate',
      description: '激活指定标题的窗口到前台。',
      parameters: {
        title: { type: 'string', required: true, description: '窗口标题' },
      },
      method: 'activate',
      mapArgs: (a) => ({ title: a.title }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_moveMouse',
      description: '移动鼠标到指定坐标。',
      parameters: {
        x: { type: 'integer', required: true },
        y: { type: 'integer', required: true },
      },
      method: 'moveMouse',
      mapArgs: (a) => ({ x: a.x, y: a.y }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_drag',
      description: '从 (x1,y1) 拖拽到 (x2,y2)。',
      parameters: {
        x1: { type: 'integer', required: true },
        y1: { type: 'integer', required: true },
        x2: { type: 'integer', required: true },
        y2: { type: 'integer', required: true },
      },
      method: 'drag',
      mapArgs: (a) => ({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_scanByTitle',
      description: '按窗口标题扫描控件（并持久化标签映射，供 clickLabel 使用）。',
      parameters: {
        title: { type: 'string', required: true, description: '窗口标题（模糊匹配）' },
        all: { type: 'boolean', description: 'true=全部控件，false=仅可交互控件' },
      },
      method: 'scanByTitle',
      mapArgs: (a) => ({ title: a.title, all: a.all === true }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_keyDown',
      description: '按下某个键（保持按住，配合 keyUp 释放）。',
      parameters: {
        keys: { type: 'string', required: true, description: '按键名，如 Shift / Ctrl' },
      },
      method: 'keyDown',
      mapArgs: (a) => ({ keys: a.keys }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_keyUp',
      description: '释放之前按下的键。',
      parameters: {
        keys: { type: 'string', required: true, description: '按键名，如 Shift / Ctrl' },
      },
      method: 'keyUp',
      mapArgs: (a) => ({ keys: a.keys }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_getMousePos',
      description: '获取鼠标当前位置。',
      parameters: {},
      method: 'getMousePos',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_mouseDown',
      description: '在指定坐标按下鼠标键（保持按住）。',
      parameters: {
        button: { type: 'string', description: 'left/right/middle（默认 left）' },
        x: { type: 'integer', required: true },
        y: { type: 'integer', required: true },
      },
      method: 'mouseDown',
      mapArgs: (a) => ({ button: a.button ?? 'left', x: a.x, y: a.y }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_mouseUp',
      description: '在指定坐标释放鼠标键。',
      parameters: {
        button: { type: 'string', description: 'left/right/middle（默认 left）' },
        x: { type: 'integer', required: true },
        y: { type: 'integer', required: true },
      },
      method: 'mouseUp',
      mapArgs: (a) => ({ button: a.button ?? 'left', x: a.x, y: a.y }),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_vmaStatus',
      description: '查询 VMA 脚本引擎状态（是否在运行/暂停/行号）。',
      parameters: {},
      method: 'vmaStatus',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_vmaStop',
      description: '停止正在运行的 VMA 脚本。',
      parameters: {},
      method: 'vmaStop',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_vmaPause',
      description: '暂停正在运行的 VMA 脚本。',
      parameters: {},
      method: 'vmaPause',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_vmaResume',
      description: '恢复被暂停的 VMA 脚本。',
      parameters: {},
      method: 'vmaResume',
      mapArgs: () => ({}),
    }),
    mkTool(client, timeoutMs, {
      name: 'vimina_vmaLog',
      description: '获取最近一次 VMA 脚本执行的日志。',
      parameters: {},
      method: 'vmaLog',
      mapArgs: () => ({}),
    }),
  ]

  for (const tool of tools) ctx.tools.register(tool)

  // 插件卸载时终止 Vimina 子进程（Cordis effect 生命周期）。
  ctx.effect(() => () => client.dispose(), 'vimina.client')
}