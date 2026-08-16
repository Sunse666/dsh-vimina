# dsh-vimina — DeepSeek Harness Cordis 插件

把 [Vimina](https://github.com/Sunse666/Vimina) 的 Windows GUI 自动化能力注册为 DSH 原生工具，
模型可直接调用扫描/点击/输入/按键/脚本/截图/窗口/鼠标/VMA 引擎控制等能力，无需视觉模型。
（Vimina 为独立项目：基于 .NET 8 的 Windows GUI 自动化服务，提供 `Vimina.exe serve` stdio 入口。）

## 工作原理

插件通过 stdio 驱动 Vimina 的常驻服务（`Vimina.exe serve`，行分隔 JSON-RPC：
一行 `{"id",method,params}` 请求 → 一行 `{"id",ok,result,error}` 响应），
把每个方法映射成 `ctx.tools` 上的一个工具。

## 工具清单（26 个，模型可见）

### 窗口 / 扫描
| 工具 | 底层方法 | 说明 |
|---|---|---|
| `vimina_getWindows` | getWindows | 列出窗口 |
| `vimina_scan` | scan | 扫描前台窗口控件 |
| `vimina_scanByTitle` | scanByTitle | 按标题扫描控件（并持久化标签） |
| `vimina_getElement` | getElement | 按名称查控件 |
| `vimina_getControlAt` | getControlAt | 查坐标处控件 |
| `vimina_activate` | activate | 激活窗口 |

### 点击 / 鼠标
| 工具 | 底层方法 | 说明 |
|---|---|---|
| `vimina_clickLabel` | clickLabel | 按标签点击 |
| `vimina_clickAt` | clickAt | 坐标/后台点击（浏览器网页必须用真实点击，缺省 backend 即可） |
| `vimina_scroll` | runVma(scroll) | 滚轮滚动（delta 正上负下） |
| `vimina_getMousePos` | getMousePos | 获取鼠标位置 |
| `vimina_moveMouse` | moveMouse | 移动鼠标 |
| `vimina_drag` | drag | 拖拽 |
| `vimina_mouseDown` | mouseDown | 按下鼠标键 |
| `vimina_mouseUp` | mouseUp | 释放鼠标键 |

### 键盘
| 工具 | 底层方法 | 说明 |
|---|---|---|
| `vimina_input` | input | 输入文本 |
| `vimina_key` | key | 组合键（Ctrl+A 等） |
| `vimina_keyDown` | keyDown | 按住键 |
| `vimina_keyUp` | keyUp | 释放键 |

### 脚本 / 引擎
| 工具 | 底层方法 | 说明 |
|---|---|---|
| `vimina_runVma` | runVma | 执行 VMA 脚本（返回变量与日志） |
| `vimina_vmaStatus` | vmaStatus | 引擎状态 |
| `vimina_vmaStop` | vmaStop | 停止脚本 |
| `vimina_vmaPause` | vmaPause | 暂停脚本 |
| `vimina_vmaResume` | vmaResume | 恢复脚本 |
| `vimina_vmaLog` | vmaLog | 脚本日志 |

### 其它
| 工具 | 底层方法 | 说明 |
|---|---|---|
| `vimina_info` | info | 能力自描述 |
| `vimina_screenshot` | screenshot | 截图并返回路径（默认全屏；可传 x/y/w/h 只截区域，识图更快更省 token） |

## 安装与挂载

作为 DSH profile 依赖安装（推荐，注册即用，见下），或：

1. 安装依赖：`npm install`（或先 `npm run build` 生成 `lib/`）。
2. 用 patch 挂载：

```bash
dsh web --patch path/to/dsh-vimina/cordis.yml
```

**通常无需手动配置路径**：插件按以下优先级自动解析 `Vimina.exe`（详见"配置"）。

### 作为 DSH profile 插件安装（推荐）

1. 在你的 DSH profile 目录（如 `$DSH_HOME/profiles/web`）执行：
   ```bash
   dsh plugin --profile web add <包名或本地路径>
   ```
   （或直接往 `package.json` 的 `dependencies` 加 `"dsh-vimina": "<包名或路径>"` 后 `pnpm install`，并把 `dsh-vimina` 加入 `dsh.profile.bundles`。）
2. 插件声明了 `dsh.bundle.patch`，加载器会自动插入 `vimina` 条目。
3. 重启 DSH web，设置 → 插件 → vimina 可看到 26 个工具与配置项。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `exePath` | 自动解析 | Vimina 可执行文件路径 |
| `timeoutMs` | 60000 | 单次工具调用超时 |

`exePath` 解析优先级：

1. **显式配置**：DSH web 设置 → 插件 → vimina（推荐），或 profile 的 `cordis.patch.yml`、`--patch` 补丁
2. **环境变量** `VIMINA_EXE`
3. **自动探测**常见安装位置（`%LOCALAPPDATA%\Programs\Vimina\Vimina.exe`、`%ProgramFiles%\Vimina\Vimina.exe`、`%ProgramFiles(x86)%\Vimina\Vimina.exe`、当前目录）
4. **回退**：PATH 上的 `Vimina.exe`

只要 `Vimina.exe` 在以上任一位置，就无需手动填写路径；启动失败时工具会返回明确的配置指引。

## 区域截图

`vimina_screenshot` 默认全屏；传 `x / y / w / h` 只截指定区域（坐标相对屏幕左上角）：

| 参数 | 类型 | 说明 |
|---|---|---|
| `filename` | string | 可选，保存文件名（默认自动生成） |
| `x` / `y` | integer | 区域左上角坐标（可选） |
| `w` / `h` | integer | 区域宽度 / 高度（可选） |

- 未传 `x/y/w/h` 时行为不变（全屏，完全兼容旧用法）。
- 区域越界时自动夹取到屏幕边界内（右/下超出部分被裁掉）。
- 返回结果含实际捕获信息（`x` / `y` / `width` / `height`），便于核对落盘文件尺寸。
- **用途**：只需识别局部（如视频封面、按钮、某块区域文字）时直接截取目标区域，
  图像越小视觉识别越快、消耗 token 越少。
- VMA 脚本内同样支持：`screenshot 文件名 x y w h`（语句形式）或
  `screenshot("文件名", x, y, w, h)`（函数形式）。

示例：

```js
vimina_screenshot({ filename: 'cover.png', x: 100, y: 200, w: 400, h: 300 })
```

## 开发与测试

```bash
cd dsh-vimina
npm install
npx tsc              # 类型检查 + 编译到 lib/

# 单元测试（不依赖真实 Vimina 进程，用 mock 验证协议逻辑）
node --experimental-strip-types test/client-unit.ts

# 插件加载测试（验证工具注册与结构；真实 spawn 需在无沙箱环境）
node --experimental-strip-types test/plugin-test.ts
```

真实设备测试（需要本机 Vimina.exe）通过环境变量指定可执行文件：

```bash
# PowerShell
$env:VIMINA_EXE = 'C:\path\to\Vimina.exe'
node --experimental-strip-types test/e2e-real.ts
node --experimental-strip-types test/full-coverage.ts 5
```

> `VIMINA_EXE` 未设置时回退为 `'Vimina.exe'`（按 PATH 查找）；
> `plugin-test.ts` 在受限沙箱里会被 EPERM 拦截（判定为 SKIP），在正常 DSH 环境可直接跑通。
> 请勿在提交的代码/配置里写死本机绝对路径。

## AI 使用指南（注入 vimina_info）

插件把完整的使用 playbook 与常见错误规避表打包为 `usageGuide` 字段，随
`vimina_info` 工具返回注入给模型（源码见 `src/usage.ts`）。模型首次使用前应先调用
`vimina_info` 获取指南。指南要点：

- **先扫描后操作**：任何操作前先 `vimina_scan`，控件带标签（DJ/AK），点击用中心坐标。
- **浏览器必须真实点击**：`vimina_clickAt` 缺省 backend（真实点击）；网页禁用 backend:true。
- **网页内容滚动后才暴露 UIA**：先 `vimina_scroll` / `vimina_key`(PageDown|End) 再 scan。
- **无需视觉模型**：scan/getElement 直接返回文本控件名，不要依赖 OCR/截图读内容。
- **标签临时性**：clickLabel 依赖最近一次 scan 的映射，操作前重新扫描。
- 分任务 playbook：浏览网页 / 桌面应用 / 后台点击 / VMA 脚本，详见 info 返回。

## 浏览器（Chromium）使用注意事项

真实使用中验证过的经验，模型在操作浏览器页面时请遵循：

- **网页内容要滚动后才暴露给 UIA**：打开页面后先 `vimina_scan` 只能看到浏览器框架控件；
  滚动（`vimina_scroll` / `vimina_key` PageDown / End）后再 scan，才能看到网页控件。
- **点击网页必须用真实点击**：`vimina_clickAt` 缺省（backend=false）就是真实点击并激活窗口，
  浏览器场景下不要用 `backend:true`（FlaUI 后台点击对 Chromium 网页无效）。
- **`vimina_getControlAt` 对网页多返回外层容器**：网页内层控件不暴露 UIA 时，坐标命中
  的往往是页面容器而非精确控件，以 `vimina_scan` 为准。
## 说明

- 插件懒启动 Vimina 子进程，插件卸载时自动关闭（`ctx.effect`）。
- `ViminaClient` 已导出并支持注入 `spawnFn`，便于单元测试。
- 环境变量 `VIMINA_API_PORT` / `VIMINA_API_TOKEN` 可在 spawn 时注入。
