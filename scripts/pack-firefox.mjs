// SPDX-License-Identifier: MIT
// Build the Firefox add-on zip and the reviewer source zip.
// Does not read key.pem and does not change the Chromium package.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";
import {
  FIREFOX_ANDROID_MIN_VERSION,
  FIREFOX_DATA_COLLECTION,
  FIREFOX_MIN_VERSION,
  GECKO_ID,
} from "./firefox-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EXTENSION_ZIP_NAME = "omareader-firefox.zip";
export const SOURCE_ZIP_NAME = "omareader-firefox-source.zip";

// Files a reviewer needs in order to run npm ci, npm run build, and the host.
// Directories are walked. Anything outside this list stays out of the source zip.
export const SOURCE_FILES = [
  "package.json",
  "package-lock.json",
  "eslint.config.js",
  "ruff.toml",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "install.sh",
  "docs/amo-reviewer-notes.txt",
  "host/omareader-host",
  "vendor/darkreader/dynamic-theme-fixes.config",
];

export const SOURCE_DIRS = ["src", "scripts", "LICENSES"];

const BLOCKED = /^(?:node_modules|dist|dist-firefox|release|\.git)(?:\/|$)|(?:^|\/)key\.pem$|\.pem$|(?:^|\/)[^/]+\.crx$/;

export function isPackPathAllowed(name) {
  const normalized = String(name || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return false;
  }
  return !BLOCKED.test(normalized);
}

export function collectSourceFiles(base = root) {
  const names = [];
  const add = (rel) => {
    const normalized = rel.split(sep).join("/");
    if (!isPackPathAllowed(normalized)) {
      throw new Error(`Refusing to pack ${normalized}`);
    }
    const full = join(base, ...normalized.split("/"));
    if (!existsSync(full) || !statSync(full).isFile()) {
      throw new Error(`Source zip is missing ${normalized}`);
    }
    names.push(normalized);
  };
  for (const rel of SOURCE_FILES) {
    add(rel);
  }
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!isPackPathAllowed(`${rel}/`)) {
          throw new Error(`Refusing to pack ${rel}`);
        }
        walk(join(dir, entry.name), rel);
        continue;
      }
      if (entry.isFile()) {
        add(rel);
      }
    }
  };
  for (const dir of SOURCE_DIRS) {
    walk(join(base, dir), dir);
  }
  return [...new Set(names)].sort();
}

export function assertAmoManifest(manifest) {
  const gecko = manifest?.browser_specific_settings?.gecko;
  const required = gecko?.data_collection_permissions?.required;
  const problems = [];
  if (gecko?.id !== GECKO_ID) {
    problems.push("gecko id");
  }
  if (gecko?.strict_min_version !== FIREFOX_MIN_VERSION) {
    problems.push("strict_min_version");
  }
  const android = manifest?.browser_specific_settings?.gecko_android;
  if (android?.strict_min_version !== FIREFOX_ANDROID_MIN_VERSION) {
    problems.push("gecko_android.strict_min_version");
  }
  if (JSON.stringify(android?.data_collection_permissions) !== JSON.stringify(FIREFOX_DATA_COLLECTION)) {
    problems.push("gecko_android.data_collection_permissions");
  }
  if (!Array.isArray(required) || required.length !== 1 || required[0] !== "none") {
    problems.push("data_collection_permissions.required");
  }
  if (gecko?.data_collection_permissions && JSON.stringify(gecko.data_collection_permissions) !== JSON.stringify(FIREFOX_DATA_COLLECTION)) {
    problems.push("data_collection_permissions");
  }
  if (manifest?.key) {
    problems.push("key");
  }
  if (manifest?.minimum_chrome_version) {
    problems.push("minimum_chrome_version");
  }
  if (manifest?.background?.service_worker) {
    problems.push("background.service_worker");
  }
  if (manifest?.commands?.toggle?.suggested_key?.default !== "Alt+Shift+O") {
    problems.push("toggle shortcut");
  }
  if (manifest?.commands?.["toggle-site"]?.suggested_key?.default !== "Alt+Shift+U") {
    problems.push("site shortcut");
  }
  if (problems.length) {
    throw new Error(`Firefox AMO manifest: ${problems.join(", ")}`);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// names are zip paths. mode is a Unix mode such as 0o100644.
export function zipBytes(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    if (!isPackPathAllowed(file.name)) {
      throw new Error(`Refusing to pack ${file.name}`);
    }
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, compressed);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    const unixMode = (file.mode & 0xffff) >>> 0;
    central.writeUInt32LE((unixMode * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function fileMode(full) {
  const mode = statSync(full).mode & 0o777;
  return mode & 0o111 ? 0o100755 : 0o100644;
}

function filesFromDirectory(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const name = relative(dir, full).split(sep).join("/");
      files.push({ name, data: readFileSync(full), mode: fileMode(full) });
    }
  };
  walk(dir);
  return files;
}

export function extensionZipEntries(dir) {
  const files = filesFromDirectory(dir);
  if (!files.some((file) => file.name === "manifest.json")) {
    throw new Error("Firefox extension zip is missing manifest.json at the archive root");
  }
  if (files.some((file) => file.name.startsWith("dist-firefox/") || file.name.includes("key.pem"))) {
    throw new Error("Firefox extension zip is nested or contains a key");
  }
  return files;
}

export function sourceZipEntries(base = root) {
  return collectSourceFiles(base).map((name) => {
    const full = join(base, ...name.split("/"));
    return { name, data: readFileSync(full), mode: fileMode(full) };
  });
}

function main() {
  const built = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (built.status !== 0) {
    process.exit(built.status ?? 1);
  }
  const manifestPath = join(root, "dist-firefox", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assertAmoManifest(manifest);
  const outDir = join(root, "release");
  mkdirSync(outDir, { recursive: true });
  const extensionFiles = extensionZipEntries(join(root, "dist-firefox"));
  const extensionZip = join(outDir, EXTENSION_ZIP_NAME);
  const sourceZip = join(outDir, SOURCE_ZIP_NAME);
  writeFileSync(extensionZip, zipBytes(extensionFiles));
  writeFileSync(sourceZip, zipBytes(sourceZipEntries(root)));
  process.stdout.write(`${extensionZip}\n${sourceZip}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
