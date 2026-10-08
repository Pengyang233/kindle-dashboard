import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_FILES, getClientManifest, getClientVersion } from "../src/client-distribution.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export async function stageClientRelease({ source = join(projectRoot, "kindle/kindle-dashboard"), output = join(projectRoot, "runtime/client-releases") } = {}) {
  const manifest = await getClientManifest(source);
  const version = await getClientVersion(source);
  if (!/^[A-Za-z0-9._-]+$/.test(version)) throw new Error("Invalid client version");
  const metadata = await readFile(join(source, "config.xml"), "utf8");
  if (/<version>\s*([^<]+?)\s*<\/version>/.exec(metadata)?.[1] !== version) {
    throw new Error("VERSION and config.xml must match");
  }
  const digest = createHash("sha256").update(manifest).digest("hex").slice(0, 16);
  const target = join(output, `${version}-${digest}`);
  await mkdir(output, { recursive: true });
  try {
    if (await getClientManifest(target) !== manifest) throw new Error("Existing release differs from expected contents");
    return target;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if ((await readdir(output)).some((name) => name.startsWith(`${version}-`))) {
    throw new Error("Client content changed: increment VERSION and config.xml before staging");
  }
  const stage = await mkdtemp(join(output, ".staging-"));
  try {
    for (const name of CLIENT_FILES) {
      const input = join(source, name);
      if (!(await lstat(input)).isFile()) throw new Error("Release input must be a regular file");
      const destination = join(stage, name);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(input, destination);
      await chmod(destination, 0o444);
    }
    if (await getClientManifest(stage) !== manifest) throw new Error("Release inputs changed while staging");
    await rename(stage, target);
    return target;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

async function configureLocalRelease(target) {
  const configPath = join(projectRoot, ".env.local");
  const existing = await readFile(configPath, "utf8");
  const setting = `CLIENT_DISTRIBUTION_DIR=${JSON.stringify(target)}`;
  const next = /^CLIENT_DISTRIBUTION_DIR=.*$/m.test(existing)
    ? existing.replace(/^CLIENT_DISTRIBUTION_DIR=.*$/m, () => setting)
    : `${existing.trimEnd()}\n${setting}\n`;
  const temp = `${configPath}.tmp`;
  await writeFile(temp, next, { flag: "wx", mode: 0o600 });
  await rename(temp, configPath);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await readFile(join(projectRoot, ".env.local"));
    await configureLocalRelease(await stageClientRelease());
    console.log("Staged a fixed client snapshot and selected it in local configuration. Source edits do not change this snapshot.");
  } catch {
    console.error("Unable to stage or configure client release. Run setup-local first; existing release snapshots were not replaced.");
    process.exitCode = 1;
  }
}
