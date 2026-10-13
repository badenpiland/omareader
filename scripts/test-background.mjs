import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECONNECT_MAX_MS, RECONNECT_MIN_MS, nextDelay } from "../src/reconnect-delay.js";
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
