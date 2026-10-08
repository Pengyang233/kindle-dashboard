import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 60_000;

let cachedStatus = null;
let refreshInFlight = null;

function percent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function cpuPercent() {
  const { stdout } = await execFileAsync(
    "/bin/ps",
    ["-A", "-o", "%cpu="],
    { timeout: 5_000, maxBuffer: 512 * 1024 },
  );
  const total = stdout.split(/\r?\n/).reduce((sum, value) => {
    const usage = Number(value.trim());
    return Number.isFinite(usage) ? sum + usage : sum;
  }, 0);
  return percent(total / Math.max(os.cpus().length, 1));
}

function gigabytes(bytes) {
  return Math.round(bytes / 1_000_000_000);
}

export function apfsContainerUsage(plist) {
  const integerValue = (key) => {
    const match = new RegExp(`<key>${key}</key>\\s*<integer>(\\d+)</integer>`).exec(plist);
    return match ? Number(match[1]) : null;
  };
  const totalBytes = integerValue("APFSContainerSize");
  const freeBytes = integerValue("APFSContainerFree");
  if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0) {
    return null;
  }
  return {
    percent: percent(((totalBytes - freeBytes) / totalBytes) * 100),
    usedGb: gigabytes(totalBytes - freeBytes),
    totalGb: gigabytes(totalBytes),
  };
}

async function diskUsageFromDf() {
  const { stdout } = await execFileAsync(
    "/bin/df",
    ["-kP", "/"],
    { timeout: 5_000, maxBuffer: 16 * 1024 },
  );
  const fields = stdout.trim().split(/\r?\n/).at(-1)?.trim().split(/\s+/) || [];
  const capacity = fields.at(-2);
  const match = /^(\d+)%$/.exec(capacity || "");
  const totalKib = Number(fields.at(-5));
  const usedKib = Number(fields.at(-4));
  if (!match || !Number.isFinite(totalKib) || !Number.isFinite(usedKib)) {
    throw new Error("Unable to parse disk usage");
  }
  return {
    percent: percent(Number(match[1])),
    usedGb: Math.round((usedKib * 1024) / 1_000_000_000),
    totalGb: Math.round((totalKib * 1024) / 1_000_000_000),
  };
}

async function diskUsage() {
  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/diskutil",
      ["info", "-plist", "/"],
      { timeout: 5_000, maxBuffer: 64 * 1024 },
    );
    const usage = apfsContainerUsage(stdout);
    if (usage) return usage;
  } catch {
    // Non-macOS hosts and restricted environments fall back to the root volume.
  }
  return diskUsageFromDf();
}

async function memoryPercent() {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/memory_pressure",
      ["-Q"],
      { timeout: 5_000, maxBuffer: 16 * 1024 },
    );
    const match = /memory free percentage:\s*(\d+)%/i.exec(stdout);
    if (match) return percent(100 - Number(match[1]));
  } catch (error) {
    console.error("Unable to read memory pressure:", error.message);
  }

  const total = os.totalmem();
  if (!total) return null;
  return percent(((total - os.freemem()) / total) * 100);
}

async function readFreshStatus() {
  const [cpu, memory, disk] = await Promise.all([
    cpuPercent().catch((error) => {
      console.error("Unable to read CPU usage:", error.message);
      return null;
    }),
    memoryPercent(),
    diskUsage().catch((error) => {
      console.error("Unable to read disk usage:", error.message);
      return null;
    }),
  ]);

  return {
    cpu,
    memory,
    disk,
    fetchedAt: new Date(),
  };
}

export async function getSystemStatus() {
  if (cachedStatus && Date.now() - cachedStatus.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cachedStatus;
  }

  if (!refreshInFlight) {
    refreshInFlight = readFreshStatus()
      .then((status) => {
        cachedStatus = status;
        return status;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  try {
    return await refreshInFlight;
  } catch (error) {
    console.error("Unable to read Mac mini status:", error.message);
    return cachedStatus;
  }
}
