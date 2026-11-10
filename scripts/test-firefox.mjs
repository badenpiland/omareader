import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { earlyPalette } from "../src/early-palette.js";
import {
  DARK_READER_CHROMIUM_ID,
  DARK_READER_GECKO_ID,
  darkReaderExtensionId,
} from "../src/dark-reader.js";
import {
  FIREFOX_ANDROID_MIN_VERSION,
  FIREFOX_DATA_COLLECTION,
  FIREFOX_HOST_DESCRIPTION,
  FIREFOX_MIN_VERSION,
  GECKO_ID,
  firefoxHostManifest,
  firefoxManifest,
} from "./firefox-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
const frozen = structuredClone(source);
const firefox = firefoxManifest(source);

assert.deepEqual(source, frozen, "firefoxManifest must not change the Chromium manifest");
assert.equal(source.background.service_worker, "background.js");
assert.equal(source.background.scripts, undefined);
assert.equal(typeof source.key, "string");
assert.equal(source.browser_specific_settings, undefined);
assert.equal(source.commands.toggle.suggested_key.default, "Alt+Shift+O");
assert.equal(source.commands["toggle-site"].suggested_key.default, "Alt+Shift+U");

assert.equal(firefox.manifest_version, 3);
assert.equal(firefox.key, undefined);
assert.equal(firefox.minimum_chrome_version, undefined);
assert.equal(firefox.background.service_worker, undefined);
assert.deepEqual(firefox.background, { scripts: ["background.js"], type: "module" });
assert.equal(firefox.browser_specific_settings.gecko.id, GECKO_ID);
assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, FIREFOX_MIN_VERSION);
assert.deepEqual(
  firefox.browser_specific_settings.gecko.data_collection_permissions,
  FIREFOX_DATA_COLLECTION,
);
assert.deepEqual(FIREFOX_DATA_COLLECTION, { required: ["none"] });
assert.equal(Object.hasOwn(firefox.browser_specific_settings.gecko.data_collection_permissions, "required"), true);
assert.equal(FIREFOX_MIN_VERSION, "140.0");
assert.equal(FIREFOX_ANDROID_MIN_VERSION, "142.0");
assert.equal(
  firefox.browser_specific_settings.gecko_android.strict_min_version,
  FIREFOX_ANDROID_MIN_VERSION,
);
assert.deepEqual(
  firefox.browser_specific_settings.gecko_android.data_collection_permissions,
  FIREFOX_DATA_COLLECTION,
);
assert.match(GECKO_ID, /^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$/);
assert.notEqual(GECKO_ID, "mhglniaepbokfgnpeennihlifandcgjh");
assert.deepEqual(firefox.commands, source.commands);
assert.deepEqual(firefox.content_scripts, source.content_scripts);
assert.equal(
  firefox.content_scripts.find((script) => script.js.includes("page-proxy.js")).world,
  "MAIN",
);
assert.equal(firefox.permissions.includes("nativeMessaging"), true);

const host = firefoxHostManifest({
  name: "com.bhp.omareader",
  path: "/home/example/.local/share/omareader/omareader-host",
});
assert.equal(host.name, "com.bhp.omareader");
assert.equal(host.description, FIREFOX_HOST_DESCRIPTION);
assert.equal(host.type, "stdio");
assert.deepEqual(host.allowed_extensions, [GECKO_ID]);
assert.equal(host.allowed_origins, undefined);
assert.throws(
  () => firefoxHostManifest({
    name: "com.bhp.omareader",
    path: "omareader-host",
  }),
  /absolute/,
);
assert.throws(
  () => firefoxHostManifest({
    name: "com.bhp.omareader",
    path: "/usr/bin/omareader-host",
    extensionId: "mhglniaepbokfgnpeennihlifandcgjh",
  }),
  /gecko id/,
);
assert.throws(
  () => firefoxHostManifest({
    name: "com.bhp.omareader",
    path: "/usr/bin/omareader-host",
    extensionId: "chrome-extension://mhglniaepbokfgnpeennihlifandcgjh/",
  }),
  /gecko id/,
);

const install = readFileSync(join(root, "install.sh"), "utf8");
assert.match(install, new RegExp(`^GECKO_ID="${GECKO_ID}"$`, "m"));
assert.match(install, /allowed_extensions/);
assert.match(install, /native-messaging-hosts/);
assert.doesNotMatch(install, /allowed_extensions": \[f"chrome-extension:/);

assert.equal(darkReaderExtensionId("moz-extension://8f4c0c0e-1/"), DARK_READER_GECKO_ID);
assert.equal(darkReaderExtensionId("chrome-extension://mhglniaepbokfgnpeennihlifandcgjh/"), DARK_READER_CHROMIUM_ID);
assert.equal(darkReaderExtensionId(""), DARK_READER_CHROMIUM_ID);
assert.equal(DARK_READER_GECKO_ID, "addon@darkreader.org");
const background = readFileSync(join(root, "src/background.js"), "utf8");
assert.match(background, /darkReaderExtensionId\(EXTENSION_ORIGIN\)/);
assert.doesNotMatch(background, /eimadpbcbfnmbkopoojfekhnkhdbieeh/);

const sessionPalette = { background: "#111111", foreground: "#eeeeee", mode: "dark" };
const localPalette = { background: "#222222", foreground: "#dddddd", mode: "light" };
assert.equal(earlyPalette({ palette: sessionPalette }, { palette: localPalette }), sessionPalette);
assert.equal(earlyPalette(null, { palette: localPalette }), localPalette);
assert.equal(earlyPalette({}, { palette: localPalette }), localPalette);
assert.equal(earlyPalette({ palette: {} }, { palette: localPalette }), localPalette);
assert.equal(earlyPalette(null, null), null);
assert.equal(earlyPalette({ palette: { background: "#111111" } }, {}), null);

const content = readFileSync(join(root, "src/content.js"), "utf8");
assert.match(content, /earlyPalette\(/);
assert.match(content, /chrome\.storage\.local/);
assert.match(content, /chrome\.storage\.session/);

console.log(`firefox manifest ${GECKO_ID} mirrors the Chromium extension`);
