# PW4 离线显示测试

这个测试只验证 KUAL 能否调用 FBInk 显示内置的 `1072×1448` PNG，不联网、不修改休眠设置，也不会开机自启。公开版默认关闭启动时自动更新。建议首次安装先完成这个检查，再排查网络连接。

## 安装

1. 用 USB 把 Kindle 连接到 Mac。
2. 打开 Kindle 磁盘中的 `extensions` 文件夹。
3. 将整个 `kindle-dashboard` 文件夹复制进去，最终路径必须是：

   `/mnt/us/extensions/kindle-dashboard/`

4. 安全弹出 Kindle 并拔掉 USB。
5. 打开 KUAL，进入 `Kindle Dashboard`。
6. 点击“诊断：显示内置测试图”。

KUAL 关闭约两秒后，屏幕应先完整刷新一次，再显示日期天气测试图。

## 配置联网功能

只有需要联网看板时才配置设备。复制 `config.example.sh` 为 `config.sh`，填写自己的服务器 `DASHBOARD_BASE_URL` 和 `DEVICE_TOKEN`，并保持 `AUTO_UPDATE_ON_START=0`，直到手动验证更新。`config.sh` 只保存在 Kindle 上，不要放进公开仓库或安装包。

## 如果没有显示

重新连接 USB，在 Kindle 磁盘中查看：

`extensions/kindle-dashboard/dashboard.log`

如果已经完成设备联网配置，也可以在 KUAL 选择“上传诊断日志”，把日志发到自己配置的 Mac 服务；它不会上传到 GitHub。这个上传使用 HTTP，只应在可信局域网内进行。

日志可能包含时间、局域网地址或请求 URL。公开分享前先检查并删除令牌、密码、精确位置和其他私人信息；不要发送 `.env.local` 或设备上的 `config.sh`。如果 Kindle 界面没有恢复，重启 Kindle 可恢复系统界面。
