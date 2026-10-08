import assert from "node:assert/strict";
import { once } from "node:events";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  CLIENT_FILES,
  getClientFile,
  getClientManifest,
} from "../src/client-distribution.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const clientSource = join(projectRoot, "kindle", "kindle-dashboard");

async function runScript(script, { cwd, env = {}, timeout = 15_000 } = {}) {
  const child = spawn("/bin/sh", [script], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const [code, signal] = await once(child, "close");
  clearTimeout(timer);
  return { code, signal, stdout, stderr };
}

async function runCommand(command, args, { cwd, env = {}, timeout = 15_000 } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const [code, signal] = await once(child, "close");
  clearTimeout(timer);
  return { code, signal, stdout, stderr };
}

async function writeExecutable(path, contents) {
  await writeFile(path, contents);
  await chmod(path, 0o755);
}

async function makeClientCopy(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const extension = join(root, "kindle-dashboard");
  await cp(clientSource, extension, { recursive: true });
  return { root, extension };
}

test("the 17-file protocol upgrades a local 1.0.5-version installation and preserves rollback safety", async () => {
  const successful = await makeClientCopy("kindle-update-ok-");
  const failed = await makeClientCopy("kindle-update-fail-");
  const fakeBin = join(successful.root, "fake-bin");
  const releaseRoot = join(successful.root, "release");
  await mkdir(fakeBin);
  await mkdir(join(releaseRoot, "files"), { recursive: true });
  await writeFile(join(releaseRoot, "manifest.txt"), await getClientManifest());
  for (const relativePath of CLIENT_FILES) {
    const releaseFile = join(releaseRoot, "files", relativePath);
    await mkdir(dirname(releaseFile), { recursive: true });
    await writeFile(releaseFile, await getClientFile(relativePath));
  }
  await writeExecutable(
    join(fakeBin, "curl"),
    '#!/bin/sh\nout=""\nurl=""\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -o) out="$2"; shift 2;;\n    --connect-timeout|--max-time) shift 2;;\n    -f|-sS|-L) shift;;\n    -*) shift;;\n    *) url="$1"; shift;;\n  esac\ndone\ncase "$url" in\n  */client/manifest.txt) source_file="$MOCK_RELEASE_ROOT/manifest.txt";;\n  */client/files/*) relative_path="${url#*/client/files/}"; source_file="$MOCK_RELEASE_ROOT/files/$relative_path";;\n  *) exit 22;;\nesac\nif [ ! -f "$source_file" ]; then exit 22; fi\nif [ "${MOCK_CORRUPT_MENU:-0}" = 1 ] && [ "$relative_path" = menu.json ]; then printf corrupt > "$out"; else cp "$source_file" "$out"; fi\n',
  );
  try {
    const localConfig = 'DASHBOARD_BASE_URL="http://mock-server"\nDEVICE_ID="test-pw4"\nDEVICE_TOKEN="local-only"\nWIFI_SETTLE_SECONDS=0\nLOCAL_MARKER="preserve-me"\n';
    await writeFile(join(successful.extension, "config.sh"), localConfig);
    await writeFile(join(successful.extension, "VERSION"), "1.0.5\n");
    await writeFile(join(successful.extension, "menu.json"), "old menu\n");
    const successResult = await runScript(
      join(successful.extension, "bin", "update-client.sh"),
      {
        cwd: successful.extension,
        env: {
          KINDLE_DASHBOARD_DIR: successful.extension,
          MOCK_RELEASE_ROOT: releaseRoot,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(successResult.code, 20, successResult.stderr);
    assert.equal(await readFile(join(successful.extension, "VERSION"), "utf8"), "1.0.6\n");
    assert.equal(await readFile(join(successful.extension, "config.sh"), "utf8"), localConfig);
    assert.doesNotMatch(await readFile(join(successful.extension, "menu.json"), "utf8"), /old menu/);
    assert.ok((await stat(join(successful.extension, "bin", "update-client.sh"))).mode & 0o100);
    assert.equal(
      await readFile(join(successful.extension, "state", "update-rollback", "VERSION"), "utf8"),
      "1.0.5\n",
      "the previous release remains available in the updater rollback backup",
    );

    await writeFile(join(failed.extension, "config.sh"), localConfig);
    await writeFile(join(failed.extension, "VERSION"), "0.8.0\n");
    await writeFile(join(failed.extension, "menu.json"), "must survive\n");
    const failedResult = await runScript(
      join(failed.extension, "bin", "update-client.sh"),
      {
        cwd: failed.extension,
        env: {
          KINDLE_DASHBOARD_DIR: failed.extension,
          MOCK_RELEASE_ROOT: releaseRoot,
          MOCK_CORRUPT_MENU: "1",
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(failedResult.code, 4, `${failedResult.stderr}\n${failedResult.stdout}`);
    assert.equal(await readFile(join(failed.extension, "VERSION"), "utf8"), "0.8.0\n");
    assert.equal(await readFile(join(failed.extension, "menu.json"), "utf8"), "must survive\n");
  } finally {
    await rm(successful.root, { recursive: true, force: true });
    await rm(failed.root, { recursive: true, force: true });
  }
});

test("Kindle daemon keeps the proven FBInk path and restores the original UI state", async () => {
  const fixture = await makeClientCopy("kindle-daemon-");
  const fakeBin = join(fixture.root, "fake-bin");
  const calls = join(fixture.root, "calls.log");
  const guiState = join(fixture.root, "gui-state");
  await writeFile(guiState, "running\n");
  await writeFile(
    join(fixture.extension, "config.sh"),
    'DASHBOARD_BASE_URL="http://mock-server"\nDEVICE_ID="pw4"\nDEVICE_TOKEN="token"\nREFRESH_SECONDS=3600\nCOMMAND_POLL_SECONDS=0\nWIFI_SETTLE_SECONDS=0\nDISPLAY_SETTLE_SECONDS=0\nRESTORE_RETRY_ATTEMPTS=3\nRESTORE_RETRY_SECONDS=0\nFULL_REFRESH_EVERY=12\nLOW_BATTERY_PERCENT=15\nAUTO_UPDATE_ON_START=0\n',
  );
  await cp(join(fixture.extension, "assets", "frame.png"), join(fixture.root, "mock-frame.png"));
  await writeFile(join(fixture.root, "dummy"), "");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(fakeBin));

  const fakeScripts = {
    "lipc-set-prop": '#!/bin/sh\nprintf "lipc-set %s\\n" "$*" >> "$MOCK_CALLS"\nif [ "${MOCK_PILLOW_FAIL_ONCE:-0}" = 1 ] && [ "$2" = disableEnablePillow ] && [ "$3" = enable ] && [ ! -f "$MOCK_PILLOW_MARKER" ]; then touch "$MOCK_PILLOW_MARKER"; exit 1; fi\n',
    "lipc-get-prop": '#!/bin/sh\ncase "$2" in preventScreenSaver) echo 0;; disableEnablePillow) [ "${MOCK_PILLOW_READ_EMPTY:-0}" = 1 ] || echo enable;; battLevel) echo 100;; isCharging) echo 1;; esac\n',
    initctl: '#!/bin/sh\nprintf "initctl %s\\n" "$*" >> "$MOCK_CALLS"\ncase "$1" in status) if grep -q running "$MOCK_GUI_STATE"; then echo "lab126_gui start/running"; else echo "lab126_gui stop/waiting"; fi;; stop) echo stopped > "$MOCK_GUI_STATE";; start) echo running > "$MOCK_GUI_STATE";; esac\n',
    fbink: '#!/bin/sh\nprintf "fbink %s\\n" "$*" >> "$MOCK_CALLS"\nexit 0\n',
    eips: '#!/bin/sh\nprintf "eips %s\\n" "$*" >> "$MOCK_CALLS"\n',
    curl: '#!/bin/sh\nout=""; headers=""; url=""\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -D) headers="$2"; shift 2;; -H|--data|--data-binary|--connect-timeout|--max-time) shift 2;; -*) shift;; *) url="$1"; shift;; esac; done\nprintf "curl %s\\n" "$url" >> "$MOCK_CALLS"\ncase "$url" in */frame.png) cp "$MOCK_FRAME" "$out"; [ -n "$headers" ] && printf "HTTP/1.1 200 OK\\r\\nETag: \\"mock\\"\\r\\n\\r\\n" > "$headers";; */ack) : > "$out";; */client/command/*) [ "${MOCK_COMMAND:-stop}" = offline ] && exit 7; printf "stop\\n" > "$out";; *) exit 22;; esac\n',
  };
  for (const [name, content] of Object.entries(fakeScripts)) {
    const path = join(fakeBin, name);
    await writeFile(path, content);
    await chmod(path, 0o755);
  }

  try {
    const result = await runScript(
      join(fixture.extension, "bin", "dashboard-daemon.sh"),
      {
        cwd: fixture.extension,
        env: {
          KINDLE_DASHBOARD_DIR: fixture.extension,
          KINDLE_INITCTL: join(fakeBin, "initctl"),
          KINDLE_EIPS: join(fakeBin, "eips"),
          KINDLE_FBINK: join(fakeBin, "fbink"),
          MOCK_CALLS: calls,
          MOCK_GUI_STATE: guiState,
          MOCK_FRAME: join(fixture.root, "mock-frame.png"),
          MOCK_COMMAND: "stop",
          MOCK_PILLOW_FAIL_ONCE: "1",
          MOCK_PILLOW_MARKER: join(fixture.root, "pillow-failed-once"),
          MOCK_PILLOW_READ_EMPTY: "1",
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    const callLog = await readFile(calls, "utf8");
    assert.match(callLog, /lipc-set com\.lab126\.powerd preventScreenSaver 1/);
    assert.match(callLog, /lipc-set com\.lab126\.pillow disableEnablePillow disable/);
    assert.match(callLog, /initctl stop lab126_gui/);
    assert.match(callLog, /fbink -g file=.*frame\.png -W GC16/);
    assert.match(callLog, /lipc-set com\.lab126\.pillow disableEnablePillow enable/);
    assert.match(callLog, /lipc-set com\.lab126\.powerd preventScreenSaver 0/);
    assert.match(callLog, /initctl start lab126_gui/);
    assert.ok(
      (callLog.match(/lipc-set com\.lab126\.pillow disableEnablePillow enable/g) || []).length >= 2,
      "Pillow restore must retry after a transient LIPC failure",
    );
    assert.ok(
      callLog.indexOf("initctl start lab126_gui") <
        callLog.indexOf("lipc-set com.lab126.pillow disableEnablePillow enable"),
      "Pillow must be restored after lab126_gui is running",
    );
    assert.ok(
      callLog.indexOf("lipc-set com.lab126.pillow disableEnablePillow enable") <
        callLog.indexOf("lipc-set com.lab126.powerd preventScreenSaver 0"),
      "preventScreenSaver must be restored last",
    );
    assert.ok(
      callLog.indexOf("initctl start lab126_gui") <
        callLog.indexOf("curl http://mock-server/client/command/pw4/ack"),
      "stop must only be acknowledged after lab126_gui is restored",
    );
    assert.equal(await readFile(guiState, "utf8"), "running\n");
    await assert.rejects(stat(join(fixture.extension, "state", "display-active")));

    await writeFile(calls, "");
    await writeFile(guiState, "running\n");
    await writeFile(
      join(fixture.extension, "config.sh"),
      'DASHBOARD_BASE_URL="http://mock-server"\nDEVICE_ID="pw4"\nDEVICE_TOKEN="token"\nREFRESH_SECONDS=3600\nCOMMAND_POLL_SECONDS=0\nSERVER_OFFLINE_EXIT_SECONDS=0\nWIFI_SETTLE_SECONDS=0\nDISPLAY_SETTLE_SECONDS=0\nRESTORE_RETRY_ATTEMPTS=3\nRESTORE_RETRY_SECONDS=0\nFULL_REFRESH_EVERY=12\nLOW_BATTERY_PERCENT=15\nAUTO_UPDATE_ON_START=0\n',
    );
    const offlineResult = await runScript(
      join(fixture.extension, "bin", "dashboard-daemon.sh"),
      {
        cwd: fixture.extension,
        env: {
          KINDLE_DASHBOARD_DIR: fixture.extension,
          KINDLE_INITCTL: join(fakeBin, "initctl"),
          KINDLE_EIPS: join(fakeBin, "eips"),
          KINDLE_FBINK: join(fakeBin, "fbink"),
          MOCK_CALLS: calls,
          MOCK_GUI_STATE: guiState,
          MOCK_FRAME: join(fixture.root, "mock-frame.png"),
          MOCK_COMMAND: "offline",
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(offlineResult.code, 0, offlineResult.stderr);
    assert.match(
      await readFile(join(fixture.extension, "dashboard.log"), "utf8"),
      /server offline for 0s; restoring UI/,
    );
    assert.equal(await readFile(guiState, "utf8"), "running\n");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("missing or invalid network config exits before start or update paths can touch the UI", async () => {
  const fixture = await makeClientCopy("kindle-missing-config-");
  const fakeBin = join(fixture.root, "fake-bin");
  const calls = join(fixture.root, "ui-calls.log");
  await mkdir(fakeBin);
  await mkdir(join(fixture.extension, "state"), { recursive: true });
  await writeFile(join(fixture.extension, "state", "dashboard.pid"), `${process.pid}\n`);
  await writeExecutable(
    join(fakeBin, "initctl"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_UI_CALLS"\n',
  );
  await writeExecutable(
    join(fixture.extension, "bin", "stop-dashboard.sh"),
    '#!/bin/sh\nprintf "stop-dashboard called\\n" >> "$MOCK_UI_CALLS"\n',
  );

  try {
    for (const config of [null, 'DASHBOARD_BASE_URL="file:///private"\nDEVICE_TOKEN="mock-token"\n']) {
      if (config === null) {
        await rm(join(fixture.extension, "config.sh"), { force: true });
      } else {
        await writeFile(join(fixture.extension, "config.sh"), config);
      }
      for (const entryPoint of ["start-dashboard.sh", "update-and-restart.sh"]) {
        const result = await runScript(
          join(fixture.extension, "bin", entryPoint),
          {
            cwd: fixture.extension,
            env: {
              KINDLE_DASHBOARD_DIR: fixture.extension,
              KINDLE_INITCTL: join(fakeBin, "initctl"),
              MOCK_UI_CALLS: calls,
              PATH: `${fakeBin}:${process.env.PATH}`,
            },
          },
        );
        assert.equal(result.code, 2, `${entryPoint}: ${result.stderr}`);
      }
    }
    await assert.rejects(stat(calls), "invalid config must not reach initctl");
    assert.match(await readFile(join(fixture.extension, "dashboard.log"), "utf8"), /valid DASHBOARD_BASE_URL/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("restore-ui remains usable without network config", async () => {
  const fixture = await makeClientCopy("kindle-restore-no-config-");
  const fakeBin = join(fixture.root, "fake-bin");
  const calls = join(fixture.root, "restore-calls.log");
  const state = join(fixture.extension, "state");
  await mkdir(fakeBin);
  await mkdir(state, { recursive: true });
  await writeFile(join(state, "display-active"), "\n");
  await writeFile(join(state, "frozen-pids"), "\n");
  await writeFile(join(state, "original-pillow"), "enable\n");
  await writeFile(join(state, "original-prevent"), "0\n");
  await writeFile(join(state, "gui-was-running"), "1\n");
  await writeExecutable(
    join(fakeBin, "initctl"),
    '#!/bin/sh\nprintf "initctl %s\\n" "$*" >> "$MOCK_RESTORE_CALLS"\nif [ "$1" = status ]; then echo "lab126_gui start/running"; fi\n',
  );
  await writeExecutable(
    join(fakeBin, "lipc-set-prop"),
    '#!/bin/sh\nprintf "lipc-set %s\\n" "$*" >> "$MOCK_RESTORE_CALLS"\n',
  );
  await writeExecutable(
    join(fakeBin, "lipc-get-prop"),
    '#!/bin/sh\ncase "$2" in preventScreenSaver) echo 0;; disableEnablePillow) echo enable;; esac\n',
  );

  try {
    const result = await runScript(
      join(fixture.extension, "bin", "restore-ui.sh"),
      {
        cwd: fixture.extension,
        env: {
          KINDLE_DASHBOARD_DIR: fixture.extension,
          KINDLE_INITCTL: join(fakeBin, "initctl"),
          MOCK_RESTORE_CALLS: calls,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.code, 0, result.stderr);
    const callLog = await readFile(calls, "utf8");
    assert.match(callLog, /lipc-set com\.lab126\.pillow disableEnablePillow enable/);
    assert.match(callLog, /lipc-set com\.lab126\.powerd preventScreenSaver 0/);
    assert.doesNotMatch(callLog, /initctl stop/);
    await assert.rejects(stat(join(state, "display-active")));
    await assert.rejects(stat(join(fixture.extension, "config.sh")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("frame fetch authenticates and does not follow redirects or log its token", async () => {
  const fixture = await makeClientCopy("kindle-frame-auth-");
  const fakeBin = join(fixture.root, "fake-bin");
  const calls = join(fixture.root, "curl-args.log");
  const followed = join(fixture.root, "redirect-followed");
  await mkdir(fakeBin);
  await writeFile(
    join(fixture.extension, "config.sh"),
    'DASHBOARD_BASE_URL="http://127.0.0.1:8787"\nDEVICE_TOKEN="mock-frame-token"\n',
  );
  await writeExecutable(
    join(fakeBin, "curl"),
    '#!/bin/sh\nheaders=""\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -D) headers="$2"; shift 2;;\n    -o) shift 2;;\n    -H) printf "header=%s\\n" "$2" >> "$MOCK_CURL_ARGS"; shift 2;;\n    -L) touch "$MOCK_REDIRECT_FOLLOWED"; shift;;\n    --connect-timeout|--max-time) shift 2;;\n    *) printf "arg=%s\\n" "$1" >> "$MOCK_CURL_ARGS"; shift;;\n  esac\ndone\nprintf "HTTP/1.1 302 Found\\r\\nLocation: http://127.0.0.1:8787/redirect-target\\r\\n\\r\\n" > "$headers"\n',
  );

  try {
    const result = await runScript(
      join(fixture.extension, "bin", "fetch-frame.sh"),
      {
        cwd: fixture.extension,
        env: {
          KINDLE_DASHBOARD_DIR: fixture.extension,
          MOCK_CURL_ARGS: calls,
          MOCK_REDIRECT_FOLLOWED: followed,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.code, 3, result.stderr);
    const curlArgs = await readFile(calls, "utf8");
    assert.match(curlArgs, /header=X-Device-Token: mock-frame-token/);
    assert.doesNotMatch(curlArgs, /arg=-L/);
    await assert.rejects(stat(followed));
    assert.doesNotMatch(await readFile(join(fixture.extension, "dashboard.log"), "utf8"), /mock-frame-token/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("log upload authenticates without following redirects or logging its token", async () => {
  const fixture = await makeClientCopy("kindle-log-auth-");
  const fakeBin = join(fixture.root, "fake-bin");
  const calls = join(fixture.root, "curl-args.log");
  await mkdir(fakeBin);
  await writeFile(
    join(fixture.extension, "config.sh"),
    'DASHBOARD_BASE_URL="https://dashboard.example.test"\nDEVICE_TOKEN="mock-log-token"\n',
  );
  await writeExecutable(
    join(fakeBin, "curl"),
    '#!/bin/sh\nout=""\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -o) out="$2"; shift 2;;\n    -w) shift 2;;\n    -H|--data-binary|--connect-timeout|--max-time) printf "arg=%s\\n" "$1" >> "$MOCK_CURL_ARGS"; if [ "$1" = -H ] || [ "$1" = --data-binary ]; then printf "value=%s\\n" "$2" >> "$MOCK_CURL_ARGS"; fi; shift 2;;\n    -L) printf "redirect-option\\n" >> "$MOCK_CURL_ARGS"; shift;;\n    *) printf "arg=%s\\n" "$1" >> "$MOCK_CURL_ARGS"; shift;;\n  esac\ndone\nprintf "accepted\\n" > "$out"\nprintf "302"\n',
  );

  try {
    const result = await runScript(
      join(fixture.extension, "bin", "upload-log.sh"),
      {
        cwd: fixture.extension,
        env: {
          KINDLE_DASHBOARD_DIR: fixture.extension,
          MOCK_CURL_ARGS: calls,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      },
    );
    assert.equal(result.code, 22, result.stderr);
    const curlArgs = await readFile(calls, "utf8");
    assert.match(curlArgs, /value=X-Device-Token: mock-log-token/);
    assert.doesNotMatch(curlArgs, /redirect-option/);
    const dashboardLog = await readFile(join(fixture.extension, "dashboard.log"), "utf8");
    assert.match(dashboardLog, /log: upload failed result=22/);
    assert.doesNotMatch(dashboardLog, /mock-log-token|accepted/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Kindle package uses an explicit allowlist and preserves executable modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kindle-package-"));
  const project = join(root, "project");
  const client = join(project, "kindle", "kindle-dashboard");
  await mkdir(join(project, "scripts"), { recursive: true });
  await cp(clientSource, client, { recursive: true });
  await cp(join(projectRoot, "LICENSE"), join(project, "LICENSE"));
  await cp(join(projectRoot, "scripts", "build-kindle-package.sh"), join(project, "scripts", "build-kindle-package.sh"));
  await writeFile(join(client, "config.sh"), 'DEVICE_TOKEN="SENTINEL_PRIVATE_CONFIG"\n');
  await writeFile(join(client, "dashboard.log"), "SENTINEL_PRIVATE_LOG\n");
  await mkdir(join(client, "state"), { recursive: true });
  await writeFile(join(client, "state", "private-state"), "SENTINEL_PRIVATE_STATE\n");
  await writeFile(join(client, "bin", "private-extra.sh"), "SENTINEL_PRIVATE_SCRIPT\n");
  await writeFile(join(client, "assets", "private-extra.txt"), "SENTINEL_PRIVATE_ASSET\n");

  try {
    const buildResult = await runScript(join(project, "scripts", "build-kindle-package.sh"), { cwd: project });
    assert.equal(buildResult.code, 0, buildResult.stderr);
    const archive = buildResult.stdout.trim();
    const listingResult = await runCommand("unzip", ["-Z1", archive]);
    assert.equal(listingResult.code, 0, listingResult.stderr);
    const packageFiles = listingResult.stdout
      .trim()
      .split("\n")
      .filter((path) => path && !path.endsWith("/"))
      .sort();
    const expectedFiles = [
      ...CLIENT_FILES,
      "config.example.sh",
      "LICENSE",
      "bin/display-test.sh",
      "assets/frame.png",
    ].map((path) => `kindle-dashboard/${path}`).sort();
    assert.deepEqual(packageFiles, expectedFiles);
    assert.ok(!packageFiles.some((path) => /config\.sh$|dashboard\.log|\/state\/|private-extra/.test(path)));

    const extracted = join(root, "extracted");
    await mkdir(extracted);
    const extractResult = await runCommand("unzip", ["-q", archive, "-d", extracted]);
    assert.equal(extractResult.code, 0, extractResult.stderr);
    const installedStart = await stat(join(extracted, "kindle-dashboard", "bin", "start-dashboard.sh"));
    assert.ok(installedStart.mode & 0o100, "package keeps client shell scripts executable");
    assert.match(await readFile(join(extracted, "kindle-dashboard", "config.example.sh"), "utf8"), /DASHBOARD_BASE_URL=""/);
    assert.doesNotMatch(await readFile(join(extracted, "kindle-dashboard", "config.example.sh"), "utf8"), /SENTINEL/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
