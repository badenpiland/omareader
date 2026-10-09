import assert from "node:assert/strict";
import { readableInvert, readablePoles, repairFixColors } from "../src/contrast.js";

const background = "#151E26";
const foreground = "#ECE5D8";

const same = readablePoles(background, foreground);
assert.equal(same.background, background);
assert.equal(same.foreground, foreground);

const dim = readablePoles(background, "#4A3F38");
assert.equal(dim.background, background);
assert.notEqual(dim.foreground.toLowerCase(), "#4a3f38");
assert.ok(contrastOf(dim.foreground, background) >= 7, dim.foreground);

const before = hslOf("#4A3F38");
const after = hslOf(dim.foreground);
assert.ok(Math.abs(before.h - after.h) < 0.02, `${before.h} -> ${after.h}`);
assert.ok(after.l > before.l);

const css = [
  ".bg-no-repeat .color-squid-ink-dark { color: #161e2d !important; }",
  "span { color: black !important; }",
  "button { background-color: #febd69 !important; }",
  "a { color: #febd69 !important; }",
  ".templated { color: ${#007185} !important; }",
  ".bordered { border: 1px solid #161e2d; }",
].join("\n");
const repaired = repairFixColors(css, background, foreground);
assert.match(repaired, /\.color-squid-ink-dark \{ color: #ECE5D8 !important; \}/);
assert.match(repaired, /span \{ color: #ECE5D8 !important; \}/);
assert.equal(repaired.includes("color: black"), false);
assert.equal(repaired.includes("#161e2d !important"), false);
assert.match(repaired, /background-color: #febd69 !important/);
assert.match(repaired, /a \{ color: #febd69 !important; \}/);
assert.match(repaired, /color: \$\{#007185\} !important/);
assert.match(repaired, /border: 1px solid #161e2d/);

const logo = ["span.nav-logo-base", " i.a-icon.a-icon-search "];
assert.deepEqual(readableInvert(logo, "dark"), [" i.a-icon.a-icon-search "]);
assert.equal(readableInvert(logo, "light"), logo);
assert.equal(readableInvert(null, "dark"), null);

function channels(hex) {
  const text = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(text.slice(index, index + 2), 16));
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastOf(left, right) {
  const lum = (hex) => {
    const [red, green, blue] = channels(hex);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  };
  const lighter = Math.max(lum(left), lum(right));
  const darker = Math.min(lum(left), lum(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function hslOf(hex) {
  const [red, green, blue] = channels(hex).map((part) => part / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue /= 6;
  }
  return { h: hue, l: lightness };
}

console.log("contrast repair checked");
