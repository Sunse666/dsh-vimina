// Vimina 插件的 AI 使用指南：模型可见的 playbook 与常见错误规避。
// 通过 vimina_info 工具的返回注入，模型调用 info 即可获得正确用法。

export const TOOL_NAMES = [
  'vimina_info', 'vimina_getWindows', 'vimina_scan', 'vimina_scanByTitle',
  'vimina_getElement', 'vimina_getControlAt', 'vimina_activate',
  'vimina_clickLabel', 'vimina_clickAt', 'vimina_scroll', 'vimina_getMousePos',
  'vimina_moveMouse', 'vimina_drag', 'vimina_mouseDown', 'vimina_mouseUp',
  'vimina_input', 'vimina_key', 'vimina_keyDown', 'vimina_keyUp',
  'vimina_runVma', 'vimina_vmaStatus', 'vimina_vmaStop', 'vimina_vmaPause',
  'vimina_vmaResume', 'vimina_vmaLog', 'vimina_screenshot',
] as const

export const USAGE_GUIDE = `# Vimina 使用指南（AI 代理必读）

## 核心原则
1. **先扫描后操作**：任何操作前先 vimina_scan（或 vimina_scanByTitle）确认前台窗口与控件；
   scan 返回带标签（如 DJ/AK）的控件清单，含名称/类型/坐标/尺寸。
2. **点击优先用控件中心坐标**：控件有 x/y/width/height，点击取其中心 (x+width/2, y+height/2)。
3. **浏览器（Chromium）特殊规则**：
   - 网页内容（播放器按钮、评论区、推荐列表等）**滚动后才暴露给 UIA**：先
     vimina_scroll / vimina_key(PageDown|End) 滚动，再 vimina_scan 才能看到网页控件。
   - 网页点击**必须真实点击**：vimina_clickAt 缺省 backend（即 backend=false）就是真实点击
     并激活窗口；**不要对网页用 backend:true**（FlaUI 后台点击对 Chromium 网页无效）。
   - vimina_getControlAt 在网页场景多返回外层容器，以 vimina_scan 清单为准。
4. **无需视觉模型**：scan/getElement 直接返回文本控件名（如"播放/暂停"、"回复"、表情名），
   不要依赖 OCR 或截图读内容；截图仅用于人工核对。
5. **标签是临时的**：clickLabel 依赖最近一次 scan/scanByTitle 生成的标签映射，操作前请重新扫描。

## 分任务 Playbook

### A. 浏览视频网站 / 网页
1. vimina_getWindows → 确认目标浏览器窗口在前台（标题匹配）。
2. vimina_scan → 观察框架控件；若要网页内容，先滚动。
3. 滚动：vimina_moveMouse 悬停内容区 + vimina_scroll delta=-N（负数向下）→ vimina_scan 看新控件。
4. 打开视频/链接：vimina_clickAt 真实点击控件中心（缺省 backend）。
5. 读取评论区：滚动到底（vimina_scroll 或 vimina_key End）→ vimina_scan 观察评论区控件
   （点赞、回复按钮等）；正文文字未必暴露为控件，必要时配合截图读取。
6. 回顶部：vimina_key Home。

### B. 桌面应用自动化
1. vimina_scanByTitle "记事本" → 拿标签映射。
2. vimina_clickLabel DJ（按标签点）或 vimina_clickAt 坐标。
3. vimina_input / vimina_key 输入或按键。
4. vimina_getElement "保存" 按名定位控件。

### C. 后台点击（仅原生窗口）
- vimina_clickAt backend=true window="窗口标题"（不移动鼠标、不抢前台；只对原生应用有效）。

### D. 运行 VMA 脚本
1. vimina_runVma script="..." → 返回日志与变量（含 _return）。
2. vimina_vmaStatus / vimina_vmaPause / vimina_vmaResume / vimina_vmaStop / vimina_vmaLog
   控制与查看脚本引擎。

## 常见错误与规避
| 错误用法 | 后果 | 正确做法 |
|---|---|---|
| 浏览器网页用 backend:true 点击 | 点击无效 | 缺省 backend 真实点击 |
| 未滚动就 scan 网页 | 只见浏览器框架，无网页控件 | 先滚动再 scan |
| clickLabel 未先 scanByTitle | 报错拒绝点击（防旧映射点错） | 先 vimina_scanByTitle 同一窗口再 clickLabel |
| 脚本写无限循环/长 sleep | stdio 通道阻塞，vmaStop 排队 | 脚本必须能自终止；避免 while(1)/超长 sleep |
| x = myFunc(...) 赋函数返回值 | 得字面字符串（引擎仅支持 return 协议） | 用 "myFunc(...)\n_return = _ 读返回值" 或 _return 协议 |
| scroll delta=-5 无效 | 被当比较表达式求值为 0 | 用 vimina_scroll 工具（已处理 delta=）或 VMA scroll -5 |
| 条件里用非 windowexists/active/length 函数 | 不求值 | 条件仅支持 windowexists/windowactive/length |
| 插件使用期间开着 Vimina 标记模式(Alt+F) | 全局键盘钩子可能吞 input/key 合成按键 | 插件使用期间关闭标记模式 |
| 网页场景用 getControlAt | 返回外层容器 | 用 vimina_scan 拿控件清单 |
| 不激活窗口直接 input/key | 输入到错误窗口 | 带 window 参数或先 vimina_activate |
| getElement 查网页纯文本 | 查不到（文本不暴露为控件） | 用 scan 看已暴露控件 |
`
