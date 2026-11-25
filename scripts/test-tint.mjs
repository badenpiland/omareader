// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIN_CHROMA, nearestHue, oklchToRgb, rgbToOklch, themeHues, tintHsl, tintRgb } from "../src/tint.js";
import { addNestedDeclarations, addThemeHues } from "./proxy-source.mjs";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// OKLCH round trip.
for (const rgb of [[1, 0, 0], [0.2, 0.6, 0.3], [0.5, 0.5, 0.5], [0.1, 0.1, 0.9]]) {
  const back = oklchToRgb(rgbToOklch(rgb));
  rgb.forEach((c, i) => close(c, back[i]));
}
close(rgbToOklch([1, 1, 1]).L, 1);
assert.ok(rgbToOklch([0.5, 0.5, 0.5]).C < 1e-4);

// Tokyo Night's named colors. Grays in the list are dropped.
const tokyo = "f7768e,e0af68,9ece6a,449dab,7aa2f7,ad8ee6,8a8a8c";
const hues = themeHues(tokyo);
assert.equal(hues.length, 6);
assert.equal(themeHues(""), themeHues(""));
assert.deepEqual(themeHues("nope,#zzz"), []);

// A page blue lands on the theme blue's hue and keeps its lightness.
const pageBlue = [0.04, 0.41, 0.85];
const tinted = rgbToOklch(tintRgb(pageBlue, hues));
const blue = rgbToOklch([0x7a / 255, 0xa2 / 255, 0xf7 / 255]);
close(tinted.H, blue.H, 0.5);
close(tinted.L, rgbToOklch(pageBlue).L, 1e-3);
assert.equal(nearestHue(rgbToOklch([0.8, 0.1, 0.1]), hues).H, rgbToOklch([0xf7 / 255, 0x76 / 255, 0x8e / 255]).H);

// Grays and near grays are left alone.
const gray = [0.6, 0.6, 0.62];
assert.ok(rgbToOklch(gray).C < MIN_CHROMA);
assert.equal(tintRgb(gray, hues), gray);

// Dark Reader's HSL in and out. No hues, or a gray page color, changes nothing.
const hsl = { h: 212, s: 0.9, l: 0.45, a: 1 };
assert.equal(tintHsl(hsl, ""), hsl);
assert.equal(tintHsl(hsl, tokyo, { h: 0, s: 0, l: 0.2, a: 1 }), hsl);
const out = tintHsl(hsl, tokyo, hsl);
assert.notDeepEqual(out, hsl);
assert.equal(out.a, 1);
for (const key of ["h", "s", "l"]) {
  assert.ok(Number.isFinite(out[key]));
}
assert.equal(tintHsl({ ...hsl, a: 0.5 }, tokyo, hsl).a, 0.5);

// The build hook: once, with the hue list in the color cache key.
const darkReader = readFileSync(new URL("../node_modules/darkreader/darkreader.mjs", import.meta.url), "utf8");
const patched = addThemeHues(darkReader, "/x/tint.js");
assert.match(patched, /^import \{ tintHsl as omareaderTintHsl \} from "\/x\/tint\.js";/);
assert.match(patched, /const themeCacheKeys = \[\n {4}"omareaderHues",/);
assert.equal(patched.split("omareaderTintHsl(modifyHSL(hsl, pole, anotherPole), theme.omareaderHues, hsl)").length, 2);
assert.throws(() => addThemeHues("nothing here"), /themeCacheKeys was not found/);

// Declarations after a nested rule (CSSNestedDeclarations) reach Dark Reader
// as "&" inside their parent, so variables defined there get themed.
const nested = addNestedDeclarations(darkReader);
assert.equal(nested.split("rule = omareaderNestedDeclarations(rule);").length, 2);
assert.match(nested, /^const omareaderNestedRules = new WeakMap\(\);/);
assert.match(nested, /selectorText: "&"/);
assert.match(nested, /rule instanceof CSSNestedDeclarations/);
assert.throws(() => addNestedDeclarations("nothing here"), /iterateCSSRules loop was not found/);
{
  const helper = nested.slice(0, nested.indexOf("function omareaderNestedDeclarations") + 2000);
  const body = helper.slice(helper.indexOf("function omareaderNestedDeclarations"), helper.indexOf("\n}\n") + 2);
  class CSSNestedDeclarations {
    constructor(style, parentRule) {
      this.style = style;
      this.parentRule = parentRule;
      this.parentStyleSheet = null;
    }
  }
  const make = new Function("CSSNestedDeclarations", `const omareaderNestedRules = new WeakMap();\n${body}\nreturn omareaderNestedDeclarations;`);
  const wrap = make(CSSNestedDeclarations);
  const parent = { selectorText: ":root" };
  const decls = new CSSNestedDeclarations({ cssText: "--color-border: red;" }, parent);
  const wrapped = wrap(decls);
  assert.equal(wrapped.selectorText, "&");
  assert.equal(wrapped.parentRule, parent);
  assert.equal(wrapped.cssText, "& { --color-border: red; }");
  assert.equal(wrap(decls), wrapped, "the same wrapper each time, so Dark Reader's caches hold");
  assert.equal(wrap(parent), parent, "style rules pass through");
}
const content = readFileSync(new URL("../src/content.js", import.meta.url), "utf8");
assert.match(content, /omareaderHues: \(palette\.hues \|\| \[\]\)/);
console.log("theme hues tint page colors");
