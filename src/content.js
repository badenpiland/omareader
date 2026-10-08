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

function apply(state) {
  const palette = state?.palette;
  const active = Boolean(
    state &&
      state.enabled !== false &&
      palette?.background &&
      palette?.foreground,
  );
  const next = active ? JSON.stringify(palette) : "";
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
    enable(themeFrom(palette));
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
    port.postMessage({ type: "getState" });
  } catch {
    // The worker will push state when it reconnects.
  }
}

connect();
