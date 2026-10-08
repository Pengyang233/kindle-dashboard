import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupLocal } from "../scripts/setup-local.js";

test("local setup writes distinct random secrets privately and never overwrites existing configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-config-"));
  try {
    const target = await setupLocal(directory);
    const contents = await readFile(target, "utf8");
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    const token = /^DASHBOARD_DEVICE_TOKEN=([a-f0-9]{64})$/m.exec(contents)?.[1];
    const password = /^DASHBOARD_ADMIN_PASSWORD=([a-f0-9]{64})$/m.exec(contents)?.[1];
    assert.ok(token && password);
    assert.notEqual(token, password);
    assert.match(contents, /^HOST=127\.0\.0\.1$/m);
    assert.match(contents, /^WEATHER_LATITUDE=$/m);
    await assert.rejects(setupLocal(directory), { code: "EEXIST" });
    assert.equal(await readFile(target, "utf8"), contents);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

import { escapeXml, writeLaunchAgent } from "../scripts/write-launch-agent.js";
test("launch agent escapes paths and never embeds local credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-plist-"));
  try {
    const target = join(directory, "service.plist");
    await writeLaunchAgent(target, "/example/a&b<node>");
    const content = await readFile(target, "utf8");
    assert.match(content, /a&amp;b&lt;node&gt;/);
    assert.doesNotMatch(content, /DEVICE_TOKEN|ADMIN_PASSWORD/);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.equal(escapeXml('a"b'), "a&quot;b");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
