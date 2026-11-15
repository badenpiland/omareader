// SPDX-License-Identifier: MIT
import { updateLine } from "./update-notice.js";
import { fontStack } from "./font.js";
import { DARK_PALETTE, normalizeSettings, setMode, siteModeOf, withSiteMode } from "./modes.js";

const $ = (id) => document.getElementById(id);
const LABELS = { normal: "Normal", dark: "Dark", omarchy: "Follow Omarchy" };
const DARK_READER_KNOWN = "Dark Reader is also on. Both extensions restyle the page. Turn Dark Reader off?";
const DARK_READER_UNKNOWN = "If Dark Reader is also on, both restyle pages. Turn it off?";

let latest = null;
let settings = normalizeSettings();
let host = "";
let declineNote = "";

const pretty = (name) =>
  String(name || "")
    .replace(/^theme-/, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const port = chrome.runtime.connect({ name: "client" });

function check(group, mode) {
  for (const button of group.querySelectorAll("button")) {
    button.setAttribute("aria-checked", String(button.dataset.mode === mode));
    button.tabIndex = button.dataset.mode === mode ? 0 : -1;
  }
}

function paintPopup(palette) {
  const root = document.documentElement.style;
  if (palette?.background && palette?.foreground) {
    root.setProperty("--bg", palette.background);
    root.setProperty("--fg", palette.foreground);
    root.setProperty("--accent", palette.accent || palette.foreground);
    document.documentElement.style.colorScheme = palette.mode === "light" ? "light" : "dark";
  }
  // The logo matches the theme: light glasses on a light theme, dark glasses otherwise.
  $("logo").src = palette?.mode === "light" ? "icon-light-32.png" : "icon-dark-32.png";
}

function paintSwatches(mode, palette) {
  const swatches = $("swatches");
  let colors = [];
  if (mode === "dark") {
    colors = [DARK_PALETTE.background, DARK_PALETTE.foreground];
  } else if (mode === "omarchy" && palette) {
    colors = palette.swatches?.length ? palette.swatches : [palette.background, palette.foreground];
  }
  swatches.hidden = colors.length === 0;
  swatches.replaceChildren(
    ...colors.map((color) => {
      const swatch = document.createElement("i");
      swatch.style.background = color;
      swatch.title = color;
      return swatch;
    }),
  );
}

function statusText(mode, state) {
  if (declineNote) {
    return declineNote;
  }
  if (mode === "normal") {
    return "Pages shown as they are";
  }
  if (mode === "dark") {
    return "Pitch black · page hues kept";
  }
  if (state?.hostError) {
    return state.hostError;
  }
  if (!state?.palette) {
    return "Waiting for Omarchy";
  }
  const name = pretty(state.palette.theme);
  return name ? `Live sync · ${name}` : "Live sync";
}

function applyUpdate(available, checked) {
  const line = updateLine(chrome.runtime.getManifest().version, available, checked);
  const link = $("update-available");
  $("update-installed").textContent = line.installed;
  link.hidden = line.available === "";
  // "Update to v0.4.0" does not fit beside the wordmark. The link names the release.
  link.textContent = line.available.replace(/^Update to /, "get ");
  if (line.href) {
    link.href = line.href;
    link.title = line.available;
  } else {
    link.removeAttribute("href");
    link.removeAttribute("title");
  }
}

function render() {
  const state = latest;
  const mode = siteModeOf(settings, host);
  const own = host ? settings.sites[host] : undefined;
  check($("modes"), settings.mode);
  check($("site-modes"), own || "default");
  $("site").textContent = host || "Not available on this page";
  $("site-keys").hidden = !host;
  for (const button of $("site-modes").querySelectorAll("button")) {
    button.disabled = !host;
  }
  $("site-modes").querySelector('[data-mode="default"]').title = `Use the mode for all sites (${LABELS[settings.mode]})`;
  document.documentElement.style.setProperty("--font", fontStack(state?.font));
  paintPopup(state?.palette);
  paintSwatches(mode, state?.palette);
  $("status").textContent = statusText(mode, state);
  $("dark-reader").hidden = !state?.darkReaderPrompt;
  if (state?.darkReaderPrompt) {
    $("dark-reader-text").textContent = state.darkReaderKnown ? DARK_READER_KNOWN : DARK_READER_UNKNOWN;
  }
  $("site-fixes").checked = state?.siteFixesAutoUpdate !== false;
  applyUpdate(state?.updateVersion, state?.updateChecked);
}

// Both rows are radio groups: click to pick, arrow keys to move like a native one.
function radioGroup(group, selected, pick) {
  const modes = () => [...group.querySelectorAll("button")].map((button) => button.dataset.mode);
  const choose = (mode) => {
    if (mode !== selected()) {
      pick(mode);
      render();
    }
  };
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (button && !button.disabled) {
      choose(button.dataset.mode);
    }
  });
  group.addEventListener("keydown", (event) => {
    if ((event.key !== "ArrowLeft" && event.key !== "ArrowRight") || group.querySelector("button:disabled")) {
      return;
    }
    event.preventDefault();
    const list = modes();
    const index = list.indexOf(selected()) + (event.key === "ArrowRight" ? 1 : -1);
    const next = list[(index + list.length) % list.length];
    choose(next);
    group.querySelector(`[data-mode="${next}"]`).focus();
  });
}

radioGroup($("modes"), () => settings.mode, (mode) => {
  settings = setMode(settings, mode);
  port.postMessage({ type: "setMode", mode });
});

radioGroup($("site-modes"), () => (host && settings.sites[host]) || "default", (mode) => {
  if (!host) {
    return;
  }
  settings = withSiteMode(settings, host, mode);
  port.postMessage({ type: "setSiteMode", host, mode });
});

port.onMessage.addListener((state) => {
  if (!state || typeof state !== "object") {
    return;
  }
  latest = state;
  settings = normalizeSettings(state);
  render();
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    const url = new URL(tabs?.[0]?.url || "");
    host = /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/, "") : "";
  } catch {
    host = "";
  }
  render();
});

$("dark-reader-off").addEventListener("click", async () => {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ permissions: ["management"] });
  } catch {
    // Leave granted false and tell the user how to turn Dark Reader off.
  }
  if (!granted) {
    declineNote = "Turn Dark Reader off in chrome://extensions.";
  }
  port.postMessage({ type: "darkReaderChoice", disable: granted });
});

$("dark-reader-keep").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: false });
});

$("site-fixes").addEventListener("change", () => {
  port.postMessage({ type: "setSiteFixesAutoUpdate", enabled: $("site-fixes").checked });
});

render();
