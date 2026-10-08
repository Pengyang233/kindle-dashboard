import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getClientFile,
  getClientManifest,
} from "./client-distribution.js";
import { validateServerConfig } from "./config.js";
import { renderDashboard } from "./dashboard.js";
import {
  acknowledgeDeviceCommand,
  pollDeviceCommand,
  renderControlPage,
  setDeviceCommand,
} from "./device-control.js";
import { getFramePng } from "./frame-renderer.js";
import { getSystemStatus } from "./system-status.js";
import { getWeather as fetchWeather } from "./weather.js";

const MAX_DEVICE_LOG_BYTES = 256 * 1024;
const MAX_CONTROL_BODY_BYTES = 1024;
const MAX_URL_BYTES = 2048;
const weatherIconNames = new Set([
  "sun.png",
  "partly-cloudy.png",
  "cloud.png",
  "fog.png",
  "rain.png",
  "snow.png",
  "storm.png",
]);
const defaultDeviceLogDirectory = fileURLToPath(
  new URL("../runtime/device-logs/", import.meta.url),
);

function sendText(response, status, message, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(message);
}

function failRequest(response, error) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const status = Number(error?.statusCode);
  if (status === 400) return sendText(response, 400, "Invalid request");
  if (status === 413) return sendText(response, 413, "Payload too large");
  if (status === 414) return sendText(response, 414, "Request URL too long");
  if (status === 503) return sendText(response, 503, "Dashboard unavailable");
  sendText(response, 500, "Internal server error");
}

function parseRequestUrl(request) {
  const raw = request.url;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    const error = new Error("Invalid request target");
    error.statusCode = 400;
    throw error;
  }
  if (Buffer.byteLength(raw) > MAX_URL_BYTES) {
    const error = new Error("Request URL too long");
    error.statusCode = 414;
    throw error;
  }

  let url;
  try {
    url = new URL(raw, "http://localhost");
    decodeURIComponent(url.pathname);
  } catch {
    const error = new Error("Invalid request target");
    error.statusCode = 400;
    throw error;
  }
  if (url.hash) {
    const error = new Error("Invalid request target");
    error.statusCode = 400;
    throw error;
  }
  return url;
}

async function readRequestBody(request, limit) {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength)) {
      const error = new Error("Invalid content length");
      error.statusCode = 400;
      throw error;
    }
    if (Number(contentLength) > limit) {
      request.resume();
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
  }

  const chunks = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    if (tooLarge) continue;
    bytes += chunk.byteLength;
    if (bytes > limit) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    const error = new Error("Request body too large");
    error.statusCode = 413;
    throw error;
  }
  return Buffer.concat(chunks);
}

async function saveDeviceLog(deviceId, body, directory) {
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filename = `${deviceId}-${timestamp}.log`;
  await writeFile(join(directory, filename), body);
  await writeFile(join(directory, `${deviceId}-latest.log`), body);
  return filename;
}

function secretMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function hasAdminCredentials(request, config) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return false;

  let decoded;
  try {
    const bytes = Buffer.from(match[1], "base64");
    if (bytes.toString("base64").replace(/=+$/, "") !== match[1].replace(/=+$/, "")) {
      return false;
    }
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const userMatches = secretMatches(username, config.adminUser);
  const passwordMatches = secretMatches(password, config.adminPassword);
  return userMatches && passwordMatches;
}

function hasDeviceToken(request, config) {
  return secretMatches(request.headers["x-device-token"], config.deviceToken);
}

function sendAdminChallenge(response) {
  sendText(response, 401, "Unauthorized", {
    "WWW-Authenticate": 'Basic realm="Kindle Dashboard", charset="UTF-8"',
  });
}

function requireAdmin(request, response, config) {
  if (hasAdminCredentials(request, config)) return true;
  sendAdminChallenge(response);
  return false;
}

function requireDevice(request, response, config) {
  if (hasDeviceToken(request, config)) return true;
  sendText(response, 403, "Forbidden");
  return false;
}

function requireControlOrigin(request, response, config) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && config.controlOrigins.includes(origin)) return true;
  sendText(response, 403, "Forbidden");
  return false;
}

