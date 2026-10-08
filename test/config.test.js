import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDashboardServer } from "../src/server.js";
import {
  loadLocalConfig,
  parseEnvFile,
  validateServerConfig,
} from "../src/config.js";

test("parses a safe dotenv subset without shell expansion", () => {
  assert.deepEqual(parseEnvFile(`
# local-only configuration
export DASHBOARD_ADMIN_USER=admin
DASHBOARD_ADMIN_PASSWORD="safe $VALUE\\nsecond line" # comment
DASHBOARD_DEVICE_TOKEN='literal $TOKEN'
PORT=8787
`), {
    DASHBOARD_ADMIN_USER: "admin",
    DASHBOARD_ADMIN_PASSWORD: "safe $VALUE\nsecond line",
    DASHBOARD_DEVICE_TOKEN: "literal $TOKEN",
    PORT: "8787",
  });
  assert.throws(() => parseEnvFile("DASHBOARD_PASSWORD='unterminated"), /line 1/);
});

test("merges environment over the fixed local file and skips it in tests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kindle-config-"));
  const envPath = join(directory, ".env.local");
  await writeFile(
    envPath,
    "DASHBOARD_DEVICE_TOKEN=file-token\nDASHBOARD_ADMIN_PASSWORD=file-admin\nPORT=9000\nWEATHER_LATITUDE=12.5\nWEATHER_LONGITUDE=-45.5\nDASHBOARD_CITY=From file\nDASHBOARD_TIMEZONE=Asia/Tokyo\n",
    "utf8",
  );
  try {
    const merged = loadLocalConfig({
      path: envPath,
      env: { NODE_ENV: "development", DASHBOARD_DEVICE_TOKEN: "environment-token" },
    });
    assert.deepEqual(
      merged,
      {
        DASHBOARD_DEVICE_TOKEN: "environment-token",
        DASHBOARD_ADMIN_PASSWORD: "file-admin",
        PORT: "9000",
        WEATHER_LATITUDE: "12.5",
        WEATHER_LONGITUDE: "-45.5",
        DASHBOARD_CITY: "From file",
        DASHBOARD_TIMEZONE: "Asia/Tokyo",
        NODE_ENV: "development",
      },
    );
    const config = validateServerConfig({ ...merged, NODE_ENV: "test" });
    assert.equal(config.deviceToken, "environment-token");
    assert.equal(config.port, 9000);
    assert.equal(config.city, "From file");
    assert.equal(config.weatherLatitude, 12.5);
    assert.equal(config.weatherLongitude, -45.5);
    assert.equal(config.timezone, "Asia/Tokyo");
    assert.deepEqual(
      loadLocalConfig({ path: envPath, env: { NODE_ENV: "test" } }),
      { NODE_ENV: "test" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails closed when device or admin secrets are missing", () => {
  assert.throws(
    () => validateServerConfig({ NODE_ENV: "test" }),
    /DASHBOARD_DEVICE_TOKEN is required/,
  );
  assert.throws(
    () => validateServerConfig({ NODE_ENV: "test", DASHBOARD_DEVICE_TOKEN: "device" }),
    /DASHBOARD_ADMIN_PASSWORD is required/,
  );
  assert.throws(
    () => validateServerConfig({
      NODE_ENV: "test",
      DASHBOARD_DEVICE_TOKEN: "   ",
      DASHBOARD_ADMIN_PASSWORD: "admin-password",
    }),
    /DASHBOARD_DEVICE_TOKEN is required/,
  );
  assert.throws(
    () => validateServerConfig({
      NODE_ENV: "test",
      DASHBOARD_DEVICE_TOKEN: "device\ntoken",
      DASHBOARD_ADMIN_PASSWORD: "admin-password",
    }),
    /valid header value/,
  );
  assert.throws(
    () => validateServerConfig({
      NODE_ENV: "test",
      DASHBOARD_DEVICE_TOKEN: "device-token",
      DASHBOARD_ADMIN_PASSWORD: "   ",
    }),
    /DASHBOARD_ADMIN_PASSWORD is required/,
  );
  assert.throws(
    () => createDashboardServer({ adminUser: "admin", adminPassword: "password" }),
    /credentials are required/,
  );
});

test("uses loopback-only default origins and validates exact configured origins", () => {
  const base = {
    NODE_ENV: "test",
    DASHBOARD_DEVICE_TOKEN: "device-token",
    DASHBOARD_ADMIN_PASSWORD: "admin-password",
  };
  const config = validateServerConfig(base);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.adminUser, "admin");
  assert.equal(config.deviceId, "pw4");
  assert.equal(config.weatherConfigured, false);
  assert.deepEqual(config.controlOrigins, [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ]);

  assert.deepEqual(
    validateServerConfig({ ...base, HOST: "0.0.0.0" }).controlOrigins,
    [],
  );
  assert.deepEqual(
    validateServerConfig({
      ...base,
      DASHBOARD_CONTROL_ORIGINS: "https://dashboard.example, http://localhost:8787",
    }).controlOrigins,
    ["https://dashboard.example", "http://localhost:8787"],
  );
  assert.throws(
    () => validateServerConfig({
      ...base,
      DASHBOARD_CONTROL_ORIGINS: "https://dashboard.example/path",
    }),
    /Invalid DASHBOARD_CONTROL_ORIGINS/,
  );
  assert.throws(
    () => validateServerConfig({ ...base, PORT: "8787abc" }),
    /PORT must be an integer/,
  );
  const configuredWeather = validateServerConfig({
    ...base,
    WEATHER_LATITUDE: "12.5",
    WEATHER_LONGITUDE: "-45.5",
    DASHBOARD_CITY: "Demo location",
    DASHBOARD_TIMEZONE: "Asia/Tokyo",
  });
  assert.equal(configuredWeather.weatherConfigured, true);
  assert.equal(configuredWeather.weatherLatitude, 12.5);
  assert.equal(configuredWeather.weatherLongitude, -45.5);
  assert.equal(configuredWeather.city, "Demo location");
  assert.equal(configuredWeather.timezone, "Asia/Tokyo");
  assert.throws(
    () => validateServerConfig({ ...base, WEATHER_LATITUDE: "12.5" }),
    /Both WEATHER_LATITUDE and WEATHER_LONGITUDE are required/,
  );
  assert.throws(
    () => validateServerConfig({ ...base, WEATHER_LATITUDE: "91", WEATHER_LONGITUDE: "-45.5" }),
    /valid latitude and longitude/,
  );
  assert.throws(
    () => validateServerConfig({ ...base, DASHBOARD_TIMEZONE: "not-a-time-zone" }),
    /DASHBOARD_TIMEZONE must be a valid IANA time zone/,
  );
});
