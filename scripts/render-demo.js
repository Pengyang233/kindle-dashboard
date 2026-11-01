import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderDashboard } from '../src/dashboard.js';
import { getFramePng } from '../src/frame-renderer.js';

// Fixed public demonstration data; never read providers or host statistics.
const now = new Date('2026-11-01T08:38:00Z');
const weather = {
  temperature: 15, humidity: 29, weatherCode: 0, high: 17, low: 6,
  airAqi: 180, airStandard: 'CN', airObservedAt: '2026-11-01T08:00:00Z',
  rainHours: {
    times: Array.from({length:8},(_,i)=>`2026-11-01T${16+i}:00`),
    probabilities: [0,0,0,0,0,0,0,0], codes: [0,0,0,0,0,0,0,0],
  },
  forecast: [
    {date:'2026-11-02',low:5,high:16,weatherCode:0,precipitationProbability:0},
    {date:'2026-11-03',low:6,high:16,weatherCode:1,precipitationProbability:0},
    {date:'2026-11-04',low:5,high:13,weatherCode:3,precipitationProbability:4},
  ],
};
const system = {cpu:20,memory:36,disk:{percent:53,usedGb:130,totalGb:245}};
const frame = await getFramePng(renderDashboard({now,weather,system,city:'示例',timezone:'Asia/Shanghai',layout:'clock'}));
for (const relative of ['../kindle/kindle-dashboard/assets/frame.png','../design-archive/v3-clock-weather-status/frame.png']) {
  await writeFile(fileURLToPath(new URL(relative,import.meta.url)),frame.png);
}
console.log('Wrote fixed-data 1072×1448 clock demonstration and client fallback. Earlier major-layout references were preserved.');
