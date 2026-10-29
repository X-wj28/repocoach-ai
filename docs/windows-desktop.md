# RepoCoach Windows 桌面版

[下载 RepoCoach-Setup-1.0.0.exe](https://github.com/X-wj28/repocoach-ai/releases/download/desktop-v1.0.0/RepoCoach-Setup-1.0.0.exe) · [GitHub 发布页](https://github.com/X-wj28/repocoach-ai/releases/tag/desktop-v1.0.0)

![RepoCoach 图标](../apps/desktop/assets/repocoach.png)

安装包参考医健通的桌面安装与快捷方式体验，采用 **RepoCoach** 名称和网页已有的深青色圆角星光图标。按本次选择，程序直接连接已部署的线上工作台，免去本机服务器、数据库和模型密钥配置。

## 安装与打开

1. 下载并双击 `RepoCoach-Setup-1.0.0.exe`。
2. 按中文向导完成安装，默认安装到当前用户的 `%LOCALAPPDATA%\Programs\RepoCoach`，不需要管理员权限。
3. 双击桌面或开始菜单中的 **RepoCoach**。完成安装时也可以直接打开。

程序优先使用 Edge 或 Chrome 的独立应用窗口；未找到时打开系统默认浏览器。网站登录、训练、草稿和报告功能继续由现有线上项目提供。使用时需要联网，Render 免费实例首次访问可能需要几十秒唤醒。

支持 Windows 10/11，需要可用的浏览器和系统自带的 .NET Framework 4.x。安装包仅含启动程序、图标、说明、许可证及卸载程序，不包含 `.env`、数据库连接或服务端密钥。当前发行包未使用商业代码签名证书，Windows 可能显示“未知发布者”。

## 卸载与数据

在 Windows **设置 → 应用 → RepoCoach → 卸载**，或选择开始菜单中的 **卸载 RepoCoach**。卸载仅移除应用与快捷方式，云端账号和训练历史继续保留；用户自行放入安装目录的其他文件也会保留。网页登录状态和本机草稿由浏览器管理。

## 构建与验证

安装包源码位于 `apps/desktop`，使用 Windows 自带的 C# 编译器生成无控制台启动程序，再使用 NSIS 生成安装和卸载向导。程序不携带独立浏览器运行时。ICO 包含 16、24、32、48、64、128 和 256 像素图像，快捷方式和可执行文件共用该图标。

需要 Windows、Node.js 22 和 NSIS 3.x。可把 `makensis.exe` 加入 PATH，或设置 `NSIS_MAKENSIS` 为它的完整路径：

```powershell
$env:NSIS_MAKENSIS = 'C:\Program Files (x86)\NSIS\makensis.exe'
npm run desktop:build
npm run desktop:test
```

成品写入 `dist/desktop/RepoCoach-Setup-1.0.0.exe` 和 `dist/desktop/SHA256SUMS.txt`。打包不需要数据库、模型或项目服务端环境变量。构建目录位于 Git 忽略的 `data/desktop-build`。

`desktop:test` 在未安装 RepoCoach 的账号下运行：使用项目 `data` 内包含空格的隔离目录，验证安装、注册信息、名称与版本、启动器指向、浏览器检测、重复安装和卸载。测试不创建桌面快捷方式、不启动浏览器，卸载后保留检查日志与测试用户文件。

如需重新生成图标，安装现有 Web 测试使用的 Chrome/Edge 后执行 `npm run desktop:icons`；它只渲染仓库内的品牌 SVG，不调用远程图片服务。

[Windows installer 工作流](../.github/workflows/desktop.yml)会在 Windows runner 构建和验证，保留安装包与校验文件作为构建产物。公开发行的 EXE 放入 GitHub Release，安装器源码和品牌素材放入仓库。

校验下载文件：

```powershell
Get-FileHash .\RepoCoach-Setup-1.0.0.exe -Algorithm SHA256
```

将结果与同一发布页的 `SHA256SUMS.txt` 比较。图标沿用现有 Lucide Sparkles，第三方授权随安装包提供。
