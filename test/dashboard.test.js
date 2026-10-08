import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { getClientVersion } from "../src/client-distribution.js";
import { validateServerConfig } from "../src/config.js";
import { renderDashboard } from "../src/dashboard.js";
import { createDashboardServer } from "../src/server.js";
import { getSolarTermDisplay } from "../src/solar-term.js";
import { apfsContainerUsage } from "../src/system-status.js";
import {
  airQualityLabel,
  getWeather,
  rainTimeLabel,
  validateWeatherCoordinates,
} from "../src/weather.js";

function basicAuth(username = "admin", password = "test-admin-password") {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function dispatch(server, { method = "GET", url = "/", headers = {}, body } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const bodyBuffer = body === undefined ? Buffer.alloc(0) : Buffer.from(body);
  if (body !== undefined && normalizedHeaders["content-length"] === undefined) {
    normalizedHeaders["content-length"] = String(bodyBuffer.byteLength);
  }
  const request = Readable.from(body === undefined ? [] : [bodyBuffer]);
  request.method = method;
  request.url = url;
  request.headers = normalizedHeaders;

  const response = {
    statusCode: undefined,
    headers: {},
    body: Buffer.alloc(0),
    get headersSent() {
      return this.statusCode !== undefined;
    },
    writeHead(statusCode, responseHeaders = {}) {
      this.statusCode = statusCode;
      this.headers = Object.fromEntries(
        Object.entries(responseHeaders).map(([name, value]) => [name.toLowerCase(), value]),
      );
    },
    end(value = "") {
      this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    },
    destroy() {
      this.destroyed = true;
    },
  };

  await server.listeners("request")[0](request, response);
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.body,
    text: response.body.toString("utf8"),
  };
}

test("renders a fixed-size, clock-free Kindle dashboard frame with Mac status", () => {
  const html = renderDashboard({
    now: new Date("2026-08-14T02:36:00Z"),
    weather: {
      temperature: 29,
      apparentTemperature: 31,
      humidity: 68,
      weatherCode: 2,
      high: 32,
      low: 25,
      rainProbability: 40,
      airAqi: 73,
      airQuality: "良",
      rainTime: "22时后",
      forecast: [
        {
          date: "2026-08-15",
          weatherCode: 61,
          high: 29,
          low: 24,
          precipitationProbability: 65,
        },
        {
          date: "2026-08-16",
          weatherCode: 3,
          high: 31,
          low: 24,
          precipitationProbability: 25,
        },
        {
          date: "2026-08-17",
          weatherCode: 0,
          high: 33,
          low: 23,
          precipitationProbability: 0,
        },
      ],
      stale: false,
    },
    system: {
      cpu: 18,
      memory: 62,
      disk: {
        percent: 41,
        usedGb: 105,
        totalGb: 256,
      },
    },
  });

  assert.match(html, /viewBox="0 0 1072 1448"/);
  assert.match(html, /2026 · AUGUST/);
  assert.match(html, /8月14日/);
  assert.match(html, /星期五/);
  assert.match(html, /x="992" y="178" text-anchor="end" font-size="84"/);
  assert.match(html, /x="992" y="244" text-anchor="end" font-size="31"/);
  assert.match(html, /立秋 · 第 33 周/);
  assert.match(html, /当地/);
  assert.match(html, />29°</);
  assert.match(html, /多云/);
  assert.match(html, /<use href="#icon-partly" x="64" y="374" width="435" height="435"\/>/);
  assert.match(html, /22时后有雨/);
  assert.match(html, /x="280" y="805"/);
  assert.match(html, /25° \/ 32° · 空气 良 · 73/);
  assert.match(html, />CPU</);
  assert.match(html, />MEM</);
  assert.match(html, />DISK</);
  assert.match(html, /105G \/ 256G/);
  assert.match(html, /x="214" y="1331" width="40" height="24"/);
  assert.match(html, /x="492" y="1331" width="136" height="24"/);
  assert.match(html, /x="770" y="1331" width="90" height="24"/);
  assert.match(html, /周六/);
  assert.match(html, /降水 65%/);
  assert.match(html, /23° \/ 33°/);
  assert.doesNotMatch(html, /10:36/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /<script\b/i);
});

