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
| `vimina_screenshot` | screenshot | 截图并返回路径 |

## 安装与挂载

前置：已构建 Vimina（`dotnet build`），或下载发布版拿到 `Vimina.exe`。

1. 把本目录复制到 DSH 能解析的位置（或作为 npm 包安装），`npm install`。
2. 用 patch 挂载：

```bash
dsh web --patch path/to/dsh-plugin/cordis.yml
```

3. 修改 `cordis.yml` 里的 `exePath` 指向你的 `Vimina.exe`。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `exePath` | `Vimina.exe` | Vimina 可执行文件路径 |
| `timeoutMs` | 60000 | 单次工具调用超时 |

## 开发与测试

```bash
cd dsh-plugin
npm install
npx tsc              # 类型检查 + 编译到 lib/

# 单元测试（不依赖真实 Vimina 进程，用 mock 验证协议逻辑）
node --experimental-strip-types test/client-unit.ts

# 插件加载测试（验证工具注册与结构；真实 spawn 需在无沙箱环境）
node --experimental-strip-types test/plugin-test.ts
```

> 注意：`plugin-test.ts` 会真实 spawn Vimina 执行工具，在受限沙箱里会被 EPERM 拦截
> （判定为 SKIP）；在正常 DSH 环境可直接跑通。

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
  滚动（`vimina_scroll` / `vimina_key` PageDown / End）后再 scan，才能看到播放器按钮、
  评论区、右侧推荐列表等网页控件。
- **点击网页必须用真实点击**：`vimina_clickAt` 缺省（backend=false）就是真实点击并激活窗口，
  浏览器场景下不要用 `backend:true`（FlaUI 后台点击对 Chromium 网页无效）。
- **`vimina_getControlAt` 对网页多返回外层容器**：网页内层控件不暴露 UIA 时，坐标命中
  的往往是页面容器而非精确控件，以 `vimina_scan` 为准。
- **评论文本多以表情/按钮形式暴露**：B站评论区可见的是表情（如 `[星幕回响_开心]`）、
  点赞数、回复按钮等控件；折叠评论可点击"点击查看"展开后再 scan。

## 说明

- 插件懒启动 Vimina 子进程，插件卸载时自动关闭（`ctx.effect`）。
- `ViminaClient` 已导出并支持注入 `spawnFn`，便于单元测试。
- 环境变量 `VIMINA_API_PORT` / `VIMINA_API_TOKEN` 可在 spawn 时注入。
- ⚠️ 不要在 `dsh-plugin/node_modules` 里放跨盘 junction（会破坏 Vimina 的 MSBuild `**/*.xaml` glob）。
