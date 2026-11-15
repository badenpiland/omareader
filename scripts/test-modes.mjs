import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fontFromHost, fontStack } from "../src/font.js";
import {
  DARK_PALETTE,
  DEFAULT_MODE,
  isPausedSite,
  normalizeSettings,
  paletteForMode,
  setEnabledMode,
  setMode,
  setSitePausedMode,
  siteModeOf,
  withSiteMode,
} from "../src/modes.js";

// A fresh install themes every site with Omarchy, as before.
assert.deepEqual(normalizeSettings(), { mode: DEFAULT_MODE, lastMode: "omarchy", sites: {} });
assert.equal(DEFAULT_MODE, "omarchy");

// Settings saved before 0.4.0 carry over: off stays off, paused sites stay Normal.
assert.deepEqual(normalizeSettings({ enabled: false, pausedSites: ["Example.COM.", "bad host", 4] }), {
  mode: "normal",
  lastMode: "omarchy",
  sites: { "example.com": "normal" },
});
assert.equal(normalizeSettings({ enabled: true, pausedSites: [] }).mode, "omarchy");
assert.deepEqual(
  normalizeSettings({ mode: "dark", lastMode: "normal", sites: { "b.example": "omarchy", "a.example": "loud", "": "dark" } }),
  { mode: "dark", lastMode: "omarchy", sites: { "b.example": "omarchy" } },
);
assert.equal(normalizeSettings({ mode: "sepia" }).mode, "omarchy");
console.log("saved settings and pre-0.4.0 settings read");

let settings = normalizeSettings();
settings = setMode(settings, "dark");
assert.equal(settings.mode, "dark");
assert.equal(settings.lastMode, "dark");
settings = setMode(settings, "normal");
assert.equal(settings.lastMode, "dark", "Normal remembers the last themed mode");
assert.equal(setMode(settings, "nope"), settings);

settings = withSiteMode(normalizeSettings(), "News.Example.", "dark");
assert.deepEqual(settings.sites, { "news.example": "dark" });
assert.equal(siteModeOf(settings, "news.example"), "dark");
assert.equal(siteModeOf(settings, "other.example"), "omarchy");
assert.equal(siteModeOf(settings, ""), "omarchy");
settings = withSiteMode(settings, "news.example", "default");
assert.deepEqual(settings.sites, {});
assert.equal(withSiteMode(settings, "x.example", "sepia"), settings);
assert.equal(withSiteMode(settings, "", "dark"), settings);
console.log("modes for all sites and one site");

// Alt+Shift+O: Normal everywhere, then back to the last themed mode.
settings = setMode(normalizeSettings(), "dark");
settings = setEnabledMode(settings, false);
assert.equal(settings.mode, "normal");
settings = setEnabledMode(settings, true);
assert.equal(settings.mode, "dark");
assert.equal(setEnabledMode(settings, true), settings);

// Alt+Shift+U: this site Normal, then themed again.
settings = setSitePausedMode(normalizeSettings(), "example.com", true);
assert.equal(isPausedSite(settings, "example.com"), true);
settings = setSitePausedMode(settings, "example.com", false);
assert.deepEqual(settings.sites, {}, "theming again follows the mode for all sites");
let off = setEnabledMode(setMode(normalizeSettings(), "dark"), false);
off = setSitePausedMode(off, "example.com", false);
assert.equal(siteModeOf(off, "example.com"), "dark", "with all sites Normal, the site gets the last themed mode");
assert.equal(isPausedSite(off, "other.example"), true);
console.log("shortcuts toggle Normal and back");

const omarchy = { theme: "tokyo-night", mode: "dark", background: "#1a1b26", foreground: "#a9b1d6" };
assert.equal(paletteForMode("normal", omarchy), null);
assert.equal(paletteForMode("dark", omarchy), DARK_PALETTE);
assert.equal(DARK_PALETTE.background, "#000000");
assert.equal(paletteForMode("omarchy", omarchy), omarchy);
assert.equal(paletteForMode("omarchy", null), null);
console.log("each mode paints with its palette");

assert.equal(fontFromHost({ family: " JetBrainsMono Nerd Font " }), "JetBrainsMono Nerd Font");
assert.equal(fontFromHost({ family: "Fira Code" }), "Fira Code");
assert.equal(fontFromHost({ family: 'Evil", serif; color: red' }), "");
assert.equal(fontFromHost({ family: "x".repeat(101) }), "");
assert.equal(fontFromHost({ family: 3 }), "");
assert.equal(fontFromHost(null), "");
assert.equal(fontStack("CaskaydiaMono Nerd Font"), '"CaskaydiaMono Nerd Font", monospace');
assert.equal(fontStack(""), "monospace");
assert.equal(fontStack("a}b"), "monospace");
console.log("popup font follows the Omarchy font");

const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
assert.match(background, /message\.themePalette = paletteForMode\(siteModeOf\(settings, hostFromUrl\(url\)\), palette\)/);
assert.match(background, /rememberFont\(message\.font\)/);
assert.match(background, /fromExtensionPage\(port\.sender, EXTENSION_ORIGIN\)[\s\S]*message\.type === "setMode"/);
const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
assert.match(content, /state\?\.themePalette/);
assert.doesNotMatch(content, /pausedSites/);
console.log("worker sends each page its palette");