function adminPage(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function serviceFunctions(config, services) {
  return {
    getWeather: services.getWeather || (() => fetchWeather({
      latitude: config.weatherLatitude,
      longitude: config.weatherLongitude,
      timezone: config.timezone,
      cacheFile: config.weatherCacheFile,
    })),
    getSystemStatus: services.getSystemStatus || getSystemStatus,
    renderDashboard: services.renderDashboard || renderDashboard,
    getFramePng: services.getFramePng || getFramePng,
  };
}

export function createDashboardServer(config, services = {}) {
  if (
    !config || typeof config.deviceToken !== "string" || !config.deviceToken ||
    typeof config.adminUser !== "string" || !config.adminUser ||
    typeof config.adminPassword !== "string" || !config.adminPassword
  ) {
    throw new Error("Device and admin credentials are required");
  }
  const allowedOrigins = Array.isArray(config.controlOrigins) ? config.controlOrigins : [];
  const effectiveConfig = {
    ...config,
    deviceId: config.deviceId || "pw4",
    controlOrigins: allowedOrigins,
    deviceLogDirectory: config.deviceLogDirectory || defaultDeviceLogDirectory,
    city: config.city || "当地",
    timezone: config.timezone || "Asia/Shanghai",
  };
  const dependencies = serviceFunctions(effectiveConfig, services);

  return createServer(async (request, response) => {
    try {
      const url = parseRequestUrl(request);

      if (url.pathname === "/health" && request.method === "GET") {
        sendText(response, 200, "ok");
        return;
      }

      if (url.pathname === "/client/manifest.txt" && request.method === "GET") {
        const manifest = await getClientManifest(effectiveConfig.clientDistributionDirectory);
        response.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": Buffer.byteLength(manifest),
          "Cache-Control": "no-store",
        });
        response.end(manifest);
        return;
      }

      const commandMatch = url.pathname.match(/^\/client\/command\/([a-zA-Z0-9_-]{1,40})$/);
      if (commandMatch && request.method === "GET") {
        if (!requireDevice(request, response, effectiveConfig)) return;
        sendText(response, 200, pollDeviceCommand(commandMatch[1]));
        return;
      }

      const commandAckMatch = url.pathname.match(/^\/client\/command\/([a-zA-Z0-9_-]{1,40})\/ack$/);
      if (commandAckMatch && request.method === "POST") {
        if (!requireDevice(request, response, effectiveConfig)) return;
        const body = new URLSearchParams(
          (await readRequestBody(request, MAX_CONTROL_BODY_BYTES)).toString("utf8"),
        );
        try {
          acknowledgeDeviceCommand(commandAckMatch[1], body.get("command"));
          sendText(response, 200, "ok");
        } catch {
          sendText(response, 400, "Invalid command");
        }
        return;
      }

      if (url.pathname === "/control" && request.method === "GET") {
        if (!requireAdmin(request, response, effectiveConfig)) return;
        adminPage(response, renderControlPage(effectiveConfig.deviceId));
        return;
      }

      const controlMatch = url.pathname.match(/^\/control\/([a-zA-Z0-9_-]{1,40})$/);
      if (controlMatch && request.method === "POST") {
        if (!requireAdmin(request, response, effectiveConfig)) return;
        if (!requireControlOrigin(request, response, effectiveConfig)) return;
        const body = new URLSearchParams(
          (await readRequestBody(request, MAX_CONTROL_BODY_BYTES)).toString("utf8"),
        );
        try {
          setDeviceCommand(controlMatch[1], body.get("command"));
          response.writeHead(303, { Location: "/control" });
          response.end();
        } catch {
          sendText(response, 400, "Invalid command");
        }
        return;
      }

      const clientFileMatch = url.pathname.match(/^\/client\/files\/(.+)$/);
      if (clientFileMatch && request.method === "GET") {
        let relativePath;
        try {
          relativePath = decodeURIComponent(clientFileMatch[1]);
        } catch {
          sendText(response, 400, "Invalid path");
          return;
        }
        const content = await getClientFile(relativePath, effectiveConfig.clientDistributionDirectory);
        if (!content) {
          sendText(response, 404, "Not found");
          return;
        }
        response.writeHead(200, {
          "Content-Type": relativePath.endsWith(".json")
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8",
          "Content-Length": content.byteLength,
          "Cache-Control": "no-store",
        });
        response.end(content);
        return;
      }

      const deviceLogMatch = url.pathname.match(/^\/client\/logs\/([a-zA-Z0-9_-]{1,40})$/);
      if (deviceLogMatch && request.method === "POST") {
        if (!requireDevice(request, response, effectiveConfig)) return;
        const body = await readRequestBody(request, MAX_DEVICE_LOG_BYTES);
        if (body.byteLength === 0) {
          sendText(response, 400, "Empty log");
          return;
        }
        await saveDeviceLog(
          deviceLogMatch[1],
          body,
          effectiveConfig.deviceLogDirectory,
        );
        sendText(response, 201, "ok");
        return;
      }

      if (url.pathname === "/frame.png" && request.method === "GET") {
        if (!hasDeviceToken(request, effectiveConfig) && !hasAdminCredentials(request, effectiveConfig)) {
          sendAdminChallenge(response);
          return;
        }
        let frame;
        try {
          const [weather, system] = await Promise.all([
            dependencies.getWeather(),
            dependencies.getSystemStatus(),
          ]);
          const html = dependencies.renderDashboard({
            weather,
            system,
            city: effectiveConfig.city,
            timezone: effectiveConfig.timezone,
            weatherConfigured: effectiveConfig.weatherConfigured ?? true,
          });
          frame = await dependencies.getFramePng(html);
        } catch {
          sendText(response, 503, "Dashboard unavailable");
          return;
        }

        if (request.headers["if-none-match"] === frame.etag) {
          response.writeHead(304, { ETag: frame.etag });
          response.end();
          return;
        }

        response.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": frame.png.byteLength,
          "Cache-Control": "no-cache",
          ETag: frame.etag,
          "X-Frame-Stale": frame.stale ? "1" : "0",
        });
        response.end(frame.png);
        return;
      }

      const iconMatch = url.pathname.match(/^\/weather-icons\/([^/]+\.png)$/);
      if (request.method === "GET" && iconMatch && weatherIconNames.has(iconMatch[1])) {
        try {
          const icon = await readFile(
            new URL(`../public/weather-icons/${iconMatch[1]}`, import.meta.url),
          );
          response.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": icon.byteLength,
            "Cache-Control": "public, max-age=86400",
          });
          response.end(icon);
        } catch {
          sendText(response, 404, "Not found");
        }
        return;
      }

      if (["/", "/render"].includes(url.pathname) && request.method === "GET") {
        if (!requireAdmin(request, response, effectiveConfig)) return;
        try {
          const [weather, system] = await Promise.all([
            dependencies.getWeather(),
            dependencies.getSystemStatus(),
          ]);
          const html = dependencies.renderDashboard({
            weather,
            system,
            city: effectiveConfig.city,
            timezone: effectiveConfig.timezone,
            weatherConfigured: effectiveConfig.weatherConfigured ?? true,
          });
          adminPage(response, html);
        } catch {
          sendText(response, 503, "Dashboard unavailable");
        }
        return;
      }

      sendText(response, 404, "Not found");
    } catch (error) {
      failRequest(response, error);
    }
  });
}

export async function startDashboardServer(config = validateServerConfig()) {
  await getClientManifest(config.clientDistributionDirectory);
  const server = createDashboardServer(config);
  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => rejectListen(error);
    server.once("error", onError);
    server.listen(config.port, config.host, () => {
      server.removeListener("error", onError);
      resolveListen();
    });
  });
  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  startDashboardServer()
    .then((server) => {
      const address = server.address();
      console.log(`Kindle dashboard listening on ${address.address}:${address.port}`);
    })
    .catch((error) => {
      const message = error?.message?.startsWith("Unable to read .env.local") ||
        error?.message?.startsWith("Invalid .env.local") ||
        error?.message?.startsWith("DASHBOARD_") ||
        error?.message?.startsWith("HOST ") ||
        error?.message?.startsWith("PORT ") ||
        error?.message?.startsWith("Device and admin")
        ? error.message
        : "Unable to start dashboard server";
      console.error(message);
      process.exitCode = 1;
    });
}
