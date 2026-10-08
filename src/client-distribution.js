import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const clientRoot = new URL("../kindle/kindle-dashboard/", import.meta.url);

export const CLIENT_FILES = Object.freeze([
  "VERSION",
  "config.xml",
  "menu.json",
  "lib/common.sh",
  "bin/dashboard-daemon.sh",
  "bin/display-frame.sh",
  "bin/fetch-frame.sh",
  "bin/install-autostart.sh",
  "bin/refresh-now.sh",
  "bin/remove-autostart.sh",
  "bin/restore-ui.sh",
  "bin/start-dashboard.sh",
  "bin/status.sh",
  "bin/stop-dashboard.sh",
  "bin/update-and-restart.sh",
  "bin/update-client.sh",
  "bin/upload-log.sh",
]);

const clientFileSet = new Set(CLIENT_FILES);

function distributionRoot(directory) {
  return directory ? pathToFileURL(resolve(directory) + sep) : clientRoot;
}

export async function getClientVersion(directory) {
  return (await readFile(new URL("VERSION", distributionRoot(directory)), "utf8")).trim();
}

export async function getClientFile(relativePath, directory) {
  if (!clientFileSet.has(relativePath)) return null;
  return readFile(new URL(relativePath, distributionRoot(directory)));
}

export async function getClientManifest(directory) {
  const version = await getClientVersion(directory);
  const records = await Promise.all(
    CLIENT_FILES.map(async (relativePath) => {
      const content = await getClientFile(relativePath, directory);
      const digest = createHash("sha256").update(content).digest("hex");
      return `file ${digest} ${content.byteLength} ${relativePath}`;
    }),
  );

  return [`version ${version}`, ...records, ""].join("\n");
}
