import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { renderDashboard } from '../src/dashboard.js';
import { getCalendarLabel } from '../src/solar-term.js';
import { parseChinaAirQuality, chinaAirQualityLabel } from '../src/air-quality.js';
import { rainTimeLabel } from '../src/weather.js';

const options = {
  now: new Date('2026-11-01T08:38:00Z'), city:'示例', timezone:'Asia/Shanghai', layout:'clock',
  weather:{temperature:15,humidity:29,weatherCode:0,low:6,high:17,airAqi:180,airStandard:'CN',
    rainHours:{times:['2026-11-01T16:00','2026-11-01T17:00'],probabilities:[10,40],codes:[0,61]},
    forecast:[{date:'2026-11-02',low:5,high:16,weatherCode:0,precipitationProbability:0}]},
  system:{cpu:20,memory:36,disk:{usedGb:130,totalGb:245,percent:53}},
};
test('clock layout retains status, escapes content and shows the accepted data hierarchy',()=>{
  const html=renderDashboard(options);
  for(const text of ['4:38','PM','霜降 · 第 45 周','180 · 中度','17时有雨','CPU','MEM','DISK','130G / 245G']) assert.ok(html.includes(text),text);
  assert.match(html,/width:1072px;height:1448px/);
  assert.doesNotMatch(html,/\{\{|<script\b|data-lucide|中度污染/);
  const forecast=html.split('class="kb-band kb-forecast"')[1].split('class="kb-band kb-rule"')[0];
  assert.doesNotMatch(forecast,/<svg|<use/);
  assert.match(renderDashboard({...options,city:'<img src=x>'}),/&lt;img src=x&gt;/);
  assert.match(renderDashboard({...options,weather:{...options.weather,airStandard:'US'}}),/-- · 暂无/);
  assert.match(renderDashboard({...options,weather:null}),/天气暂不可用/);
});
test('12-hour clock handles noon, midnight, timezone dates, and negative temperature width',()=>{
  for(const [date,time,period]of [['2026-11-01T04:00:00Z','12:00','PM'],['2026-10-31T16:00:00Z','12:00','AM']]) {
    const html=renderDashboard({...options,now:new Date(date)});
    assert.ok(html.includes(`class="kb-time">${time}<`));assert.ok(html.includes(`class="kb-period">${period}<`));assert.ok(html.includes('11月1日'));
  }
  assert.match(renderDashboard({...options,weather:{...options.weather,temperature:-10}}),/kb-temp kb-temp-long">-10°/);
});
test('popular holidays take precedence on solar-term dates, with a normal term fallback',()=>{
  for(const [date,label]of [['2026-04-05','清明节'],['2026-02-17','春节'],['2026-02-16','除夕'],['2026-10-01','国庆节'],['2026-11-01','霜降'],['2020-10-01','国庆节/中秋节']]) {
    assert.equal(getCalendarLabel(new Date(`${date}T04:00:00Z`),'Asia/Shanghai'),label);
  }
});
test('CNEMC observations are city-matched, timestamp-checked, and classified without US relabeling',()=>{
  const rows=[{Area:'北京市',AQI:'180',TimePoint:'2026-11-01T16:00:00'}];
  const result=parseChinaAirQuality(rows,'北京',options.now);
  assert.equal(result.airStandard,'CN');assert.equal(result.airAqi,180);assert.equal(result.airQuality,'中度');
  for(const [n,label]of [[0,'优'],[50,'优'],[51,'良'],[100,'良'],[101,'轻度'],[150,'轻度'],[151,'中度'],[200,'中度'],[201,'重度'],[300,'重度'],[301,'严重'],[500,'严重']])assert.equal(chinaAirQualityLabel(n),label);
  assert.throws(()=>parseChinaAirQuality(rows,'上海',options.now),/unavailable/);
  assert.throws(()=>parseChinaAirQuality(rows,'北京',new Date('2026-11-02T08:00:00Z')),/not current/);
  assert.throws(()=>parseChinaAirQuality([{...rows[0],AQI:'—'}],'北京',options.now),/unavailable/);
});
test('rain summary uses only future hours, the exact 40% threshold and explicit times',()=>{
  const times=['2026-11-01T15:00','2026-11-01T16:00','2026-11-01T17:00'];
  assert.equal(rainTimeLabel(times,[90,39,40],'2026-11-01T16:38',0),'17时有雨');
  assert.equal(rainTimeLabel(times,[90,40,10],'2026-11-01T16:38',0),'本小时有雨');
  assert.equal(rainTimeLabel(['2026-11-01T23:00','2026-11-02T00:00'],[0,40],'2026-11-01T23:30',0),'明日0时有雨');
  assert.equal(rainTimeLabel(['2026-11-01T23:00'],[39],'2026-11-01T23:30',0),'今日无雨');
  assert.equal(rainTimeLabel([],[],'2026-11-01T16:38',0),'降雨数据暂无');
  assert.equal(rainTimeLabel(times,[0,null,0],'2026-11-01T16:38',0),'降雨数据暂无');
  assert.equal(rainTimeLabel(['2026-11-01T16:00'],[0],'2026-11-01T16:38',0),'降雨数据暂无');
  assert.equal(rainTimeLabel([],[],'2026-11-01T16:38',61),'正在下雨');
  assert.equal(rainTimeLabel([],[],'2026-11-01T16:38',73),'正在下雪');
});
test('minute schedule aligns to server time and is not shifted by completed rendering or manual refreshes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kindle-clock-schedule-'));
  try {
    await mkdir(join(root,'state'));await writeFile(join(root,'config.sh'),'REFRESH_SECONDS=1800\n');
    const state=join(root,'state');await writeFile(join(state,'refresh-seconds'),'60\n');await writeFile(join(state,'refresh-align'),'1\n');await writeFile(join(state,'server-offset'),'0\n');
    const common=resolve('kindle/kindle-dashboard/lib/common.sh');
    const run=(now)=>Number(execFileSync('/bin/sh',['-c','. "$1"; next_refresh_epoch "$2"','schedule',common,String(now)],{encoding:'utf8',env:{...process.env,KINDLE_DASHBOARD_DIR:root}}).trim());
    assert.equal(run(119),120);assert.equal(run(120),180);assert.equal(run(124),180);assert.equal(run(145),180);
    await writeFile(join(state,'server-offset'),'7\n');assert.equal(run(119),173);
    await writeFile(join(state,'refresh-align'),'0\n');assert.equal(run(124),184);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('weather adapter actually requests the selected national city and keeps coordinates out of CNEMC requests',async()=>{
  const root=await mkdtemp(join(tmpdir(),'clock-national-weather-'));
  const originalFetch=globalThis.fetch;
  const urls=[];
  const localNow=new Date(Date.now()+8*3600000).toISOString().slice(0,19);
  globalThis.fetch=async(url)=>{
    urls.push(String(url));
    const data=String(url).includes('air.cnemc.cn')
      ? [{Area:'北京市',AQI:'32',TimePoint:localNow}]
      : {current:{temperature_2m:15,apparent_temperature:12,relative_humidity_2m:29,weather_code:0,time:localNow.slice(0,16)},hourly:{time:[localNow.slice(0,13)+':00'],precipitation_probability:[0],weather_code:[0]},daily:{time:['2026-11-01'],temperature_2m_max:[17],temperature_2m_min:[6],weather_code:[0],precipitation_probability_max:[0]}};
    return {ok:true,json:async()=>data};
  };
  try {
    const {getWeather}=await import(`../src/weather.js?adapter-test=${Date.now()}`);
    const result=await getWeather({latitude:39.8,longitude:116.3,timezone:'Asia/Shanghai',airQualityCity:'北京',cacheFile:join(root,'weather.json')});
    assert.equal(result.airStandard,'CN');assert.equal(result.airAqi,32);assert.equal(result.airCity,'北京市');
    const national=urls.find(url=>url.includes('air.cnemc.cn'));
    assert.ok(national);assert.doesNotMatch(national,/latitude|longitude|39\.8|116\.3/);
    assert.ok(urls.some(url=>url.startsWith('https://api.open-meteo.com/v1/forecast?')));
  } finally {globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
});

test('national AQI can refresh while weather remains on its last cached forecast',async()=>{
  const root=await mkdtemp(join(tmpdir(),'clock-independent-aqi-'));
  const cache=join(root,'weather.json');
  const originalFetch=globalThis.fetch;
  const localNow=new Date(Date.now()+8*3600000).toISOString().slice(0,19);
  const fetchedAt=new Date().toISOString();
  await writeFile(cache,JSON.stringify({temperature:15,weatherCode:0,fetchedAt,airAqi:180,airStandard:'US'}));
  globalThis.fetch=async(url)=>({ok:true,json:async()=>String(url).includes('air.cnemc.cn')?[{Area:'北京市',AQI:'32',TimePoint:localNow}]:null});
  try {
    const {getWeather}=await import(`../src/weather.js?independent-test=${Date.now()}`);
    const settings={latitude:39.8,longitude:116.3,timezone:'Asia/Shanghai',airQualityCity:'北京',cacheFile:cache};
    const first=await getWeather(settings);assert.equal(first.temperature,15);assert.equal(first.airAqi,null);
    let second;
    for(let attempt=0;attempt<20;attempt++){await new Promise(r=>setTimeout(r,5));second=await getWeather(settings);if(second.airStandard==='CN'&&second.airAqi===32)break;}
    assert.equal(second.temperature,15);assert.equal(second.airStandard,'CN');assert.equal(second.airAqi,32);
    assert.equal(new Date(second.fetchedAt).toISOString(),fetchedAt,'an AQI refresh must not make the old weather timestamp fresh');
  } finally {globalThis.fetch=originalFetch;await rm(root,{recursive:true,force:true});}
});
