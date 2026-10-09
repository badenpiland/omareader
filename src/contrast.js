// SPDX-License-Identifier: MIT
// Text that would disappear into the theme background is drawn in the theme foreground.

const MIN_PAIR = 7;
const MIN_TEXT = 4.5;
const LIGHT_CAP = 0.96;
const DARK_CAP = 0.08;

function parseColor(value) {
  const text = String(value ?? "").trim();
  const named = text.toLowerCase();
  if (named === "black") {
    return "#000000";
  }
  if (named === "white") {
    return "#ffffff";
  }
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    const r = text[1];
    const g = text[2];
    const b = text[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.toLowerCase();
  }
  const rgb = text.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i,
  );
  if (!rgb) {
    return null;
  }
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (!Number.isFinite(alpha) || alpha < 1) {
    return null;
  }
  const channel = (part) => {
    const number = Number(part);
    if (!Number.isFinite(number)) {
      return null;
    }
    return Math.max(0, Math.min(255, Math.round(number)));
  };
  const red = channel(rgb[1]);
  const green = channel(rgb[2]);
  const blue = channel(rgb[3]);
  if (red === null || green === null || blue === null) {
    return null;
  }
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function channels(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function linear(channel) {
  const value = channel / 255;
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [red, green, blue] = channels(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(left, right) {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(hex) {
  const [red, green, blue] = channels(hex).map((part) => part / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  return { h: hue / 6, s: saturation, l: lightness };
}

function hueChannel(p, q, t) {
  let turn = t;
  if (turn < 0) {
    turn += 1;
  }
  if (turn > 1) {
    turn -= 1;
  }
  if (turn < 1 / 6) {
    return p + (q - p) * 6 * turn;
  }
  if (turn < 1 / 2) {
    return q;
  }
  if (turn < 2 / 3) {
    return p + (q - p) * (2 / 3 - turn) * 6;
  }
  return p;
}

function hslToHex({ h, s, l }) {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return `#${[gray, gray, gray].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const red = Math.round(hueChannel(p, q, h + 1 / 3) * 255);
  const green = Math.round(hueChannel(p, q, h) * 255);
  const blue = Math.round(hueChannel(p, q, h - 1 / 3) * 255);
  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function liftForeground(background, foreground) {
  const hsl = rgbToHsl(foreground);
  const lighter = luminance(foreground) >= luminance(background);
  const cap = lighter ? LIGHT_CAP : DARK_CAP;
  const at = (lightness) => contrast(hslToHex({ ...hsl, l: lightness }), background);
  if (at(cap) < MIN_PAIR) {
    return hslToHex({ ...hsl, l: cap });
  }
  let low = lighter ? hsl.l : cap;
  let high = lighter ? cap : hsl.l;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    const passes = at(mid) >= MIN_PAIR;
    if (lighter) {
      if (passes) {
        high = mid;
      } else {
        low = mid;
      }
    } else if (passes) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return hslToHex({ ...hsl, l: lighter ? high : low });
}

export function readablePoles(background, foreground) {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  if (!bg || !fg || contrast(bg, fg) >= MIN_PAIR) {
    return { background, foreground };
  }
  return { background, foreground: liftForeground(bg, fg) };
}

const COLOR_TOKEN =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\([^)]*\)|\b(?:black|white)\b/gi;

function repairValue(value, background, foreground) {
  return value.replace(COLOR_TOKEN, (token) => {
    const parsed = parseColor(token);
    if (!parsed || contrast(parsed, background) >= MIN_TEXT) {
      return token;
    }
    return foreground;
  });
}

export function repairFixColors(css, background, foreground) {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  if (!bg || !fg || typeof css !== "string" || css === "") {
    return css;
  }
  const foregroundText = String(foreground).trim();
  const masks = [];
  const masked = css.replace(/\$\{[^}]*\}/g, (match) => {
    const marker = `___OMAREADER_${masks.length}___`;
    masks.push(match);
    return marker;
  });
  const repaired = masked.replace(/(^|[^-\w])(color\s*:\s*)([^;}{]+)/gi, (match, prefix, property, value) => {
    return `${prefix}${property}${repairValue(value, bg, foregroundText)}`;
  });
  return repaired.replace(/___OMAREADER_(\d+)___/g, (_, index) => masks[Number(index)]);
}

// Amazon draws this header sprite light, for its own dark bar. Inverting it
// turns the word black and hides it. The orange smile stays orange either way.
// A light theme still inverts the sprite so the word stays visible.
const LIGHT_SPRITE = "span.nav-logo-base";

export function readableInvert(selectors, mode) {
  if (mode === "light" || !Array.isArray(selectors)) {
    return selectors;
  }
  return selectors.filter((selector) => String(selector).trim() !== LIGHT_SPRITE);
}
