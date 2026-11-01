export const CHINA_AQI_URL = "https://air.cnemc.cn:18007/CityData/GetAllCityRealTimeAQIModels";
export const MAX_AQI_AGE_MS = 3 * 60 * 60 * 1000;

export function chinaAirQualityLabel(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0 || aqi > 500) return "暂无";
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "轻度";
  if (aqi <= 200) return "中度";
  if (aqi <= 300) return "重度";
  return "严重";
}

export function parseChinaAirQuality(rows, city, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error("Invalid CNEMC city data");
  const normalize = (name) => String(name || "").trim().replace(/市$/, "");
  const row = rows.find((item) => normalize(item.Area) === normalize(city));
  if (!row || !/^\d{1,3}$/.test(String(row.AQI))) throw new Error("CNEMC city AQI unavailable");
  const aqi = Number(row.AQI);
  if (aqi > 500 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(row.TimePoint)) {
    throw new Error("Invalid CNEMC observation");
  }
  const observedAt = new Date(`${row.TimePoint}+08:00`);
  const age = now.getTime() - observedAt.getTime();
  if (!Number.isFinite(age) || age < -15 * 60 * 1000 || age > MAX_AQI_AGE_MS) {
    throw new Error("CNEMC observation is not current");
  }
  return {
    airAqi: aqi, airQuality: chinaAirQualityLabel(aqi), airStandard: "CN",
    airObservedAt: observedAt.toISOString(), airSource: "CNEMC", airCity: row.Area,
  };
}
