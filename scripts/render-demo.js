import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderDashboard } from "../src/dashboard.js";
import { getFramePng } from "../src/frame-renderer.js";
import { renderDashboard as renderLegacy } from "../design-archive/v1-weather-forecast/render.js";

// Fixed demonstration values; no providers or host statistics are read.
process.env.DASHBOARD_CITY = "示例";
process.env.DASHBOARD_TIMEZONE = "Asia/Shanghai";
const weather = {
  temperature: 29, apparentTemperature: 31, humidity: 68, weatherCode: 2,
  high: 32, low: 25, airAqi: 73, airQuality: "良", rainTime: "22时后",
  forecast: [
    { date: "2026-08-15", weatherCode: 61, high: 29, low: 24, precipitationProbability: 65 },
    { date: "2026-08-16", weatherCode: 3, high: 31, low: 24, precipitationProbability: 25 },
    { date: "2026-08-17", weatherCode: 0, high: 33, low: 23, precipitationProbability: 0 },
  ],
};
const system = { cpu: 18, memory: 62, disk: { percent: 41, usedGb: 105, totalGb: 256 } };
const frame = await getFramePng(renderDashboard({ now: new Date("2026-08-14T02:36:00Z"), weather, system }));
for (const relative of ["../kindle/kindle-dashboard/assets/frame.png", "../design-archive/v2-weather-system-status/frame.png"]) {
  await writeFile(fileURLToPath(new URL(relative, import.meta.url)), frame.png);
}
const legacy = await getFramePng(renderLegacy({ now: new Date("2026-08-14T02:36:00Z"), weather }));
await writeFile(fileURLToPath(new URL("../design-archive/v1-weather-forecast/frame.png", import.meta.url)), legacy.png);
console.log("Wrote fixed-data 1072×1448 demonstration frames for both archived layouts and the client.");
