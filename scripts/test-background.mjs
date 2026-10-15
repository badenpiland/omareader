import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECONNECT_MAX_MS, RECONNECT_MIN_MS, nextDelay } from "../src/reconnect-delay.js";
import { decideDarkReaderPrompt, extensionProxyInjected } from "../src/dark-reader.js";
import { fromExtensionPage } from "../src/extension-page.js";
import {
  clipText,
  HOST_ERROR_LIMIT,
  HOST_MISSING,
  hostFailureText,
  normalizeHex,
  paletteFromHost,
  THEME_NAME_LIMIT,
} from "../src/host-message.js";

const seen = [];
let current = RECONNECT_MIN_MS;
for (let i = 0; i < 10; i += 1) {
  const step = nextDelay(current);
  seen.push(step.delay);
  current = step.next;
}

assert.deepEqual(seen.slice(0, 6), [1000, 2000, 4000, 8000, 16000, 32000]);
assert.equal(seen.at(-1), RECONNECT_MAX_MS);
assert.equal(nextDelay(RECONNECT_MAX_MS).next, RECONNECT_MAX_MS);
assert.equal(nextDelay(50).delay, RECONNECT_MIN_MS);
console.log(`reconnect delays ${seen.join(", ")}`);

const origin = "chrome-extension://mhglniaepbokfgnpeennihlifandcgjh/";
assert.equal(fromExtensionPage({ url: `${origin}popup.html` }, origin), true);
assert.equal(fromExtensionPage({ tab: { id: 1 }, url: "https://example.org/" }, origin), false);
assert.equal(
  fromExtensionPage({ url: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/popup.html" }, origin),
  false,
);
assert.equal(fromExtensionPage(null, origin), false);
assert.equal(fromExtensionPage({ url: `${origin}popup.html` }, ""), false);
console.log("extension page senders accepted only for this extension");

const manifest = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/manifest.json"), "utf8"),
);
assert.deepEqual(manifest.permissions, ["nativeMessaging", "storage", "alarms", "scripting"]);
assert.deepEqual(manifest.optional_permissions, ["management"]);
assert.equal(manifest.permissions.includes("management"), false);
console.log("management is an optional permission");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = readFileSync(join(repoRoot, "scripts/build.mjs"), "utf8");
const copyList = build.match(/for \(const file of \[([\s\S]*?)\]\)/);
assert.ok(copyList, "build copy list is present");
const copied = [...copyList[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
for (const name of ["background.js", "popup.js"]) {
  const source = readFileSync(join(repoRoot, "src", name), "utf8");
  for (const match of source.matchAll(/from "\.\/([^"]+)"/g)) {
    assert.equal(copied.includes(match[1]), true, `${name} imports ${match[1]}, which the build does not copy`);
  }
}
const contentBuild = build.match(/await esbuild\.build\(\{([\s\S]*?)\}\);/);
assert.ok(contentBuild, "content.js esbuild call is present");
assert.match(contentBuild[1], /entryPoints:\s*\[[^\]]*["']src\/content\.js["']/);
assert.match(contentBuild[1], /bundle:\s*true/);
console.log("copied scripts import files the build ships");

assert.equal(normalizeHex("#ABC"), "#aabbcc");
assert.equal(normalizeHex("#aabbccdd"), "#aabbcc");
assert.equal(normalizeHex("blue"), "");
assert.equal(normalizeHex("#gggggg"), "");
const palette = paletteFromHost({
  theme: "n".repeat(150),
  mode: "light",
  background: "#abc",
  foreground: "#112233",
  selection: "nope",
});
assert.equal(palette.theme, "n".repeat(THEME_NAME_LIMIT));
assert.equal(palette.background, "#aabbcc");
assert.equal(palette.mode, "light");
assert.equal(palette.selection, "");
assert.equal(paletteFromHost({ background: "#zzzzzz", foreground: "#112233" }), null);
assert.equal(hostFailureText("Specified native messaging host not found."), HOST_MISSING);
assert.equal(hostFailureText("", "Theme host disconnected"), "Theme host disconnected");
assert.equal(hostFailureText("x".repeat(500)).length, HOST_ERROR_LIMIT);
assert.equal(clipText("abcd", 2), "ab");
console.log("host palette and errors checked");

function element(attributes) {
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

// Omareader's bundled engine writes these. They must not count as the extension.
assert.equal(extensionProxyInjected(element({
  "data-darkreader-mode": "dynamic",
  "data-darkreader-scheme": "dark",
})), false);
assert.equal(extensionProxyInjected(element({
  "data-darkreader-proxy-injected": "true",
  "data-darkreader-mode": "dynamic",
})), true);
assert.equal(extensionProxyInjected(element({ "data-darkreader-proxy-injected": "" })), false);
assert.equal(extensionProxyInjected(null), false);

const bundledEngine = readFileSync(join(repoRoot, "node_modules/darkreader/darkreader.js"), "utf8");
assert.equal(bundledEngine.includes("data-darkreader-mode"), true);
assert.equal(
  bundledEngine.includes("darkreaderProxyInjected"),
  false,
  "bundled darkreader enable() must not emit the extension proxy marker",
);

const fresh = { darkReaderChoice: "", darkReaderOffered: false };
const absent = { prompt: false, known: false };
const present = { prompt: true, known: true };

// Reproduction: management permission is not granted (fresh install, including
// a system external extension) and the separate Dark Reader extension is absent.
assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: false,
  extensionEnabled: null,
  proxyInjected: false,
}), absent);
assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: false,
  extensionEnabled: null,
  proxyInjected: extensionProxyInjected(element({
    "data-darkreader-mode": "dynamic",
    "data-darkreader-scheme": "dark",
  })),
}), absent);

assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: false,
  extensionEnabled: null,
  proxyInjected: true,
}), present);
assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: true,
  extensionEnabled: true,
  proxyInjected: false,
}), present);
assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: true,
  extensionEnabled: false,
  proxyInjected: false,
}), absent);
assert.deepEqual(decideDarkReaderPrompt({
  stored: fresh,
  managementGranted: true,
  extensionEnabled: false,
  proxyInjected: true,
}), absent);
assert.deepEqual(decideDarkReaderPrompt({
  stored: { darkReaderChoice: "keep", darkReaderOffered: false },
  managementGranted: true,
  extensionEnabled: true,
  proxyInjected: true,
}), absent);
assert.deepEqual(decideDarkReaderPrompt({
  stored: { darkReaderChoice: "", darkReaderOffered: true },
  managementGranted: false,
  extensionEnabled: null,
  proxyInjected: true,
}), absent);

const backgroundSource = readFileSync(join(repoRoot, "src/background.js"), "utf8");
assert.equal(
  backgroundSource.includes("showDarkReaderPrompt(false)"),
  false,
  "a missing management permission must not show the Dark Reader prompt",
);
assert.match(backgroundSource, /decideDarkReaderPrompt\(/);
const contentSource = readFileSync(join(repoRoot, "src/content.js"), "utf8");
assert.match(contentSource, /extensionProxyInjected/);
assert.doesNotMatch(contentSource, /data-darkreader-mode/);
const pack = readFileSync(join(repoRoot, "scripts/pack.sh"), "utf8");
assert.match(pack, /dist\/dark-reader\.js/);
console.log("dark reader prompt only when that extension is enabled");
