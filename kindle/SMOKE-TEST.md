# PW4 离线显示测试

这个测试只验证 KUAL 能否调用 FBInk 显示一张 `1072×1448` PNG，不联网、不修改休眠设置，也不会开机自启。公开版默认关闭启动时自动更新；先完成离线显示检查，再按自己的服务器填写设备配置。

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

重新连接 USB，查看：

`extensions/kindle-dashboard/dashboard.log`

把这个文件发回即可继续诊断。重新启动 Kindle 可以恢复正常界面和电源行为。
