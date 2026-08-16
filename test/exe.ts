/**
 * 真实设备测试用的 Vimina 可执行文件路径。
 * 从环境变量 VIMINA_EXE 解析；未设置时回退到 PATH 上的 'Vimina.exe'。
 * 仓库内不写死任何机器本地路径。
 */
export const VIMINA_EXE = process.env.VIMINA_EXE ?? 'Vimina.exe'
