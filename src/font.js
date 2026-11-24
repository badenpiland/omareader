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

// The face's full and PostScript names from the host, for CSS local().
export function fontFacesFromHost(faces) {
  if (!Array.isArray(faces)) {
    return [];
  }
  const names = [];
  for (const face of faces.slice(0, 4)) {
    const name = fontFromHost({ family: face });
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

// Chromium reads fontconfig's rules once, at startup, and they map every
// monospace family to the font Omarchy had set then. Loading the face by name
// with local() skips those rules, so a font change shows without a restart.
// The family name changes with the face, so the browser never reuses the old one.
export function fontFaceRule(faces) {
  const names = fontFacesFromHost(faces);
  if (names.length === 0) {
    return { family: "", css: "" };
  }
  const family = `Omareader ${names[0]}`;
  const src = names.map((name) => `local("${name}")`).join(", ");
  return { family, css: `@font-face { font-family: "${family}"; src: ${src}; }` };
}

// The user's Omarchy font first, then the browser's own monospace, which
// fontconfig also resolves to the Omarchy font after a browser restart.
export function fontStack(family, faces = []) {
  const name = fontFromHost({ family });
  const face = fontFaceRule(faces).family;
  const stack = [face, name].filter(Boolean).map((item) => `"${item}"`);
  return [...stack, "monospace"].join(", ");
}
