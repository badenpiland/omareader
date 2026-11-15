// SPDX-License-Identifier: MIT
// The native host reports the family Omarchy set as the system monospace font
// (what `omarchy-font-current` prints). Only plain family names are accepted, so
// the popup can quote one inside a CSS font-family list.

export const FONT_NAME_LIMIT = 100;

export function fontFromHost(message) {
  const family = typeof message?.family === "string" ? message.family.trim() : "";
  if (!family || family.length > FONT_NAME_LIMIT || !/^[\p{L}\p{N} ._+-]+$/u.test(family)) {
    return "";
  }
  return family;
}

// The user's Omarchy font first, then the browser's own monospace, which
// fontconfig also resolves to the Omarchy font after a browser restart.
export function fontStack(family) {
  const name = fontFromHost({ family });
  return name ? `"${name}", monospace` : "monospace";
}
