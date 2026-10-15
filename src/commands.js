// SPDX-License-Identifier: MIT

export const COMMAND_TOGGLE = "toggle";
export const COMMAND_TOGGLE_SITE = "toggle-site";

// Long enough to read, short enough that the glasses icon remains the lasting signal.
export const COMMAND_BADGE_MS = 1500;

export function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host || host.length > 253 || /[\s/]/.test(host)) {
    return "";
  }
  return host;
}

export function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function tabIdOf(tab) {
  return typeof tab?.id === "number" ? tab.id : undefined;
}

// Suggested keys are Alt+Shift+O and Alt+Shift+U in the manifest. Omarchy binds
// O with SUPER, and Chromium already uses Ctrl+U, Ctrl+Shift+O, and Alt+Shift+T.
export async function runReaderCommand(command, tab, deps) {
  if (command === COMMAND_TOGGLE) {
    const enabled = !deps.isEnabled();
    return { type: "setEnabled", enabled, badge: enabled ? "ON" : "OFF", tabId: tabIdOf(tab) };
  }
  if (command !== COMMAND_TOGGLE_SITE) {
    return null;
  }
  let current = tab;
  if (!current || typeof current.url !== "string") {
    current = await deps.focusedTab();
  }
  const host = hostFromUrl(current?.url || "");
  if (!host) {
    return null;
  }
  const paused = !deps.isPaused(host);
  return { type: "setSitePaused", host, paused, tabId: tabIdOf(current) };
}
