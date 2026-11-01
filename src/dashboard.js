import { readFileSync } from 'node:fs';
import { renderDashboard as renderWeatherDashboard } from '../design-archive/v2-weather-system-status/render.js';
import { getCalendarLabel } from './solar-term.js';
import { chinaAirQualityLabel, MAX_AQI_AGE_MS } from './air-quality.js';
import { rainTimeLabel, weatherDescription } from './weather.js';
import { weatherIconId } from './weather-icons.js';

const template = readFileSync(new URL('./clock-template.html', import.meta.url), 'utf8');
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const WEEKDAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const SHORT_WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function display(value, suffix = '') { return Number.isFinite(value) ? `${Math.round(value)}${suffix}` : `--${suffix}`; }
function percent(value) { return Number.isFinite(value) ? Math.round(Math.max(0,Math.min(100,value))) : 0; }
function dateParts(now, timezone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(now).map(p=>[p.type,p.value]));
}
export function renderDashboard({ now = new Date(), weather = null, system = null,
  timezone = process.env.DASHBOARD_TIMEZONE || 'Asia/Shanghai', city = process.env.DASHBOARD_CITY || '当地',
  weatherConfigured = true, layout = process.env.DASHBOARD_LAYOUT || 'clock',
} = {}) {
  if (layout === 'weather') return renderWeatherDashboard({now,weather,system,timezone,city,weatherConfigured});
  const date=dateParts(now,timezone);
  const calendarDate=new Date(Date.UTC(Number(date.year),Number(date.month)-1,Number(date.day),12));
  const firstDay=new Date(Date.UTC(Number(date.year),0,1));
  const week=Math.ceil(((Date.UTC(Number(date.year),Number(date.month)-1,Number(date.day))-firstDay)/86400000+firstDay.getUTCDay()+1)/7);
  const localTime=`${date.year}-${date.month.padStart(2,'0')}-${date.day.padStart(2,'0')}T${String(Number(date.hour)%12+(date.dayPeriod==='PM'?12:0)).padStart(2,'0')}:${date.minute}`;
  const aqiAge=weather?.airObservedAt ? now-new Date(weather.airObservedAt) : 0;
  const validAqi=weather?.airStandard==='CN' && Number.isFinite(weather.airAqi) && aqiAge>=-900000 && aqiAge<=MAX_AQI_AGE_MS;
  const condition=weather ? weatherDescription(weather.weatherCode) : weatherConfigured ? '天气暂不可用' : '天气未配置';
  const temperature=display(weather?.temperature,'°');
  const values={
    DATE:`${date.month}月${date.day}日`,WEEKDAY:WEEKDAYS[calendarDate.getUTCDay()],MONTH:`${date.year} · ${MONTHS[Number(date.month)-1]}`,
    CALENDAR:`${getCalendarLabel(now,timezone)} · 第 ${week} 周`,TIME:`${date.hour}:${date.minute}`,PERIOD:date.dayPeriod,
    CONDITION:`${city} · ${condition}`,TEMPERATURE:temperature,TEMP_CLASS:temperature.length>=4?'kb-temp-long':'',
    ICON:weather ? weatherIconId(weather.weatherCode) : 'cloud',RANGE:`${display(weather?.low,'°')} / ${display(weather?.high,'°')}`,
    HUMIDITY:display(weather?.humidity,'%'),AQI:validAqi?`${Math.round(weather.airAqi)} · ${chinaAirQualityLabel(weather.airAqi)}`:'-- · 暂无',
    RAIN:weather ? rainTimeLabel(weather.rainHours?.times,weather.rainHours?.probabilities,localTime,weather.weatherCode,weather.rainHours?.codes) : '降雨数据暂无',
    CPU:display(system?.cpu,'%'),MEMORY:display(system?.memory,'%'),CPU_PERCENT:percent(system?.cpu),MEMORY_PERCENT:percent(system?.memory),
    DISK:Number.isFinite(system?.disk?.usedGb)&&Number.isFinite(system?.disk?.totalGb)?`${system.disk.usedGb}G / ${system.disk.totalGb}G`:'--',DISK_PERCENT:percent(system?.disk?.percent),
  };
  for(let index=0;index<3;index++) {
    const day=weather?.forecast?.[index];
    const parsed=day&&/^\d{4}-\d{2}-\d{2}$/.test(day.date)?new Date(`${day.date}T12:00:00Z`):null;
    values[`FORECAST_DAY_${index}`]=parsed&&!Number.isNaN(parsed.getTime())?SHORT_WEEKDAYS[parsed.getUTCDay()]:'未来';
    values[`FORECAST_RANGE_${index}`]=`${display(day?.low,'°')} / ${display(day?.high,'°')}`;
    values[`FORECAST_NOTE_${index}`]=day?(day.precipitationProbability>0?`降水 ${day.precipitationProbability}%`:weatherDescription(day.weatherCode)):'暂无数据';
  }
  return template.replace(/\{\{([A-Z_0-9]+)\}\}/g,(_match,key)=>escapeHtml(values[key]));
}
