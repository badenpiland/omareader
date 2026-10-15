// SPDX-License-Identifier: MIT
import { updateLine } from "./update-notice.js";

const enabledButton = document.querySelector("#enabled");
const enabledCtrl = document.querySelector("#enabled-ctrl");
const enabledLabel = document.querySelector("#enabled-label");
const siteLine = document.querySelector("#site-line");
const siteHost = document.querySelector("#site-host");
const siteCtrl = document.querySelector("#site-ctrl");
const siteButton = document.querySelector("#site");
const siteLabel = document.querySelector("#site-label");
const siteIcon = document.querySelector("#site-icon");
const themeNode = document.querySelector("#theme");
const statusNode = document.querySelector("#status");
const legacyNode = document.querySelector("#legacy");
const legacyText = document.querySelector("#legacy-text");
const swatches = document.querySelector(".swatches");
const bg = document.querySelector("#bg");
const fg = document.querySelector("#fg");
const bgLabel = document.querySelector("#bg-label");
const fgLabel = document.querySelector("#fg-label");
const darkReader = document.querySelector("#dark-reader");
const siteFixesInput = document.querySelector("#site-fixes");
const updateInstalled = document.querySelector("#update-installed");
const updateAvailable = document.querySelector("#update-available");
const darkReaderText = document.querySelector("#dark-reader-text");
const DARK_READER_KNOWN = "Dark Reader is also on. Both extensions restyle the page. Turn Dark Reader off?";
const DARK_READER_UNKNOWN = "If Dark Reader is also on, both restyle pages. Turn it off?";
let declineNote = "";
let latest = null;
let host = "";

function syncDetails() {
  siteLine.hidden = !host;
}

function renderControls() {
  const enabled = latest?.enabled !== false;
  const paused = Boolean(host && latest?.pausedSites?.includes(host));
  enabledLabel.textContent = enabled ? "turn off everywhere" : "turn on everywhere";
  enabledCtrl.classList.toggle("muted", !enabled);
  siteCtrl.hidden = !host;
  siteCtrl.classList.toggle("muted", Boolean(host) && (!enabled || paused));
  if (host) {
    siteHost.textContent = host;
    const theming = enabled && !paused;
    siteLabel.textContent = enabled && paused ? "theme this site" : "pause on this site";
    siteIcon.classList.toggle("pause", theming || !enabled);
    siteIcon.classList.toggle("play", enabled && paused);
  }
  syncDetails();
}

function applyPalette(palette) {
  const root = document.documentElement;
  if (!palette?.background || !palette?.foreground) {
    themeNode.textContent = "Waiting for Omarchy";
    swatches.hidden = true;
    root.style.removeProperty("--popup-bg");
    root.style.removeProperty("--popup-fg");
    root.style.colorScheme = "";
    return;
  }
  const name = palette.theme || "current theme";
  themeNode.textContent = `${name} · ${palette.mode}`;
  swatches.hidden = false;
  bg.style.background = palette.background;
  fg.style.background = palette.foreground;
  bgLabel.textContent = palette.background;
  fgLabel.textContent = palette.foreground;
  root.style.setProperty("--popup-bg", palette.background);
  root.style.setProperty("--popup-fg", palette.foreground);
  root.style.colorScheme = palette.mode === "light" ? "light" : "dark";
}

function render(state) {
  if (!state) {
    return;
  }
  latest = state;
  renderControls();
  applyPalette(state.palette);
  const legacy = typeof state.legacyNotice === "string" ? state.legacyNotice : "";
  legacyNode.hidden = legacy === "";
  legacyText.textContent = legacy;
  const note = state.hostError || declineNote;
  statusNode.textContent = note;
  statusNode.hidden = note === "";
  darkReader.hidden = !state.darkReaderPrompt;
  siteFixesInput.checked = state.siteFixesAutoUpdate !== false;
  applyUpdate(state.updateVersion, state.updateChecked);
  if (state.darkReaderPrompt) {
    darkReaderText.textContent = state.darkReaderKnown ? DARK_READER_KNOWN : DARK_READER_UNKNOWN;
  }
  syncDetails();
}

function applyUpdate(available, checked) {
  const line = updateLine(chrome.runtime.getManifest().version, available, checked);
  updateInstalled.textContent = line.installed;
  updateAvailable.hidden = line.available === "";
  updateAvailable.textContent = line.available;
  if (line.href) {
    updateAvailable.href = line.href;
  } else {
    updateAvailable.removeAttribute("href");
  }
}

applyUpdate("", false);

const port = chrome.runtime.connect({ name: "client" });
port.onMessage.addListener(render);
enabledButton.addEventListener("click", () => {
  const enabled = latest?.enabled === false;
  if (latest) {
    latest.enabled = enabled;
  }
  renderControls();
  port.postMessage({ type: "setEnabled", enabled });
});
siteButton.addEventListener("click", () => {
  if (!host) {
    return;
  }
  const paused = Boolean(latest?.pausedSites?.includes(host));
  if (latest) {
    const next = new Set(latest.pausedSites || []);
    if (paused) {
      next.delete(host);
    } else {
      next.add(host);
    }
    latest.pausedSites = [...next];
  }
  renderControls();
  port.postMessage({ type: "setSitePaused", host, paused: !paused });
});
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    host = new URL(tabs?.[0]?.url || "").hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    host = "";
  }
  renderControls();
});
document.querySelector("#dark-reader-off").addEventListener("click", async () => {
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
document.querySelector("#dark-reader-keep").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: false });
});
siteFixesInput.addEventListener("change", () => {
  port.postMessage({ type: "setSiteFixesAutoUpdate", enabled: siteFixesInput.checked });
});
document.querySelector("#legacy-dismiss").addEventListener("click", () => {
  port.postMessage({ type: "dismissLegacyNotice" });
});
