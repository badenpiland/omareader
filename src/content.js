// SPDX-License-Identifier: MIT
import { disable, enable } from "darkreader";

let lastKey = "";

function themeFrom(palette) {
  const light = palette.mode === "light";
  return {
    mode: light ? 0 : 1,
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    sepia: 0,
    darkSchemeBackgroundColor: palette.background,
    darkSchemeTextColor: palette.foreground,
    lightSchemeBackgroundColor: palette.background,
    lightSchemeTextColor: palette.foreground,
    selectionColor: palette.selection || "auto",
    styleSystemControls: true,
  };
}

function pausedHere(state) {
  const host = location.hostname.toLowerCase().replace(/\.$/, "");
  return Boolean(host && state?.pausedSites?.includes(host));
}

function apply(state) {
  const palette = state?.palette;
  const active = Boolean(
    state &&
      state.enabled !== false &&
      !pausedHere(state) &&
      palette?.background &&
      palette?.foreground,
  );
  // siteFix is this page's Dark Reader corrections. A later download has to
  // change this key so the engine repaints with the new list.
  const hasFix = Boolean(state && Object.prototype.hasOwnProperty.call(state, "siteFix"));
  const fix = hasFix && state.siteFix && typeof state.siteFix === "object" ? state.siteFix : null;
  const next = active ? JSON.stringify([palette, hasFix ? fix : null]) : "";
  if (next === lastKey) {
    return;
  }
  // A color-only change takes Dark Reader's short path and leaves the old
  // background paint in place. Clearing the engine forces a full repaint.
  if (lastKey) {
    disable();
  }
  lastKey = next;
  if (active) {
    enable(themeFrom(palette), fix || undefined);
  }
}

function connect() {
  let port;
  try {
    port = chrome.runtime.connect({ name: "client" });
  } catch {
    setTimeout(connect, 300);
    return;
  }
  port.onMessage.addListener(apply);
  port.onDisconnect.addListener(() => {
    setTimeout(connect, 300);
  });
  try {
    port.postMessage({ type: "getState", url: location.href });
  } catch {
    // The worker will push state when it reconnects.
  }
}

connect();
