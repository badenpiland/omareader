// SPDX-License-Identifier: MIT

function usable(palette) {
  return Boolean(palette && typeof palette === "object" && palette.background && palette.foreground);
}

// Session storage is the first paint on Chromium. Firefox does not expose
// storage.session to content scripts, so the copy in storage.local is the fallback.
export function earlyPalette(sessionStored, localStored) {
  if (usable(sessionStored?.palette)) {
    return sessionStored.palette;
  }
  if (usable(localStored?.palette)) {
    return localStored.palette;
  }
  return null;
}
