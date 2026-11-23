// SPDX-License-Identifier: MIT
// Omarchy theme hues for page colors.
//
// Dark Reader decides how light or dark each page color should be. This moves
// the hue of every clearly colored result to the nearest of the theme's own
// named colors, so links, badges and buttons wear the theme's red, green, blue
// and so on. Grays are left to Dark Reader, which already puts them on the
// theme background and foreground. Lightness is never changed, so text keeps
// the contrast Dark Reader gave it.
//
// Colors are compared in OKLCH (Björn Ottosson's OKLab, public domain), where
// equal hue steps look equally far apart.

// Below this OKLCH chroma a color reads as gray and keeps Dark Reader's hue.
export const MIN_CHROMA = 0.035;
// How far chroma moves from the page's own toward the theme color's.
export const CHROMA_PULL = 0.6;
export const HUE_LIMIT = 12;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

function oklchToLinear({ L, C, H }) {
  const rad = (H * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

// Back to sRGB, lowering chroma until the color fits, so hue and lightness hold.
export function oklchToRgb(color) {
  let low = 0;
  let high = color.C;
  let linear = oklchToLinear(color);
  if (!inGamut(linear)) {
    for (let step = 0; step < 16; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, C: mid }))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    linear = oklchToLinear({ ...color, C: low });
  }
  return linear.map((c) => toGamma(Math.min(1, Math.max(0, c))));
}

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) {
    return null;
  }
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255);
}

const parsed = new Map();

// "f7768e,9ece6a,…" to the theme's colored hues. Grays in the list are dropped.
export function themeHues(list) {
  const key = String(list || "");
  if (parsed.has(key)) {
    return parsed.get(key);
  }
  const hues = key
    .split(",")
    .map(hexToRgb)
    .filter(Boolean)
    .map(rgbToOklch)
    .filter((color) => color.C >= MIN_CHROMA)
    .slice(0, HUE_LIMIT);
  parsed.set(key, hues);
  return hues;
}

const hueGap = (a, b) => {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
};

export function nearestHue(color, hues) {
  let best = null;
  for (const hue of hues) {
    if (!best || hueGap(color.H, hue.H) < hueGap(color.H, best.H)) {
      best = hue;
    }
  }
  return best;
}

// One sRGB color, channels 0 to 1, in the theme's hues.
export function tintRgb(rgb, hues) {
  const color = rgbToOklch(rgb);
  if (color.C < MIN_CHROMA || !hues.length) {
    return rgb;
  }
  const target = nearestHue(color, hues);
  const C = color.C + (target.C - color.C) * CHROMA_PULL;
  return oklchToRgb({ L: color.L, C, H: target.H });
}

function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return { h: 0, s: 0, l };
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: Math.min(1, s), l };
}

// Dark Reader works in HSL ({h: 0-360, s, l: 0-1, a}). The build calls this on
// every color Dark Reader modifies, with the hue list from the theme options
// and the page's own color. Only colors the page drew as colors are tinted:
// a gray that Dark Reader moved onto a bluish theme foreground stays as it is.
export function tintHsl(hsl, list, source) {
  const hues = themeHues(list);
  if (!hues.length) {
    return hsl;
  }
  if (source && rgbToOklch(hslToRgb(source)).C < MIN_CHROMA) {
    return hsl;
  }
  const rgb = hslToRgb(hsl);
  const next = tintRgb(rgb, hues);
  if (next === rgb) {
    return hsl;
  }
  return { ...rgbToHsl(next), a: hsl.a };
}