test("calculates solar terms with the mature lunar calendar library", () => {
  const regularDay = getSolarTermDisplay(
    new Date("2026-08-12T02:36:00Z"),
    "Asia/Shanghai",
  );
  assert.deepEqual(regularDay, {
    current: "立秋",
    next: "处暑",
    daysUntilNext: 11,
    text: "立秋 · 距处暑11天",
  });

  const termDay = getSolarTermDisplay(
    new Date("2026-08-23T02:36:00Z"),
    "Asia/Shanghai",
  );
  assert.equal(termDay.current, "处暑");
  assert.equal(termDay.next, "白露");
});

test("summarizes air quality and the first likely rain time", () => {
  assert.equal(airQualityLabel(49), "优");
  assert.equal(airQualityLabel(73), "良");
  assert.equal(airQualityLabel(null), "暂无");
  assert.equal(
    rainTimeLabel(
      ["2026-08-12T20:00", "2026-08-12T21:00", "2026-08-12T22:00"],
      [10, 30, 45],
      "2026-08-12T20:00",
    ),
    "22时后",
  );
  assert.equal(rainTimeLabel(["2026-08-12T20:00"], [10]), "24时无雨");
});

test("does not request weather until both coordinates are configured", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("unexpected weather request");
  };
  try {
    assert.equal(await getWeather({ latitude: undefined, longitude: undefined }), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validates explicitly configured weather coordinates", async () => {
  assert.deepEqual(
    validateWeatherCoordinates({ latitude: "39.8", longitude: "116.3" }),
    { latitude: 39.8, longitude: 116.3 },
  );
  assert.equal(validateWeatherCoordinates({}), null);
  assert.throws(
    () => validateWeatherCoordinates({ latitude: "39.8" }),
    /Both WEATHER_LATITUDE and WEATHER_LONGITUDE are required/,
  );
  assert.throws(
    () => validateWeatherCoordinates({ latitude: "91", longitude: "116.3" }),
    /valid latitude and longitude/,
  );
  assert.throws(
    () => validateWeatherCoordinates({ latitude: "0x10", longitude: "116.3" }),
    /valid latitude and longitude/,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("invalid coordinates must not call the provider");
  };
  try {
    await assert.rejects(
      getWeather({ latitude: "91", longitude: "116.3" }),
      /valid latitude and longitude/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses APFS container capacity for Macintosh HD storage", () => {
  const usage = apfsContainerUsage(`<?xml version="1.0"?>
    <plist><dict>
      <key>APFSContainerFree</key><integer>146875437056</integer>
      <key>APFSContainerSize</key><integer>245107195904</integer>
    </dict></plist>`);

  assert.deepEqual(usage, {
    percent: 40,
    usedGb: 98,
    totalGb: 245,
  });
});

test("keeps the date visible and omits the clock when weather is unavailable", () => {
  const html = renderDashboard({
    now: new Date("2026-08-12T02:36:00Z"),
    weather: null,
  });

  assert.match(html, /8月12日/);
  assert.match(html, /天气暂不可用/);
  assert.doesNotMatch(html, /有雨|有雪/);
  assert.doesNotMatch(html, /10:36/);

  const unconfiguredHtml = renderDashboard({
    now: new Date("2026-08-12T02:36:00Z"),
    weather: null,
    weatherConfigured: false,
  });
  assert.match(unconfiguredHtml, /天气未配置/);
  assert.match(unconfiguredHtml, /请在本地配置天气坐标/);
});

test("protects admin and device routes while keeping update files public", async () => {
  const logDirectory = await mkdtemp(join(tmpdir(), "kindle-device-logs-"));
  let weatherCalls = 0;
  let weatherFailure = false;
  let systemCalls = 0;
  let frameCalls = 0;
  const config = validateServerConfig({
    NODE_ENV: "test",
    DASHBOARD_DEVICE_TOKEN: "test-device-token",
    DASHBOARD_ADMIN_PASSWORD: "test-admin-password",
    DASHBOARD_CONTROL_ORIGINS: "http://127.0.0.1:8787",
    DEVICE_LOG_DIR: logDirectory,
    CLIENT_DISTRIBUTION_DIR: fileURLToPath(new URL("../kindle/kindle-dashboard/", import.meta.url)),
  });
  const server = createDashboardServer(config, {
    getWeather: async () => {
      weatherCalls += 1;
      if (weatherFailure) throw new Error("/private/runtime/weather-cache.json");
      return null;
    },
    getSystemStatus: async () => {
      systemCalls += 1;
      return null;
    },
    renderDashboard: () => "<html>mock dashboard</html>",
    getFramePng: async () => {
      frameCalls += 1;
      return { png: Buffer.from("mock png bytes"), etag: '"mock-frame"', stale: false };
    },
  });
  try {
    const iconResponse = await dispatch(server, { url: "/weather-icons/partly-cloudy.png" });
    assert.equal(iconResponse.status, 200);
    assert.equal(iconResponse.headers["content-type"], "image/png");
    assert.ok(iconResponse.body.byteLength > 1_000);
    assert.equal((await dispatch(server, { url: "/health" })).status, 200);

    const manifestResponse = await dispatch(server, { url: "/client/manifest.txt" });
    assert.equal(manifestResponse.status, 200);
    const manifest = manifestResponse.text;
    assert.equal(manifest.split("\n", 1)[0], `version ${await getClientVersion()}`);
    assert.match(manifest, / bin\/dashboard-daemon\.sh$/m);
    assert.doesNotMatch(manifest, / config\.sh$/m);

    const menuRecord = manifest.split("\n").find((line) => line.endsWith(" menu.json"));
    const [, menuHash, menuSize] = menuRecord.split(" ");
    const menuResponse = await dispatch(server, { url: "/client/files/menu.json" });
    const menu = menuResponse.body;
    assert.equal(menuResponse.status, 200);
    assert.equal(menu.byteLength, Number(menuSize));
    assert.equal(createHash("sha256").update(menu).digest("hex"), menuHash);
    assert.equal((await dispatch(server, { url: "/client/files/%2e%2e%2fconfig.sh" })).status, 404);
    assert.equal((await dispatch(server, { url: "/client/files/%252e%252e%252fconfig.sh" })).status, 404);
    assert.equal((await dispatch(server, { url: "/client/files/%" })).status, 400);
    assert.equal((await dispatch(server, { url: `/${"x".repeat(2050)}` })).status, 414);

    for (const path of ["/", "/render", "/control", "/frame.png"]) {
      const response = await dispatch(server, { url: path });
      assert.equal(response.status, 401, `${path} must require credentials`);
      assert.match(response.headers["www-authenticate"] || "", /^Basic realm=/);
    }
    assert.equal(weatherCalls, 0);
    assert.equal(systemCalls, 0);
    assert.equal(frameCalls, 0);

    const adminHeaders = { Authorization: basicAuth() };
    const controlPage = await dispatch(server, { url: "/control", headers: adminHeaders });
    assert.equal(controlPage.status, 200);
    assert.match(controlPage.text, /没有待执行命令/);
    assert.equal((await dispatch(server, { url: "/", headers: adminHeaders })).status, 200);
    assert.equal((await dispatch(server, { url: "/render", headers: adminHeaders })).status, 200);
    assert.equal(weatherCalls, 2);
    assert.equal(systemCalls, 2);
    weatherFailure = true;
    const controlledFailure = await dispatch(server, { url: "/render", headers: adminHeaders });
    assert.equal(controlledFailure.status, 503);
    assert.equal(controlledFailure.text, "Dashboard unavailable");
    weatherFailure = false;

    const unauthorizedLog = await dispatch(server, {
      method: "POST",
      url: "/client/logs/pw4",
      body: "secret log",
    });
    assert.equal(unauthorizedLog.status, 403);
    assert.equal((await dispatch(server, {
      method: "POST",
      url: "/client/logs/pw4",
      headers: { Authorization: basicAuth() },
      body: "admin credentials are not device auth",
    })).status, 403);
    const deviceHeaders = { "X-Device-Token": "test-device-token" };
    const uploadedLog = await dispatch(server, {
      method: "POST",
      url: "/client/logs/pw4",
      headers: deviceHeaders,
      body: "device diagnostic log",
    });
    assert.equal(uploadedLog.status, 201);
    assert.equal(
      await readFile(join(logDirectory, "pw4-latest.log"), "utf8"),
      "device diagnostic log",
    );
    const oversizedLog = await dispatch(server, {
      method: "POST",
      url: "/client/logs/pw4",
      headers: deviceHeaders,
      body: "x".repeat(256 * 1024 + 1),
    });
    assert.equal(oversizedLog.status, 413);

    assert.equal((await dispatch(server, { url: "/client/command/pw4" })).status, 403);
    assert.equal((await dispatch(server, {
      url: "/client/command/pw4",
      headers: adminHeaders,
    })).status, 403);
    assert.equal(
      (await dispatch(server, { url: "/client/command/pw4", headers: deviceHeaders })).text,
      "run",
    );
    const formHeaders = {
      ...adminHeaders,
      Origin: "http://127.0.0.1:8787",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const oversizedControl = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: formHeaders,
      body: `command=${"x".repeat(1025)}`,
    });
    assert.equal(oversizedControl.status, 413);
    const oversizedAck = await dispatch(server, {
      method: "POST",
      url: "/client/command/pw4/ack",
      headers: {
        ...deviceHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `command=${"x".repeat(1025)}`,
    });
    assert.equal(oversizedAck.status, 413);
    const noOrigin = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: {
        ...adminHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "command=refresh",
    });
    assert.equal(noOrigin.status, 403);
    const nullOrigin = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: { ...formHeaders, Origin: "null" },
      body: "command=refresh",
    });
    assert.equal(nullOrigin.status, 403);
    const wrongOrigin = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: { ...formHeaders, Origin: "http://127.0.0.1:9999" },
      body: "command=refresh",
    });
    assert.equal(wrongOrigin.status, 403);
    const setRefresh = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: formHeaders,
      body: "command=refresh",
    });
    assert.equal(setRefresh.status, 303);
    assert.equal(
      (await dispatch(server, { url: "/client/command/pw4", headers: deviceHeaders })).text,
      "refresh",
    );
    assert.match(
      (await dispatch(server, { url: "/control", headers: adminHeaders })).text,
      /refresh（等待设备执行完成）/,
    );
    assert.equal(
      (await dispatch(server, {
        method: "POST",
        url: "/client/command/pw4/ack",
        headers: {
          ...deviceHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "command=refresh",
      })).status,
      200,
    );
    assert.equal(
      (await dispatch(server, { url: "/client/command/pw4", headers: deviceHeaders })).text,
      "run",
    );
    const setStop = await dispatch(server, {
      method: "POST",
      url: "/control/pw4",
      headers: { ...formHeaders, Origin: "http://127.0.0.1:8787" },
      body: "command=stop",
    });
    assert.equal(setStop.status, 303);
    assert.equal(
      (await dispatch(server, { url: "/client/command/pw4", headers: deviceHeaders })).text,
      "stop",
    );
    assert.equal(
      (await dispatch(server, { url: "/client/command/pw4", headers: deviceHeaders })).text,
      "run",
    );
    const updatedControlPage = (await dispatch(server, {
      url: "/control",
      headers: adminHeaders,
    })).text;
    assert.match(updatedControlPage, /停止看板并恢复原界面/);
    assert.match(updatedControlPage, /最后领取：stop/);

    const unauthenticatedFrame = await dispatch(server, { url: "/frame.png" });
    assert.equal(unauthenticatedFrame.status, 401);
    assert.match(unauthenticatedFrame.headers["www-authenticate"] || "", /^Basic realm=/);
    assert.equal(frameCalls, 0);
    const frameResponse = await dispatch(server, { url: "/frame.png", headers: deviceHeaders });
    assert.equal(frameResponse.status, 200);
    assert.equal(frameResponse.headers["content-type"], "image/png");
    assert.equal(frameResponse.headers.etag, '"mock-frame"');
    assert.equal(frameResponse.text, "mock png bytes");
    assert.equal(frameCalls, 1);
    const notModified = await dispatch(server, {
      url: "/frame.png",
      headers: { ...deviceHeaders, "If-None-Match": '"mock-frame"' },
    });
    assert.equal(notModified.status, 304);
    assert.equal(frameCalls, 2);
    assert.equal((await dispatch(server, { url: "/frame.png", headers: adminHeaders })).status, 200);
  } finally {
    await rm(logDirectory, { recursive: true, force: true });
  }
});
