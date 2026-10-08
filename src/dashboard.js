import { weatherDescription } from "./weather.js";
import { getSolarTermDisplay } from "./solar-term.js";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const WEEKDAYS = [
  "星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六",
];

const SHORT_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function zonedDateParts(now, timezone) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const calendarDate = new Date(Date.UTC(year, month - 1, day, 12));

  return { year, month, day, weekday: WEEKDAYS[calendarDate.getUTCDay()] };
}

function weekNumber(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const firstDay = new Date(Date.UTC(year, 0, 1));
  return Math.ceil(((date - firstDay) / 86_400_000 + firstDay.getUTCDay() + 1) / 7);
}

function shortWeekday(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || "");
  if (!match) return "未来";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return SHORT_WEEKDAYS[date.getUTCDay()];
}

function iconId(code) {
  if (code === 0 || code === 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

function precipitationNote(weather) {
  const rainTime = weather?.rainTime;
  if (!rainTime || rainTime === "24时无雨") return "";
  if (rainTime.includes("有雨") || rainTime.includes("有雪")) return rainTime;
  const snowing = (weather?.weatherCode >= 71 && weather?.weatherCode <= 77) ||
    (weather?.weatherCode >= 85 && weather?.weatherCode <= 86);
  return `${rainTime}有${snowing ? "雪" : "雨"}`;
}

function mainWeatherIcon(code) {
  const layouts = {
    partly: { y: 374 },
    sun: { y: 319 },
    cloud: { y: 417 },
    rain: { y: 355 },
    snow: { y: 344 },
    storm: { y: 301 },
  };
  return {
    id: iconId(code),
    x: 64,
    width: 435,
    ...(layouts[iconId(code)] || layouts.cloud),
  };
}

function forecastColumns(weather) {
  const positions = [179, 536, 894];
  return positions.map((x, index) => {
    const day = weather?.forecast?.[index];
    const label = day ? shortWeekday(day.date) : "未来";
    const range = day ? `${day.low}° / ${day.high}°` : "--° / --°";
    const detail = day
      ? day.precipitationProbability > 0
        ? `降水 ${day.precipitationProbability}%`
        : weatherDescription(day.weatherCode)
      : "暂无数据";

    return `<text x="${x}" y="964" text-anchor="middle" font-size="32" font-weight="500" letter-spacing="4">${escapeXml(label)}</text>
      <use href="#icon-${iconId(day?.weatherCode)}" x="${x - 52}" y="984" width="104" height="104"/>
      <text class="serif" x="${x}" y="1134" text-anchor="middle" font-size="39" font-weight="500">${escapeXml(range)}</text>
      <text class="muted" x="${x}" y="1185" text-anchor="middle" font-size="26">${escapeXml(detail)}</text>`;
  }).join("\n");
}

function systemMetrics(system) {
  const metrics = [
    { label: "CPU", value: system?.cpu, x: 214 },
    { label: "MEM", value: system?.memory, x: 492 },
    {
      label: "DISK",
      value: system?.disk?.percent,
      display: Number.isFinite(system?.disk?.usedGb) && Number.isFinite(system?.disk?.totalGb)
        ? `${system.disk.usedGb}G / ${system.disk.totalGb}G`
        : "--",
      x: 770,
    },
  ];
  const width = 220;

  return metrics.map(({ label, value, display: explicitDisplay, x }) => {
    const display = explicitDisplay ?? (Number.isFinite(value) ? `${Math.round(value)}%` : "--");
    const filled = Number.isFinite(value)
      ? Math.round((Math.max(0, Math.min(value, 100)) / 100) * width)
      : 0;
    return `<text x="${x}" y="1305" font-size="24" font-weight="500" letter-spacing="3">${label}</text>
      <text class="muted" x="${x + width}" y="1305" text-anchor="end" font-size="24">${display}</text>
      <rect x="${x}" y="1331" width="${width}" height="24" fill="#d0d0ca"/>
      <rect x="${x}" y="1331" width="${filled}" height="24" fill="#151515"/>`;
  }).join("\n");
}

export function renderDashboard({
  now = new Date(),
  weather = null,
  system = null,
  timezone = process.env.DASHBOARD_TIMEZONE || "Asia/Shanghai",
  city = process.env.DASHBOARD_CITY || "当地",
  weatherConfigured = true,
} = {}) {
  const date = zonedDateParts(now, timezone);
  const solarTerm = getSolarTermDisplay(now, timezone);
  const condition = weather
    ? weatherDescription(weather.weatherCode)
    : weatherConfigured ? "天气暂不可用" : "天气未配置";
  const temperature = weather ? `${weather.temperature}°` : "--°";
  const currentRange = weather ? `${weather.low}° / ${weather.high}°` : "--° / --°";
  const airQuality = weather?.airAqi == null ? "暂无" : `${weather.airQuality} · ${weather.airAqi}`;
  const feelsHumidity = weather
    ? `体感 ${weather.apparentTemperature}° · 湿度 ${weather.humidity}%`
    : weatherConfigured ? "等待天气数据" : "请在本地配置天气坐标";
  const precipitation = precipitationNote(weather);
  const mainIcon = mainWeatherIcon(weather?.weatherCode);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1072, initial-scale=1">
  <title>Kindle Dashboard Frame</title>
  <style>
    html, body { margin: 0; width: 1072px; height: 1448px; overflow: hidden; background: #f3f3ef; }
    svg { display: block; width: 1072px; height: 1448px; color: #111; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; text-rendering: geometricPrecision; }
    .serif { font-family: Georgia, "Times New Roman", "Songti SC", serif; }
    .muted { fill: #454545; }
    .rule { stroke: #151515; stroke-width: 3; }
    .fine-rule { stroke: #8a8a8a; stroke-width: 2; }
  </style>
</head>
<body>
  <svg viewBox="0 0 1072 1448" role="img" aria-label="Kindle 日期天气看板">
    <defs>
      <symbol id="icon-partly" viewBox="0 0 160 160">
        <circle cx="61" cy="57" r="29" fill="#d8d8d3" stroke="#111" stroke-width="6"/>
        <g stroke="#111" stroke-width="5" stroke-linecap="round"><path d="M61 12v12M61 90v13M17 57h13M92 57h13M30 26l9 9M84 80l9 9M30 88l9-9M84 34l9-9"/></g>
        <path d="M46 129h74c18 0 28-10 28-24 0-15-12-26-28-26-4-20-21-34-42-34-24 0-43 18-45 42-14 3-23 12-23 23 0 12 11 19 36 19Z" fill="#f3f3ef" stroke="#111" stroke-width="7" stroke-linejoin="round"/>
      </symbol>
      <symbol id="icon-rain" viewBox="0 0 120 120">
        <path d="M25 72h66c14 0 22-8 22-19s-9-20-22-20C87 18 74 9 59 9 40 9 25 23 23 41 12 43 5 50 5 59c0 9 8 13 20 13Z" fill="#edede8" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
        <g stroke="#111" stroke-width="6" stroke-linecap="round"><path d="M31 87l-6 15M59 87l-6 15M87 87l-6 15"/></g>
      </symbol>
      <symbol id="icon-cloud" viewBox="0 0 120 120">
        <path d="M23 85h69c14 0 23-9 23-21 0-13-10-22-23-22C88 25 74 15 57 15 38 15 22 30 20 49 10 51 4 59 4 68c0 10 7 17 19 17Z" fill="#edede8" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
      </symbol>
      <symbol id="icon-sun" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="27" fill="#d8d8d3" stroke="#111" stroke-width="6"/>
        <g stroke="#111" stroke-width="6" stroke-linecap="round"><path d="M60 8v13M60 99v13M8 60h13M99 60h13M24 24l10 10M86 86l10 10M24 96l10-10M86 34l10-10"/></g>
      </symbol>
      <symbol id="icon-snow" viewBox="0 0 120 120">
        <path d="M25 69h66c14 0 22-8 22-19s-9-20-22-20C87 15 74 8 59 8 40 8 25 20 23 38 12 40 5 47 5 56c0 9 8 13 20 13Z" fill="#edede8" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
        <g stroke="#111" stroke-width="4" stroke-linecap="round"><path d="M31 83v22M20 94h22M23 86l16 16M39 86l-16 16M75 83v22M64 94h22M67 86l16 16M83 86l-16 16"/></g>
      </symbol>
      <symbol id="icon-storm" viewBox="0 0 120 120">
        <path d="M25 69h66c14 0 22-8 22-19s-9-20-22-20C87 15 74 8 59 8 40 8 25 20 23 38 12 40 5 47 5 56c0 9 8 13 20 13Z" fill="#edede8" stroke="#111" stroke-width="6" stroke-linejoin="round"/>
        <path d="M62 78L45 101h14l-4 16 22-27H63Z" fill="#111"/>
      </symbol>
    </defs>

    <rect width="1072" height="1448" fill="#f3f3ef"/>
    <text x="80" y="84" font-size="32" font-weight="500" letter-spacing="6">${date.year} · ${MONTHS[date.month - 1]}</text>
    <text class="serif" x="74" y="232" font-size="126" font-weight="500" letter-spacing="-7">${date.month}月${date.day}日</text>
    <text x="992" y="178" text-anchor="end" font-size="84" font-weight="500">${date.weekday}</text>
    <text class="muted" x="992" y="244" text-anchor="end" font-size="31" letter-spacing="3">${escapeXml(solarTerm.current)} · 第 ${weekNumber(date.year, date.month, date.day)} 周</text>
    <line class="rule" x1="62" y1="310" x2="1010" y2="310"/>

    <use href="#icon-${mainIcon.id}" x="${mainIcon.x}" y="${mainIcon.y}" width="${mainIcon.width}" height="${mainIcon.width}"/>
    ${precipitation ? `<text class="muted" x="280" y="805" text-anchor="middle" font-size="30" letter-spacing="4">${escapeXml(precipitation)}</text>` : ""}
    <line class="fine-rule" x1="520" y1="350" x2="520" y2="841"/>
    <text class="muted" x="585" y="440" font-size="32" font-weight="500" letter-spacing="9">${escapeXml(`${city} · ${condition}`)}</text>
    <text class="serif" x="564" y="617" font-size="190" font-weight="500" letter-spacing="-10">${escapeXml(temperature)}</text>
    <text class="muted" x="583" y="708" font-size="31" letter-spacing="4">${escapeXml(feelsHumidity)}</text>
    <line class="fine-rule" x1="583" y1="750" x2="970" y2="750"/>
    <text x="583" y="807" font-size="35" font-weight="500" letter-spacing="3">${escapeXml(`${currentRange} · 空气 ${airQuality}`)}</text>
    <line class="rule" x1="62" y1="900" x2="1010" y2="900"/>

    <line class="fine-rule" x1="357" y1="932" x2="357" y2="1200"/>
    <line class="fine-rule" x1="715" y1="932" x2="715" y2="1200"/>
    ${forecastColumns(weather)}
    <line class="rule" x1="62" y1="1218" x2="1010" y2="1218"/>
    <text x="88" y="1347" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="90"></text>
    ${systemMetrics(system)}
  </svg>
</body>
</html>`;
}
