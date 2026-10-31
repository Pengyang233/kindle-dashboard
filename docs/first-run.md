# 设备准备与首次运行

这份指南从 Kindle 的运行条件开始，带你把 Mac 服务和 Kindle 客户端连起来，并确认看板确实显示在设备上。

目前唯一完成实机验证的组合是 Kindle Paperwhite 4、固件 `5.18.1.1.1`、KUAL 和 FBInk。其他机型、固件和启动器尚未验证。本项目不包含越狱步骤，也不会自动启动 Kindle 客户端。

## 1. 准备 Kindle

先确认 Kindle 的具体型号和固件版本。若设备还没有越狱，使用 [KindleModding 越狱向导](https://kindlemodding.org/jailbreak-wizard.html)检查对应设备当前可用的流程。越狱方法会随机型和固件变化；向导没有提供适用方案时，不要照搬其他机型的旧步骤。

本项目的已验证启动方式需要 KUAL 和一个可执行的 FBInk。安装资料可从 [MobileRead 的 KUAL 说明](https://wiki.mobileread.com/wiki/KUAL)、[KUAL 主题](https://www.mobileread.com/forums/showthread.php?t=203326)以及 [FBInk 上游项目](https://github.com/NiLuJe/FBInk)查找。FBInk 的 Kindle 二进制文件也由其 [Kindle 主题](https://www.mobileread.com/forums/showthread.php?t=299620)提供。请按自己的设备和固件选择对应版本；这些是上游组件，不属于本项目发行包。

若上游指南为你的设备推荐了不同的启动器，本项目尚未在该启动器上验证。先完成设备自己的准备和恢复说明，再继续本指南。

## 2. 配置并启动 Mac 服务

Mac 需要 Node.js 22.13+ 和 Google Chrome。

在 Mac 上安装依赖并创建本地配置：

```sh
git clone https://github.com/Pengyang233/kindle-dashboard.git
cd kindle-dashboard
npm ci
npm run setup-local
```

编辑 `.env.local`：

- 设置天气城市、时区和经纬度。经纬度会发送给 [Open-Meteo](https://open-meteo.com/en/docs)；如果不需要精确到住址，可以使用附近城市或区域的坐标。
- 将 `HOST` 设为 `0.0.0.0`，让 Kindle 能通过局域网连接到 Mac。不要把 `8787` 端口转发到公网。
- `DASHBOARD_DEVICE_ID` 和 `DASHBOARD_DEVICE_TOKEN` 稍后要与 Kindle 的 `config.sh` 一致。`npm run setup-local` 会生成令牌和控制页密码；不要把 `.env.local` 发到仓库或公开问题里。
- 若要从 Mac 的局域网地址打开控制页，在 `DASHBOARD_CONTROL_ORIGINS` 中保留默认值，并追加完整来源，例如 `http://<Mac 局域网 IP>:8787`。这个设置只约束浏览器控制请求，不会加密 HTTP 或替代账号验证；详见[安全模型](security-model.md)。

暂存 Kindle 客户端并启动服务：

```sh
npm run stage-client-release
npm start
```

先在 Mac 上确认：

- `http://127.0.0.1:8787/health` 返回 `ok`。
- `http://127.0.0.1:8787/render` 能显示看板画面。
- `http://127.0.0.1:8787/control` 能用 `.env.local` 中的控制页凭据打开。

首次验证时让 `npm start` 保持运行。通过后再按 [README 的说明](../README.md#启动-mac-服务)选择是否安装 macOS 登录后启动服务。

## 3. 安装 Kindle 客户端并创建设备配置

从[最新 Release](https://github.com/Pengyang233/kindle-dashboard/releases/latest)下载 `kindle-dashboard-vX.Y.Z.zip`，不要下载 GitHub 自动生成的 `Source code` 压缩包。

用 USB 连接 Kindle，把压缩包里的整个 `kindle-dashboard` 文件夹复制到 Kindle 磁盘的 `extensions` 文件夹下。最终目录应为：

```text
extensions/kindle-dashboard/
```

在 Kindle 磁盘上的这个目录中，将 `config.example.sh` 复制为 `config.sh`，并设置：

```sh
DASHBOARD_BASE_URL="http://<Mac 局域网 IP>:8787"
DEVICE_ID="pw4"
DEVICE_TOKEN="<与 Mac .env.local 中 DASHBOARD_DEVICE_TOKEN 相同>"
AUTO_UPDATE_ON_START=0
```

请把尖括号中的内容换成自己的值。`DASHBOARD_BASE_URL` 必须使用 Mac 在局域网中的地址；`127.0.0.1` 和 `localhost` 会指向 Kindle 自己。`DEVICE_ID` 必须和 Mac 的 `DASHBOARD_DEVICE_ID` 一致。第一次验证期间保持 `AUTO_UPDATE_ON_START=0`。

`config.sh` 只放在 Kindle 磁盘上，不要放进项目工作目录、提交记录或公开发行包。完成后安全弹出 Kindle 并拔掉 USB。

## 4. 先做离线显示检查

在 Kindle 上打开 KUAL → `Kindle Dashboard` → `诊断：显示内置测试图`。屏幕应完整刷新一次并显示内置样例画面。这个动作不访问 Mac 服务，也不修改休眠或开机启动设置。

如果样例画面没有显示，先按[离线显示检查说明](../kindle/SMOKE-TEST.md)排查 KUAL、FBInk 和本地日志；暂时不要继续排查网络连接。

## 5. 启动看板并确认连接

确认 Mac 服务仍在运行，Kindle 已连接到能访问 Mac 的可信 Wi-Fi。不要使用访客网络或开启了设备隔离的 Wi-Fi。

在 KUAL 中选择 `启动长期看板`。成功时 Kindle 会显示 Mac 生成的当前画面；在 Mac 打开 `/control` 后，“最后连接”应更新为 Kindle 最近一次心跳时间。

如果 Kindle 显示的还是旧画面，先确认 `.env.local` 的 `HOST=0.0.0.0`、Kindle 的 `DASHBOARD_BASE_URL` 使用了 Mac 当前局域网 IP、Mac 防火墙允许本地连接，以及设备令牌和 ID 两端一致。完整网络边界见[安全模型](security-model.md)。

## 日常使用、更新与停止

- 日常启动和停止都在 KUAL 中手动进行：`启动长期看板`、`立即刷新（运行中）`、`停止并恢复 Kindle 界面`。看板不会在 Kindle 开机时自动运行。
- 更新自托管的 Kindle 客户端时，先在 Mac 更新项目文件（例如 `git pull`；依赖有变化时运行 `npm ci`）。若改过 Kindle 端分发文件，同时提高 `kindle/kindle-dashboard/VERSION` 和 `config.xml` 的版本号。运行 `npm run stage-client-release` 后重启 Mac 服务：若从终端运行，按 `Ctrl-C` 再执行 `npm start`；若使用 launchd，再运行 `./scripts/install-macos-service.sh`。然后在 KUAL 中选择 `检查并安装 Wi-Fi 更新`。
- Wi-Fi 更新只应在可信局域网内使用。当前连接使用 HTTP；SHA-256 和文件大小校验可发现传输损坏，但不能证明文件由谁发布。也可以按新 Release 的说明通过 USB 更新。
- 卸载前先在 KUAL 选择 `停止并恢复 Kindle 界面`，然后通过 USB 删除 Kindle 磁盘上的 `extensions/kindle-dashboard`。若 Mac 上安装过 launchd 服务，可运行 `./scripts/uninstall-macos-service.sh`。

## 排错和反馈

| 现象 | 先检查 |
| --- | --- |
| 内置测试图没有显示 | KUAL 是否能打开扩展、FBInk 是否已安装、`extensions/kindle-dashboard/dashboard.log` 中的错误。具体步骤见[离线显示检查](../kindle/SMOKE-TEST.md)。 |
| 测试图正常，但看板无法连接 | Mac 服务是否运行、Kindle 和 Mac 是否在同一可互通的 Wi-Fi、`HOST` 和 `DASHBOARD_BASE_URL` 是否正确、防火墙是否允许连接、设备 ID 和令牌是否一致。 |
| 看板启动后 Kindle 原生界面没有恢复 | 在 KUAL 选择 `停止并恢复 Kindle 界面`；如果设备没有响应，重启 Kindle 可恢复系统界面。 |

KUAL 的 `上传诊断日志` 会把日志发送到你配置的 Mac 服务，并保存在项目运行目录的 `runtime/device-logs/` 下；它不是发到 GitHub。该上传也经过 HTTP，只在自己的可信局域网内使用。日志可能包含时间、局域网地址或请求 URL；对外分享前先检查并脱敏。不要分享 `.env.local`、设备 `config.sh`、令牌、密码或精确天气坐标。

提交问题时请写 Kindle 型号和固件、macOS 与 Node.js 版本、复现步骤，以及你已经检查过的项目。更多安全边界见[安全模型](security-model.md)。
