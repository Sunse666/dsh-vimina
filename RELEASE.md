# 发布指南（dsh-vimina）

## 0. 前提

- 已在 `D:\IO\dotnet\dsh-vimina`（git 仓库已 init 并提交首版）。
- 替换占位符：`package.json` 中 `repository.url` 的 `<your-github-name>`、`README.md` 中的 Vimina 仓库链接。

## 1. 本地验证（发布前）

```powershell
cd D:\IO\dotnet\dsh-vimina
npm install
npm run build    # 产物 lib/index.js + lib/types
npm test
npm pack --dry-run   # 检查发布内容
```

## 2. 推送 GitHub

```powershell
cd D:\IO\dotnet\dsh-vimina
git remote add origin https://github.com/<your-github-name>/dsh-vimina.git
git push -u origin master
```

## 3. GitHub 话题（网页操作）

仓库 About → 设置齿轮 → Topics 添加 `dsh-plugin`。

## 4. 发布 npm（可选）

```powershell
cd D:\IO\dotnet\dsh-vimina
npm login
npm publish       # prepublishOnly 自动 build
npm version patch # 后续更新
git push --follow-tags
npm publish
```

## 5. 安装到 DSH

```bash
npm i dsh-vimina
# 或本地 patch：
dsh web --patch path/to/dsh-vimina/cordis.yml
```
改 `cordis.yml` 的 `exePath` 指向你的 `Vimina.exe`。

## 发布前敏感检查

- `cordis.yml` 的 `exePath` 是开发机绝对路径（`D:\IO\...\Vimina.exe`）——发布前改为相对路径或占位符，避免暴露本机目录结构。
- test 脚本中的 exePath 同理（仅本地开发用）。
- 仓库不含任何 token / 密钥 / 运行时数据（config.yaml、label_map.json 等）。
