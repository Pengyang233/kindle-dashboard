import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FRAME_WIDTH = 1072;
const FRAME_HEIGHT = 1448;

let cachedFrame = null;
let renderInFlight = null;

function chromeCandidates() {
  return [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
}

async function renderWithChrome(html, sourceHash) {
  const renderDirectory = await mkdtemp(join(tmpdir(), "kindle-dashboard-"));
  const htmlPath = join(renderDirectory, "frame.html");
  const pngPath = join(renderDirectory, "frame.png");

  try {
    await writeFile(htmlPath, html, "utf8");
    let lastError = null;

    for (const chromePath of chromeCandidates()) {
      try {
        await execFileAsync(
          chromePath,
          [
            "--headless=new",
            `--user-data-dir=${join(renderDirectory, "chrome-profile")}`,
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-sync",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--force-device-scale-factor=1",
            `--window-size=${FRAME_WIDTH},${FRAME_HEIGHT}`,
            `--screenshot=${pngPath}`,
            `file://${htmlPath}`,
          ],
          { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;

    const png = await readFile(pngPath);
    if (
      png.length < 24 ||
      png.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
      png.readUInt32BE(16) !== FRAME_WIDTH ||
      png.readUInt32BE(20) !== FRAME_HEIGHT
    ) {
      throw new Error("Chrome produced an invalid Kindle frame PNG");
    }

    return {
      png,
      etag: `"${createHash("sha256").update(png).digest("hex")}"`,
      sourceHash,
      renderedAt: new Date(),
    };
  } finally {
    await rm(renderDirectory, { recursive: true, force: true });
  }
}

export async function getFramePng(html) {
  const sourceHash = createHash("sha256").update(html).digest("hex");
  if (cachedFrame?.sourceHash === sourceHash) return cachedFrame;

  if (!renderInFlight) {
    renderInFlight = renderWithChrome(html, sourceHash)
      .then((frame) => {
        cachedFrame = frame;
        return frame;
      })
      .finally(() => {
        renderInFlight = null;
      });
  }

  try {
    return await renderInFlight;
  } catch (error) {
    if (cachedFrame) {
      console.error("Unable to render fresh frame; serving cached PNG:", error.message);
      return { ...cachedFrame, stale: true };
    }
    throw error;
  }
}

export function clearFrameCache() {
  cachedFrame = null;
  renderInFlight = null;
}
