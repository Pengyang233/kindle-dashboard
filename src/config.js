import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { validateWeatherCoordinates } from "./weather.js";

const DEFAULT_ENV_PATH = fileURLToPath(new URL("../.env.local", import.meta.url));
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseValue(source, lineNumber) {
  const value = source.trim();
  if (!value) return "";

  if (value[0] === "'" || value[0] === '"') {
    const quote = value[0];
    let closingIndex = -1;
    for (let index = 1; index < value.length; index += 1) {
      if (quote === '"' && value[index] === "\\") {
        index += 1;
      } else if (value[index] === quote) {
        closingIndex = index;
        break;
      }
    }
    const suffix = closingIndex < 0 ? "" : value.slice(closingIndex + 1).trim();
    if (closingIndex < 0 || (suffix !== "" && !suffix.startsWith("#"))) {
      throw new Error(`Invalid .env.local syntax on line ${lineNumber}`);
    }
    const quoted = value.slice(1, closingIndex);
    if (quote === "'") return quoted;
    return quoted.replace(/\\([\\"nrt$])/g, (_match, escaped) => {
      if (escaped === "n") return "\n";
      if (escaped === "r") return "\r";
      if (escaped === "t") return "\t";
      return escaped;
    });
  }

  return value.replace(/\s+#.*$/, "").trim();
}

export function parseEnvFile(contents) {
  const values = {};
  for (const [index, sourceLine] of contents.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!assignment || !ENV_NAME.test(assignment[1])) {
      throw new Error(`Invalid .env.local syntax on line ${index + 1}`);
    }
    values[assignment[1]] = parseValue(assignment[2], index + 1);
  }
  return values;
}

export function loadLocalConfig({ path = DEFAULT_ENV_PATH, env = process.env } = {}) {
  let fileValues = {};
  if (env.NODE_ENV !== "test") {
    try {
      fileValues = parseEnvFile(readFileSync(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        if (error.message.startsWith("Invalid .env.local syntax")) throw error;
        throw new Error("Unable to read .env.local configuration");
      }
    }
  }

  const merged = { ...fileValues };
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) merged[name] = String(value);
  }
  return merged;
}

function isLoopbackHost(host) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    (isIP(normalized) === 4 && normalized.startsWith("127."));
}

function parseOrigin(value, index) {
  const origin = value.trim();
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid DASHBOARD_CONTROL_ORIGINS entry ${index}`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== origin ||
    parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash
  ) {
    throw new Error(`Invalid DASHBOARD_CONTROL_ORIGINS entry ${index}`);
  }
  return origin;
}

function controlOriginsFor(source, host, port) {
  if (source.DASHBOARD_CONTROL_ORIGINS !== undefined) {
    if (source.DASHBOARD_CONTROL_ORIGINS === "") return [];
    const entries = source.DASHBOARD_CONTROL_ORIGINS.split(",");
    if (entries.some((entry) => entry.trim() === "")) {
      throw new Error("Invalid DASHBOARD_CONTROL_ORIGINS entry");
    }
    return [...new Set(entries.map(parseOrigin))];
  }
  if (!isLoopbackHost(host)) return [];
  return [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ];
}

export function validateServerConfig(env = process.env) {
  const source = loadLocalConfig({ env });
  const host = source.HOST?.trim() || "127.0.0.1";
  const rawPort = source.PORT === undefined || source.PORT === "" ? "8787" : source.PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }

  const deviceToken = source.DASHBOARD_DEVICE_TOKEN;
  const adminPassword = source.DASHBOARD_ADMIN_PASSWORD;
  const adminUser = source.DASHBOARD_ADMIN_USER?.trim() || "admin";
  if (typeof deviceToken !== "string" || deviceToken.trim() === "" || /[\r\n]/.test(deviceToken)) {
    throw new Error("DASHBOARD_DEVICE_TOKEN is required and must be a valid header value");
  }
  if (typeof adminPassword !== "string" || adminPassword.trim() === "") {
    throw new Error("DASHBOARD_ADMIN_PASSWORD is required");
  }
  if (adminUser.includes(":") || /[\r\n]/.test(adminUser)) {
    throw new Error("DASHBOARD_ADMIN_USER must not contain a colon or newline");
  }

  const deviceId = source.DASHBOARD_DEVICE_ID?.trim() || "pw4";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(deviceId)) {
    throw new Error("DASHBOARD_DEVICE_ID is invalid");
  }

  const weatherCoordinates = validateWeatherCoordinates({
    latitude: source.WEATHER_LATITUDE,
    longitude: source.WEATHER_LONGITUDE,
  });
  const timezone = source.DASHBOARD_TIMEZONE?.trim() || "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("DASHBOARD_TIMEZONE must be a valid IANA time zone");
  }

  return {
    host,
    port,
    deviceToken,
    adminUser,
    adminPassword,
    controlOrigins: controlOriginsFor(source, host, port),
    deviceId,
    deviceLogDirectory: source.DEVICE_LOG_DIR || undefined,
    clientDistributionDirectory: source.CLIENT_DISTRIBUTION_DIR || fileURLToPath(new URL("../runtime/client-releases/current/", import.meta.url)),
    weatherLatitude: weatherCoordinates?.latitude,
    weatherLongitude: weatherCoordinates?.longitude,
    weatherConfigured: weatherCoordinates !== null,
    weatherCacheFile: source.WEATHER_CACHE_FILE || undefined,
    city: source.DASHBOARD_CITY?.trim() || "当地",
    timezone,
  };
}
