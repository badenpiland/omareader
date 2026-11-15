// SPDX-License-Identifier: MIT
// Normal leaves a page alone. Dark paints it pitch black and keeps the page's
// own hues. Omarchy follows the current Omarchy theme.
import { normalizeHost } from "./commands.js";

export const MODES = ["normal", "dark", "omarchy"];
export const DEFAULT_MODE = "omarchy";

export const DARK_PALETTE = Object.freeze({
  theme: "",
  mode: "dark",
  background: "#000000",
  foreground: "#e6e6e6",
  selection: "",
});

const isMode = (value) => MODES.includes(value);
const isThemed = (value) => isMode(value) && value !== "normal";

function sortedSites(sites) {
  return Object.fromEntries(Object.entries(sites).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// Reads saved settings. Earlier releases saved enabled and pausedSites; an
// install that turned Omareader off keeps it off, and a paused site stays Normal.
export function normalizeSettings(stored) {
  const raw = stored && typeof stored === "object" ? stored : {};
  let mode = isMode(raw.mode) ? raw.mode : raw.enabled === false ? "normal" : DEFAULT_MODE;
  const lastMode = isThemed(raw.lastMode) ? raw.lastMode : DEFAULT_MODE;
  const sites = {};
  for (const host of Array.isArray(raw.pausedSites) ? raw.pausedSites : []) {
    const key = typeof host === "string" ? normalizeHost(host) : "";
    if (key) {
      sites[key] = "normal";
    }
  }
  if (raw.sites && typeof raw.sites === "object") {
    for (const [host, value] of Object.entries(raw.sites)) {
      const key = normalizeHost(host);
      if (key && isMode(value)) {
        sites[key] = value;
      }
    }
  }
  if (!isMode(mode)) {
    mode = DEFAULT_MODE;
  }
  return { mode, lastMode, sites: sortedSites(sites) };
}

export function siteModeOf(settings, host) {
  const key = normalizeHost(host);
  const own = key ? settings.sites[key] : undefined;
  return isMode(own) ? own : settings.mode;
}

export function setMode(settings, mode) {
  if (!isMode(mode)) {
    return settings;
  }
  return {
    ...settings,
    mode,
    lastMode: isThemed(mode) ? mode : settings.lastMode,
  };
}

// "default" clears the site's own choice so it follows the mode for all sites.
export function withSiteMode(settings, host, mode) {
  const key = normalizeHost(host);
  if (!key || (mode !== "default" && !isMode(mode))) {
    return settings;
  }
  const sites = { ...settings.sites };
  if (mode === "default") {
    delete sites[key];
  } else {
    sites[key] = mode;
  }
  return { ...settings, sites: sortedSites(sites) };
}

// Alt+Shift+O: Normal everywhere, or back to the last themed mode.
export function setEnabledMode(settings, enabled) {
  if (enabled) {
    return settings.mode === "normal" ? setMode(settings, settings.lastMode) : settings;
  }
  return settings.mode === "normal" ? settings : { ...settings, mode: "normal", lastMode: settings.mode };
}

// Alt+Shift+U: Normal on this site, or themed again. Theming again drops the
// site's own choice when the mode for all sites already themes it.
export function setSitePausedMode(settings, host, paused) {
  if (paused) {
    return withSiteMode(settings, host, "normal");
  }
  return withSiteMode(settings, host, settings.mode === "normal" ? settings.lastMode : "default");
}

export function isPausedSite(settings, host) {
  return siteModeOf(settings, host) === "normal";
}

// The palette a page on this host is painted with, or null to leave it alone.
export function paletteForMode(mode, omarchyPalette) {
  if (mode === "dark") {
    return DARK_PALETTE;
  }
  if (mode === "omarchy" && omarchyPalette?.background && omarchyPalette?.foreground) {
    return omarchyPalette;
  }
  return null;
}
