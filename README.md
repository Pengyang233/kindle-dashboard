# Kindle Dashboard

Kindle Dashboard 在 Mac mini 上获取天气并生成适合 Kindle Paperwhite 4 的 `1072×1448` PNG。越狱 Kindle 通过 Wi-Fi 下载图片，再由 FBInk 显示；页面渲染和数据请求都留在 Mac 上。

## 发布状态

仓库版本 `1.0.6` 是公开源码快照，尚未在真实 Kindle 上验证，也不是稳定设备版。原始 `1.0.5` 的真实设备使用经历仅是历史记录，不代表 `1.0.6` 已经过硬件验证。设备更新和部署迁移暂缓；请先把当前版本当作需要自行审查的源码。

项目面向已越狱的 Paperwhite 4、KUAL 和 FBInk。Kindle 启动保持手动：复制客户端后，在 KUAL 中选择启动。Mac 渲染器需要 Node.js 22.13+ 和 Google Chrome。自动化构建运行在 Ubuntu 上只验证源码、脚本与 ZIP，不表示服务或 Kindle 客户端兼容 Linux。PNG 的视觉检查在本地 Mac 完成。

## Mac 服务

安装依赖并初始化本机配置：

```sh
npm ci
npm run setup-local
npm run stage-client-release
```

编辑本机忽略文件 `.env.local`，填写天气纬度和经度。示例城市为 `Example`，坐标留空；请换成自己的天气设置。Open-Meteo 会收到这些坐标以返回天气数据。

```sh
npm start
```

默认只监听本机的 `127.0.0.1:8787`。预览地址为 `http://127.0.0.1:8787/render`；控制页为 `http://127.0.0.1:8787/control`，需要 HTTP Basic 凭据。`npm run setup-local` 在 `.env.local` 中生成本地设备令牌和管理员密码，不会在终端显示凭据。

若 Kindle 或浏览器需要从局域网访问服务，编辑 `.env.local`，将 `HOST` 设为 `0.0.0.0`，并把 `DASHBOARD_CONTROL_ORIGINS` 改为浏览器实际使用的完整来源，例如 `http://192.0.2.10:8787`。`192.0.2.10` 是文档示例，部署时请替换为 Mac 的局域网地址。仅在可信局域网内使用；不要把端口转发到公网，也不要假设项目提供公共服务器。

在 macOS 上安装 launchd 服务：

```sh
./scripts/install-macos-service.sh
```

卸载服务：

```sh
./scripts/uninstall-macos-service.sh
```

服务仍由本机启动的进程读取仓库根目录中的 `.env.local`。不要把其中的令牌或密码写入 plist、提交到 Git 或打包进客户端。

### 配置项

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `DASHBOARD_CITY` | 画面显示的城市名 | `Example` |
| `DASHBOARD_TIMEZONE` | 日期和时间使用的时区 | `Asia/Shanghai` |
| `WEATHER_LATITUDE`、`WEATHER_LONGITUDE` | Open-Meteo 查询坐标 | 空，需填写 |
| `HOST`、`PORT` | 监听地址和端口 | `127.0.0.1`、`8787` |
| `CLIENT_DISTRIBUTION_DIR` | 固定客户端更新快照目录，由暂存工具写入本地配置 | 暂存后生成 |
| `DASHBOARD_DEVICE_ID` | 设备标识 | `pw4` |
| `DASHBOARD_DEVICE_TOKEN` | Kindle 请求图片、设备控制和日志接口的令牌 | 初始化时生成 |
| `DASHBOARD_ADMIN_USER`、`DASHBOARD_ADMIN_PASSWORD` | 控制页 HTTP Basic 凭据 | `admin`、初始化时生成密码 |
| `DASHBOARD_CONTROL_ORIGINS` | 控制请求允许的完整来源列表，以逗号分隔 | 本机地址和 `localhost` |

所有配置名也列在 [.env.example](.env.example) 中。`npm run setup-local` 不会覆盖已有 `.env.local`。

## Kindle 客户端

生成客户端 ZIP：

```sh
./scripts/build-kindle-package.sh
```

把 ZIP 中的 `kindle-dashboard` 目录复制到 Kindle 的 `extensions` 目录。ZIP 包含 `config.example.sh`，不包含设备私有的 `config.sh`。在 Kindle 上手动复制示例文件并命名为 `config.sh`，再填写 Mac 服务地址、设备 ID 和与 `DASHBOARD_DEVICE_TOKEN` 一致的令牌。不要提交真实配置。KUAL 启动入口保持手动，不启用开机自启。

客户端更新清单仍限定为 17 个文件，并逐个比较 SHA-256 和文件大小；`config.sh` 不在更新清单内。构建包排除本机 `config.sh`。SHA-256 校验只能检查文件是否与同一 HTTP 服务提供的清单一致；它不能验证发布者身份，也无法抵御能同时替换文件和清单的网络攻击者。

## 数据与许可

天气来自无需 API 密钥的 [Open-Meteo](https://open-meteo.com/en/docs)。节气由 [lunar-javascript](https://github.com/6tail/lunar-javascript) 计算。天气图标及其许可说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `public/weather-icons/LICENSE.txt`。本项目使用 MIT 许可，见 [LICENSE](LICENSE)。

安全范围和反馈方式见 [SECURITY.md](SECURITY.md) 与 [安全说明](docs/security-model.md)；当前源码快照的验证边界见 [发布状态说明](docs/release-status.md)。

## 日常开发与设备更新

真实配置留在本地；通用代码在这个仓库继续演进。客户端更新由 `CLIENT_DISTRIBUTION_DIR` 指定的固定快照提供，服务不会直接分发工作区里的新改动。测试通过、选择需要发布的版本后，再运行 `npm run stage-client-release` 创建新快照并修改本地选择；重启服务才使用新的选择。暂存工具不覆盖已有版本内容，也不重启服务或联系 Kindle。

这份公开源码尚未完成实机验证，请保持手动更新。后续发布应在可查看设备的情况下验证显示与原生界面恢复，再选择新的客户端快照。

修改远程分发的客户端文件时，必须同步提高 `VERSION` 与 `config.xml` 的版本号；暂存工具拒绝同版本不同内容或两处版本不一致的发布。Mac 端版式或数据模块变化无需提高 Kindle 客户端版本。
