import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export async function setupLocal(directory = fileURLToPath(new URL("../", import.meta.url))) {
  const target = resolve(directory, ".env.local");
  await mkdir(directory, { recursive: true });
  const contents = [
    "# Local configuration: keep private. Fill weather coordinates and LAN settings if needed.",
    "DASHBOARD_CITY=Example", "DASHBOARD_TIMEZONE=Asia/Shanghai",
    "WEATHER_LATITUDE=", "WEATHER_LONGITUDE=", "HOST=127.0.0.1", "PORT=8787",
    "DASHBOARD_DEVICE_ID=pw4", "CLIENT_DISTRIBUTION_DIR=", `DASHBOARD_DEVICE_TOKEN=${randomBytes(32).toString("hex")}`,
    "DASHBOARD_ADMIN_USER=admin", `DASHBOARD_ADMIN_PASSWORD=${randomBytes(32).toString("hex")}`,
    "DASHBOARD_CONTROL_ORIGINS=http://127.0.0.1:8787,http://localhost:8787", "",
  ].join("\n");
  await writeFile(target, contents, { flag: "wx", mode: 0o600 });
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await setupLocal();
    console.log("Created .env.local with independent random credentials (mode 0600). Edit it locally; no secrets were printed.");
  } catch (error) {
    console.error(error.code === "EEXIST" ? ".env.local already exists; left unchanged." : "Unable to create local configuration.");
    process.exitCode = 1;
  }
}
