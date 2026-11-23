// SPDX-License-Identifier: MIT

export const THEME_NAME_LIMIT = 100;
export const HOST_ERROR_LIMIT = 300;
export const HOST_MISSING = "Theme host not installed — run ./install.sh";

export function clipText(value, limit) {
  const text = typeof value === "string" ? value : "";
  return text.length > limit ? text.slice(0, limit) : text;
}

// Same shapes the native host accepts: #rgb, #rrggbb, and #rrggbbaa.
export function normalizeHex(value) {
  if (typeof value !== "string") {
    return "";
  }
  const text = value.trim().toLowerCase();
  if (!text.startsWith("#")) {
    return "";
  }
  let digits = text.slice(1);
  if (digits.length === 3 && /^[0-9a-f]{3}$/.test(digits)) {
    digits = [...digits].map((char) => char + char).join("");
  }
  if (digits.length === 8) {
    digits = digits.slice(0, 6);
  }
  if (digits.length !== 6 || /[^0-9a-f]/.test(digits)) {
    return "";
  }
  return `#${digits}`;
}

export function paletteFromHost(message) {
  const background = normalizeHex(message?.background);
  const foreground = normalizeHex(message?.foreground);
  if (!background || !foreground) {
    return null;
  }
  return {
    theme: clipText(message.theme, THEME_NAME_LIMIT),
    mode: message.mode === "light" ? "light" : "dark",
    background,
    foreground,
    selection: normalizeHex(message.selection),
  };
}

export function hostFailureText(message, fallback) {
  const text = typeof message === "string" ? message : "";
  if (/not found/i.test(text)) {
    return HOST_MISSING;
  }
  return clipText(text || fallback || "", HOST_ERROR_LIMIT);
}
