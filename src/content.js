// SPDX-License-Identifier: MIT
import { disable, enable } from "darkreader";

let lastKey = "";
let earlySealed = false;

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
  if (state?.enabled === false || pausedHere(state)) {
    sealEarly();
  }
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
    sealEarly();
  }
}

function sealEarly() {
  earlySealed = true;
  document.documentElement?.removeAttribute("data-omareader-early");
}

function cssHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : "";
}

async function paintEarly() {
  try {
    const stored = await chrome.storage.session.get("palette");
    const palette = stored?.palette;
    const background = cssHex(palette?.background);
    const foreground = cssHex(palette?.foreground);
    if (earlySealed || !background || !foreground || !document.documentElement) {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--omareader-bg", background);
    root.style.setProperty("--omareader-fg", foreground);
    root.setAttribute("data-omareader-early", "");
  } catch {
    // Session storage can be closed off. The port still applies the theme.
  }
}

let retryMs = 300;
const MAX_RETRY_MS = 5000;

function contextAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

// An update or reload leaves this script in the page with a dead extension
// context. Stop retrying, and drop the theme paint if Dark Reader still can.
function leaveOrphaned() {
  try {
    disable();
  } catch {
    // The page keeps whatever paint is already there.
  }
}

function retry() {
  if (!contextAlive()) {
    leaveOrphaned();
    return;
  }
  setTimeout(connect, retryMs);
  retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
}

function connect() {
  if (!contextAlive()) {
    leaveOrphaned();
    return;
  }
  let port;
  try {
    port = chrome.runtime.connect({ name: "client" });
  } catch (error) {
    if (/context invalidated/i.test(String(error?.message))) {
      leaveOrphaned();
      return;
    }
    retry();
    return;
  }
  port.onMessage.addListener((state) => {
    retryMs = 300;
    apply(state);
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    retry();
  });
  try {
    port.postMessage({ type: "getState", url: location.href });
  } catch {
    // The worker will push state when it reconnects.
  }
}

paintEarly();
connect();
