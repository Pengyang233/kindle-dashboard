import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export async function writeLaunchAgent(target, nodeBinary) {
  const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
  const template = await readFile(new URL("../macos/local.kindle-dashboard.plist.template", import.meta.url), "utf8");
  const content = template.replaceAll("__NODE_BINARY__", escapeXml(nodeBinary)).replaceAll("__PROJECT_DIR__", escapeXml(root));
  await writeFile(target, content, { mode: 0o600 });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) process.exitCode = 1;
  else await writeLaunchAgent(process.argv[2], process.argv[3]);
}
