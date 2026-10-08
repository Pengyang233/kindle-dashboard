const allowedCommands = new Set(["run", "stop", "refresh", "upload", "update"]);
const devices = new Map();

function ensureDevice(deviceId) {
  if (!devices.has(deviceId)) {
    devices.set(deviceId, {
      command: "run",
      commandIssuedAt: null,
      lastSeen: null,
      lastDelivered: null,
      lastAck: null,
    });
  }
  return devices.get(deviceId);
}

export function pollDeviceCommand(deviceId) {
  const device = ensureDevice(deviceId);
  device.lastSeen = new Date();
  const command = device.command;
  if (command !== "run") {
    device.lastDelivered = { command, at: new Date() };
  }
  if (command === "stop") {
    device.command = "run";
    device.commandIssuedAt = null;
  }
  return command;
}

export function setDeviceCommand(deviceId, command) {
  if (!allowedCommands.has(command)) throw new Error("Invalid device command");
  const device = ensureDevice(deviceId);
  device.command = command;
  device.commandIssuedAt = command === "run" ? null : new Date();
  return { ...device };
}

export function acknowledgeDeviceCommand(deviceId, command) {
  if (!allowedCommands.has(command) || command === "run") {
    throw new Error("Invalid acknowledged command");
  }
  const device = ensureDevice(deviceId);
  if (device.command === command) device.command = "run";
  if (device.command === "run") device.commandIssuedAt = null;
  device.lastAck = { command, at: new Date() };
  device.lastSeen = new Date();
  return { ...device };
}

export function getDeviceState(deviceId) {
  return { ...ensureDevice(deviceId) };
}

export function resetDeviceControl() {
  devices.clear();
}

export function renderControlPage(deviceId = "pw4") {
  const device = ensureDevice(deviceId);
  const seen = device.lastSeen
    ? device.lastSeen.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "尚未连接";
  const ack = device.lastAck
    ? `${device.lastAck.command} · ${device.lastAck.at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
    : "无";
  const delivered = device.lastDelivered
    ? `${device.lastDelivered.command} · ${device.lastDelivered.at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
    : "无";
  const commandStatus = device.command === "run"
    ? "没有待执行命令"
    : `${device.command}（等待设备执行完成）`;
  const buttons = [
    ["refresh", "立即刷新"],
    ["upload", "上传日志"],
    ["update", "更新客户端并重启"],
    ["stop", "停止看板并恢复原界面"],
    ["run", "清除停止命令"],
  ]
    .map(
      ([command, label]) =>
        `<button name="command" value="${command}" type="submit">${label}</button>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Kindle Dashboard 控制台</title>
  <style>
    body { max-width: 680px; margin: 48px auto; padding: 0 20px; font: 17px/1.6 system-ui, sans-serif; color: #171717; }
    h1 { font-size: 28px; margin-bottom: 24px; }
    .status { padding: 18px 20px; background: #f2f2f2; border-radius: 12px; margin-bottom: 22px; }
    form { display: grid; gap: 12px; }
    button { padding: 13px 16px; font: inherit; text-align: left; background: white; border: 1px solid #bbb; border-radius: 9px; cursor: pointer; }
    button:hover { background: #f6f6f6; }
  </style>
</head>
<body>
  <h1>Kindle Dashboard</h1>
  <div class="status">
    <div>设备：${deviceId}</div>
    <div>命令状态：${commandStatus}</div>
    <div>最后连接：${seen}</div>
    <div>最后领取：${delivered}</div>
    <div>最后完成：${ack}</div>
    <div>页面每 5 秒自动更新；按钮下发后请观察“最后完成”。</div>
  </div>
  <form method="post" action="/control/${deviceId}">${buttons}</form>
</body>
</html>`;
}
