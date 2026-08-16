/**
 * 真实设备测试用 Vimina 可执行文件路径。
 * 复用插件自身的 resolveExePath（VIMINA_EXE 环境变量 → 自动探测 → PATH），
 * 仓库内不写死任何机器本地路径。
 */
import { resolveExePath } from '../src/index.ts'

export const VIMINA_EXE = resolveExePath()
