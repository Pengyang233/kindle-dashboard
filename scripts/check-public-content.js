#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "runtime",
  "coverage",
]);
const localOnlyPaths = new Set([
  ".env",
  ".env.local",
  "kindle/kindle-dashboard/config.sh",
]);
const explicitlyAllowedTestPrivateIps = new Set();

const checks = [
  {
    category: "private key material",
    pattern: /-{5}BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-{5}/i,
  },
  {
    category: "provider token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    category: "provider token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
  {
    category: "provider token",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    category: "provider token",
    pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/,
  },
  {
    category: "provider token",
    pattern: /\bsk-(?:proj|live|test|svcacct)-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    category: "credential assignment",
    pattern: /\b(?:token|secret|password|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{24,}/i,
  },
  {
    category: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    category: "personal filesystem path",
    pattern: /(?:^|[\s"'=(:])\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|$)/,
  },
  {
    category: "personal filesystem path",
    pattern: /\b[A-Z]:\\Users\\[A-Za-z0-9._-]+(?:\\|$)/i,
  },
];

function isLocalOnlyPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const basename = path.posix.basename(normalized);
  return (
    localOnlyPaths.has(normalized) ||
    basename === ".env.local" ||
    (basename.startsWith(".env.") && basename !== ".env.example") ||
    normalized.startsWith("runtime/")
  );
}

function privateIpMatches(text) {
  const expression = /\b(?:(?:10(?:\.\d{1,3}){3})|(?:172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})|(?:192\.168(?:\.\d{1,3}){2}))\b/g;
  const found = [];

  for (const match of text.matchAll(expression)) {
    const octets = match[0].split(".").map(Number);
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      found.push({ value: match[0], index: match.index });
    }
  }

  return found;
}

function isApprovedTestIp(relativePath, value) {
  const normalized = relativePath.split(path.sep).join("/");
  return (
    normalized.split("/").includes("test") &&
    explicitlyAllowedTestPrivateIps.has(value)
  );
}

function trackedLocalOnlyPaths() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\0")
      .filter(Boolean)
      .filter(isLocalOnlyPath);
  } catch {
    return [];
  }
}

async function collectTextFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? path.join(relativeDirectory, entry.name)
      : entry.name;
    if (isLocalOnlyPath(relativePath)) continue;

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...(await collectTextFiles(
        path.join(directory, entry.name),
        relativePath,
      )));
      continue;
    }

    if (!entry.isFile()) continue;
    const contents = await readFile(path.join(directory, entry.name));
    if (contents.includes(0)) continue;

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
    } catch {
      continue;
    }
    files.push({ relativePath, text });
  }

  return files;
}

const findings = [];
for (const file of await collectTextFiles(projectRoot)) {
  const lines = file.text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const check of checks) {
      if (check.pattern.test(line)) {
        findings.push({
          path: file.relativePath,
          line: index + 1,
          category: check.category,
        });
      }
      check.pattern.lastIndex = 0;
    }

    for (const match of privateIpMatches(line)) {
      if (!isApprovedTestIp(file.relativePath, match.value)) {
        findings.push({
          path: file.relativePath,
          line: index + 1,
          category: "RFC1918 address literal",
        });
      }
    }
  });
}

const forbiddenTrackedPaths = trackedLocalOnlyPaths();
for (const relativePath of forbiddenTrackedPaths) {
  findings.push({ path: relativePath, line: 0, category: "local-only file tracked" });
}

if (findings.length > 0) {
  console.error(`Public-content check failed (${findings.length} finding(s)).`);
  for (const finding of findings) {
    const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
    console.error(`${location} [${finding.category}]`);
  }
  process.exitCode = 1;
} else {
  console.log("Public-content check passed.");
}
