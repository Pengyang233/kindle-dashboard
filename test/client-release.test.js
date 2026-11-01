import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageClientRelease } from "../scripts/stage-client-release.js";
import { getClientFile, getClientManifest } from "../src/client-distribution.js";

test("fixed release serves the staged client while working source evolves", async () => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-release-"));
  try {
    const source = join(root, "source");
    await cp(fileURLToPath(new URL("../kindle/kindle-dashboard", import.meta.url)), source, { recursive: true });
    const output = join(root, "releases");
    const first = await stageClientRelease({ source, output });
    const before = await getClientManifest(first);
    const firstVersion = (await readFile(join(first, "VERSION"), "utf8")).trim();
    assert.equal(await stageClientRelease({ source, output }), first);
    await writeFile(join(source, "bin/status.sh"), "#!/bin/sh\necho changed\n");
    assert.equal(await getClientManifest(first), before);
    await assert.rejects(stageClientRelease({ source, output }), /increment VERSION/);
    await writeFile(join(source, "VERSION"), "99.0.0\n");
    await assert.rejects(stageClientRelease({ source, output }), /config.xml must match/);
    const metadata = await readFile(join(source, "config.xml"), "utf8");
    await writeFile(join(source, "config.xml"), metadata.replace(`<version>${firstVersion}</version>`, "<version>99.0.0</version>"));
    const second = await stageClientRelease({ source, output });
    assert.notEqual(first, second);
    assert.notEqual(await getClientManifest(second), before);
    assert.equal(await getClientFile("config.sh", first), null);
    assert.equal(await getClientFile("../VERSION", first), null);
    assert.equal((await readFile(join(first, "VERSION"), "utf8")).trim(), firstVersion);
  } finally { await rm(root, { recursive: true, force: true }); }
});
