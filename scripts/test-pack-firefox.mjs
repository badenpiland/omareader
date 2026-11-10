import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { firefoxManifest } from "./firefox-manifest.mjs";
import {
  assertAmoManifest,
  collectSourceFiles,
  extensionZipEntries,
  isPackPathAllowed,
  zipBytes,
} from "./pack-firefox.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
const firefox = firefoxManifest(source);
assertAmoManifest(firefox);

const missingCollection = structuredClone(firefox);
delete missingCollection.browser_specific_settings.gecko.data_collection_permissions;
assert.throws(() => assertAmoManifest(missingCollection), /data_collection_permissions/);

const wrongCollection = structuredClone(firefox);
wrongCollection.browser_specific_settings.gecko.data_collection_permissions = { required: ["browsingActivity"] };
assert.throws(() => assertAmoManifest(wrongCollection), /data_collection_permissions/);

assert.throws(() => assertAmoManifest(source), /gecko id/);

assert.equal(isPackPathAllowed("src/background.js"), true);
assert.equal(isPackPathAllowed("key.pem"), false);
assert.equal(isPackPathAllowed("secrets/key.pem"), false);
assert.equal(isPackPathAllowed("node_modules/darkreader/package.json"), false);
assert.equal(isPackPathAllowed("dist-firefox/manifest.json"), false);
assert.equal(isPackPathAllowed("dist/manifest.json"), false);
assert.equal(isPackPathAllowed(".git/config"), false);
assert.equal(isPackPathAllowed("release/omareader.crx"), false);
assert.equal(isPackPathAllowed("../src/manifest.json"), false);

const packed = collectSourceFiles(root);
for (const required of [
  "package.json",
  "package-lock.json",
  "src/manifest.json",
  "src/background.js",
  "src/page-proxy.js",
  "scripts/build.mjs",
  "scripts/proxy-source.mjs",
  "scripts/firefox-manifest.mjs",
  "scripts/pack-firefox.mjs",
  "vendor/darkreader/dynamic-theme-fixes.config",
  "LICENSE",
  "LICENSES/darkreader-MIT.txt",
  "host/omareader-host",
  "docs/amo-reviewer-notes.txt",
  "install.sh",
  "README.md",
]) {
  assert.equal(packed.includes(required), true, required);
}
for (const name of packed) {
  assert.equal(isPackPathAllowed(name), true, name);
  assert.equal(name.includes("node_modules"), false, name);
  assert.equal(name.includes("key.pem"), false, name);
}
assert.equal(packed.some((name) => name.startsWith("dist/") || name.startsWith("dist-firefox/")), false);

const dir = mkdtempSync(join(tmpdir(), "omareader-firefox-zip-"));
writeFileSync(join(dir, "manifest.json"), "{}\n");
const nested = join(dir, "nested");
mkdirSync(nested);
writeFileSync(join(nested, "page.js"), "page\n");
const entries = extensionZipEntries(dir);
assert.deepEqual(entries.map((entry) => entry.name).sort(), ["manifest.json", "nested/page.js"]);
const zipPath = join(dir, "omareader-firefox.zip");
writeFileSync(zipPath, zipBytes(entries));
const listing = execFileSync("python3", ["-c", `
import zipfile, sys
archive = zipfile.ZipFile(sys.argv[1])
print("\\n".join(archive.namelist()))
`, zipPath], { encoding: "utf8" });
assert.deepEqual(listing.trim().split("\n").sort(), ["manifest.json", "nested/page.js"]);
assert.equal(listing.includes("dist-firefox/"), false);

console.log("firefox AMO zip lists manifest.json at the archive root");
