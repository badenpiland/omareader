import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_BADGE_MS,
  COMMAND_TOGGLE,
  COMMAND_TOGGLE_SITE,
  hostFromUrl,
  normalizeHost,
  runReaderCommand,
} from "../src/commands.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
const background = readFileSync(join(root, "src/background.js"), "utf8");

const toggle = manifest.commands[COMMAND_TOGGLE];
const toggleSite = manifest.commands[COMMAND_TOGGLE_SITE];
assert.ok(toggle, "global toggle command stays declared");
assert.ok(toggleSite, "site toggle command is declared");
assert.equal(toggle.suggested_key.default, "Alt+Shift+O");
assert.equal(toggleSite.suggested_key.default, "Alt+Shift+P");
assert.equal(toggle.description, "Turn Omareader on or off");
assert.equal(toggleSite.description, "Pause or theme the current site");
assert.notEqual(toggle.suggested_key.default, toggleSite.suggested_key.default);

// Omarchy's Hyprland defaults (default/hypr/bindings.conf, bindings/*.conf, and
// the current bindings/*.lua) bind letters with SUPER. The chords that leave
// SUPER out, plus Chromium shortcuts chrome.commands could otherwise suggest.
const occupied = new Set([
  "Ctrl+Alt+Delete",
  "Ctrl+Alt+Tab",
  "Ctrl+Alt+Shift+Tab",
  "Alt+Tab",
  "Alt+Shift+Tab",
  "Alt+F11",
  "Shift+F11",
  "Alt+Shift+T",
  "Alt+F",
  "Alt+E",
  "Alt+D",
  "Alt+Left",
  "Alt+Right",
  "Alt+Home",
  "Ctrl+P",
  "Ctrl+Shift+P",
  "Ctrl+Shift+O",
  "Ctrl+T",
  "Ctrl+N",
  "Ctrl+Shift+N",
  "Ctrl+W",
  "Ctrl+Shift+W",
  "Ctrl+Shift+T",
  "Ctrl+L",
  "Ctrl+F",
  "Ctrl+H",
  "Ctrl+J",
  "Ctrl+D",
  "Ctrl+Shift+D",
  "Ctrl+Shift+B",
  "Ctrl+Shift+Delete",
  "Ctrl+Shift+I",
  "Ctrl+Shift+J",
  "Ctrl+Shift+C",
  "Ctrl+U",
  "Ctrl+S",
  "Ctrl+O",
  "Ctrl+R",
  "Ctrl+Shift+A",
  "Ctrl+K",
  "Ctrl+E",
]);

for (const command of [toggle, toggleSite]) {
  const key = command.suggested_key.default;
  assert.match(key, /^Alt\+Shift\+[A-Z]$/);
  assert.equal(key.includes("Ctrl+Alt"), false);
  assert.equal(occupied.has(key), false, `${key} collides with a reserved chord`);
}

assert.equal(COMMAND_BADGE_MS >= 500 && COMMAND_BADGE_MS <= 2500, true);
assert.match(background, /chrome\.commands\.onCommand\.addListener/);
assert.match(background, /runReaderCommand\(command, tab/);
assert.match(background, /setSitePaused\(effect\.host, effect\.paused\)/);
assert.match(background, /showCommandBadge\(effect\.tabId, effect\.badge\)/);
console.log("manifest keeps Alt+Shift+O and adds Alt+Shift+P");

function deps(overrides = {}) {
  return {
    isEnabled: () => true,
    isPaused: () => false,
    focusedTab: async () => {
      throw new Error("focused tab should stay unread");
    },
    ...overrides,
  };
}

const turnedOff = await runReaderCommand(COMMAND_TOGGLE, { id: 4, url: "https://example.com/" }, deps());
assert.deepEqual(turnedOff, { type: "setEnabled", enabled: false, badge: "OFF", tabId: 4 });
const turnedOn = await runReaderCommand(COMMAND_TOGGLE, undefined, deps({ isEnabled: () => false }));
assert.deepEqual(turnedOn, { type: "setEnabled", enabled: true, badge: "ON", tabId: undefined });

let reads = 0;
const paused = await runReaderCommand(
  COMMAND_TOGGLE_SITE,
  { id: 8, url: "https://Example.COM./item" },
  deps({
    focusedTab: async () => {
      reads += 1;
      return { id: 1, url: "https://other.example/" };
    },
  }),
);
assert.equal(reads, 0);
assert.deepEqual(paused, {
  type: "setSitePaused",
  host: "example.com",
  paused: true,
  badge: "P",
  tabId: 8,
});

let pausedNow = true;
const themed = await runReaderCommand(
  COMMAND_TOGGLE_SITE,
  { id: 8, url: "https://example.com/next" },
  deps({ isPaused: (host) => host === "example.com" && pausedNow }),
);
assert.deepEqual(themed, {
  type: "setSitePaused",
  host: "example.com",
  paused: false,
  badge: "T",
  tabId: 8,
});

let focusedCalls = 0;
const fromFocus = await runReaderCommand(
  COMMAND_TOGGLE_SITE,
  undefined,
  deps({
    focusedTab: async () => {
      focusedCalls += 1;
      return { id: 12, url: "https://news.ycombinator.com/news" };
    },
  }),
);
assert.equal(focusedCalls, 1);
assert.equal(fromFocus.host, "news.ycombinator.com");
assert.equal(fromFocus.paused, true);
assert.equal(fromFocus.badge, "P");
assert.equal(fromFocus.tabId, 12);

const missingUrl = await runReaderCommand(
  COMMAND_TOGGLE_SITE,
  { id: 2 },
  deps({
    focusedTab: async () => ({ id: 9, url: "https://example.org/" }),
  }),
);
assert.equal(missingUrl.host, "example.org");
assert.equal(missingUrl.tabId, 9);

const blank = await runReaderCommand(
  COMMAND_TOGGLE_SITE,
  { id: 5, url: "about:blank" },
  deps({
    focusedTab: async () => {
      throw new Error("about:blank already names a tab");
    },
  }),
);
assert.equal(blank, null);

const fileUrl = await runReaderCommand(COMMAND_TOGGLE_SITE, { id: 6, url: "file:///tmp/page.html" }, deps());
assert.equal(fileUrl, null);

const unknown = await runReaderCommand("toggle-something-else", { id: 1, url: "https://example.com/" }, deps());
assert.equal(unknown, null);

assert.equal(hostFromUrl("https://example.com."), "example.com");
assert.equal(normalizeHost("a".repeat(254)), "");
assert.equal(normalizeHost("bad host"), "");
assert.equal(await runReaderCommand(COMMAND_TOGGLE_SITE, { id: 7, url: `https://${"a".repeat(254)}/` }, deps()), null);
console.log("site command pauses the current host and themes it again");
