import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const CACHE_TTL_MS = 15 * 60 * 1000;
const execFileAsync = promisify(execFile);

let cachedWeather = null;
let refreshInFlight = null;
let persistentCacheLoaded = false;

const defaultWeatherCachePath = fileURLToPath(
  new URL("../runtime/weather-cache.json", import.meta.url),
);

function weatherCachePath(path) {
  return path || defaultWeatherCachePath;
}

async function loadPersistentCache(path) {
  if (persistentCacheLoaded) return;
  persistentCacheLoaded = true;
  try {
    const parsed = JSON.parse(await readFile(weatherCachePath(path), "utf8"));
    const fetchedAt = new Date(parsed.fetchedAt);
    if (!Number.isNaN(fetchedAt.getTime())) cachedWeather = { ...parsed, fetchedAt };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Unable to read weather cache:", error.message);
    }
  }
}

async function savePersistentCache(weather, cacheFile) {
  try {
    const path = weatherCachePath(cacheFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, JSON.stringify(weather), "utf8");
    await import("node:fs/promises").then(({ rename }) => rename(`${path}.tmp`, path));
  } catch (error) {
    console.error("Unable to write weather cache:", error.message);
  }
}

async function fetchJson(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`${label} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/curl",
      ["-fsSL", "--connect-timeout", "10", "--max-time", "20", url],
      { timeout: 25_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return JSON.parse(stdout);
  } catch (curlError) {
    const fetchCause = lastError?.cause?.message || lastError?.message || "unknown";
    throw new Error(`${label} failed (fetch: ${fetchCause}; curl: ${curlError.message})`);
  }
}

export function validateWeatherCoordinates(configuration = {}) {
  const { latitude, longitude } = configuration || {};
  const latitudeMissing = latitude == null || String(latitude).trim() === "";
  const longitudeMissing = longitude == null || String(longitude).trim() === "";
  if (latitudeMissing && longitudeMissing) return null;
  if (latitudeMissing || longitudeMissing) {
    throw new Error("Both WEATHER_LATITUDE and WEATHER_LONGITUDE are required");
  }

  const parseCoordinate = (value) => {
    const source = String(value).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(source)) {
      return Number.NaN;
    }
    return Number(source);
  };
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  if (
    !Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90 ||
    !Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180
  ) {
    throw new Error("Weather coordinates must be valid latitude and longitude values");
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}

async function fetchFreshWeather({ latitude, longitude, timezone, cacheFile }) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code",
    hourly: "precipitation_probability",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone,
    forecast_days: "4",
    forecast_hours: "24",
  });
  const airQuery = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "us_aqi,pm2_5",
    timezone,
  });

  const [data, airResult] = await Promise.all([
    fetchJson(`https://api.open-meteo.com/v1/forecast?${query}`, "Open-Meteo"),
    fetchJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${airQuery}`,
      "Open-Meteo Air Quality",
    )
      .catch((error) => {
        console.error("Unable to refresh air quality:", error.message);
        return null;
      }),
  ]);
  const airAqi = Number.isFinite(airResult?.current?.us_aqi)
    ? Math.round(airResult.current.us_aqi)
    : cachedWeather?.airAqi ?? null;
  const weather = {
    temperature: Math.round(data.current.temperature_2m),
    apparentTemperature: Math.round(data.current.apparent_temperature),
    humidity: Math.round(data.current.relative_humidity_2m),
    weatherCode: data.current.weather_code,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    rainTime: rainTimeLabel(
      data.hourly?.time,
      data.hourly?.precipitation_probability,
      data.current?.time,
    ),
    airAqi,
    airQuality: airQualityLabel(airAqi),
    pm25: Number.isFinite(airResult?.current?.pm2_5)
      ? Math.round(airResult.current.pm2_5)
      : cachedWeather?.pm25 ?? null,
    forecast: (data.daily?.time || []).slice(1, 4).map((date, index) => ({
      date,
      weatherCode: data.daily?.weather_code?.[index + 1] ?? 3,
      high: Math.round(data.daily?.temperature_2m_max?.[index + 1]),
      low: Math.round(data.daily?.temperature_2m_min?.[index + 1]),
      precipitationProbability: Math.round(
        data.daily?.precipitation_probability_max?.[index + 1] ?? 0,
      ),
    })),
    fetchedAt: new Date(),
    stale: false,
  };

  cachedWeather = weather;
  await savePersistentCache(weather, cacheFile);
  return weather;
}

export function airQualityLabel(aqi) {
  if (!Number.isFinite(aqi)) return "暂无";
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "敏感";
  if (aqi <= 200) return "较差";
  if (aqi <= 300) return "很差";
  return "危险";
}

export function rainTimeLabel(times = [], probabilities = [], currentTime = "") {
  const rainyIndex = probabilities.findIndex(
    (probability) => Number(probability) >= 40,
  );
  if (rainyIndex < 0 || !times[rainyIndex]) return "24时无雨";

  const rainyTime = times[rainyIndex];
  const rainyDate = rainyTime.slice(0, 10);
  const currentDate = (currentTime || times[0] || "").slice(0, 10);
  const hour = Number(rainyTime.slice(11, 13));

  if (rainyIndex === 0) return "近期有雨";
  if (rainyDate === currentDate) return `${hour}时后`;
  return `明日${hour}时`;
}

export async function getWeather(options) {
  const settings = options === undefined
    ? {
        latitude: process.env.WEATHER_LATITUDE,
        longitude: process.env.WEATHER_LONGITUDE,
        timezone: process.env.DASHBOARD_TIMEZONE,
        cacheFile: process.env.WEATHER_CACHE_FILE,
      }
    : options;
  const coordinates = validateWeatherCoordinates(settings);
  if (!coordinates) return null;

  const refreshSettings = {
    ...coordinates,
    timezone: settings.timezone || "Asia/Shanghai",
    cacheFile: settings.cacheFile,
  };
  await loadPersistentCache(refreshSettings.cacheFile);
  if (
    cachedWeather &&
    Date.now() - cachedWeather.fetchedAt.getTime() < CACHE_TTL_MS
  ) {
    return { ...cachedWeather, stale: false };
  }

  if (!refreshInFlight) {
    refreshInFlight = fetchFreshWeather(refreshSettings).finally(() => {
      refreshInFlight = null;
    });
  }

  try {
    return await refreshInFlight;
  } catch (error) {
    console.error("Unable to refresh weather:", error.message);
    return cachedWeather ? { ...cachedWeather, stale: true } : null;
  }
}

export function weatherDescription(code) {
  if (code === 0) return "晴";
  if (code === 1) return "大致晴朗";
  if (code === 2) return "多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "天气未知";
}

export function weatherIcon(code) {
  if (code === 0 || code === 1) return "sun.png";
  if (code === 2) return "partly-cloudy.png";
  if (code === 3) return "cloud.png";
  if (code === 45 || code === 48) return "fog.png";
  if (code >= 51 && code <= 67) return "rain.png";
  if (code >= 71 && code <= 77) return "snow.png";
  if (code >= 80 && code <= 82) return "rain.png";
  if (code >= 85 && code <= 86) return "snow.png";
  if (code >= 95) return "storm.png";
  return "cloud.png";
}
