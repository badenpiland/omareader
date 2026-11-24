// SPDX-License-Identifier: MIT
import { updateLine } from "./update-notice.js";
import { fontFaceRule, fontStack } from "./font.js";

const enabledButton = document.querySelector("#enabled");
const enabledLabel = document.querySelector("#enabled-label");
const siteButton = document.querySelector("#site");
const siteCtrl = document.querySelector("#site-ctrl");
const siteLabel = document.querySelector("#site-label");
const themeNode = document.querySelector("#theme");
const statusNode = document.querySelector("#status");
const logo = document.querySelector("#logo");
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

// Both switches name what a click does. A muted switch is one that is off.
function renderControls() {
  const enabled = latest?.enabled !== false;
  const paused = Boolean(host && latest?.pausedSites?.includes(host));
  enabledLabel.textContent = enabled ? "disable everywhere" : "enable everywhere";
  enabledButton.classList.toggle("muted", !enabled);
  siteCtrl.hidden = !host;
  siteLabel.textContent = paused ? "enable this site" : "disable this site";
  siteButton.classList.toggle("muted", Boolean(host) && (!enabled || paused));
  siteButton.title = host;
}

function applyPalette(palette) {
  const root = document.documentElement;
  // The logo matches the theme: light glasses on a light theme, dark glasses otherwise.
  logo.src = palette?.mode === "light" ? "icon-light.svg" : "icon-dark.svg";
  if (!palette?.background || !palette?.foreground) {
    themeNode.textContent = "Waiting for Omarchy";
    root.style.removeProperty("--popup-bg");
    root.style.removeProperty("--popup-fg");
    root.style.colorScheme = "";
    return;
  }
  themeNode.textContent = palette.theme || "current theme";
  root.style.setProperty("--popup-bg", palette.background);
  root.style.setProperty("--popup-fg", palette.foreground);
  root.style.colorScheme = palette.mode === "light" ? "light" : "dark";
}

// The Omarchy font, loaded by face name so a change shows while the browser runs.
const fontFaceStyle = document.createElement("style");
document.head.append(fontFaceStyle);

function applyFont(family, faces) {
  const css = fontFaceRule(faces).css;
  if (fontFaceStyle.textContent !== css) {
    fontFaceStyle.textContent = css;
  }
  document.documentElement.style.setProperty("--font", fontStack(family, faces));
}

function render(state) {
  if (!state) {
    return;
  }
  latest = state;
  renderControls();
  applyFont(state.font, state.fontFaces);
  applyPalette(state.palette);
  const note = state.hostError || declineNote;
  statusNode.textContent = note;
  statusNode.hidden = note === "";
  darkReader.hidden = !state.darkReaderPrompt;
  siteFixesInput.checked = state.siteFixesAutoUpdate !== false;
  applyUpdate(state.updateVersion, state.updateChecked);
  if (state.darkReaderPrompt) {
    darkReaderText.textContent = state.darkReaderKnown ? DARK_READER_KNOWN : DARK_READER_UNKNOWN;
  }
}

// The version line is short: "v0.3.1 ✓" once a check finds nothing newer, and
// "v0.3.1 → v0.4.0" linking a newer release. The full wording is the tooltip.
function applyUpdate(available, checked) {
  const line = updateLine(chrome.runtime.getManifest().version, available, checked);
  const upToDate = / · Up to date$/.test(line.installed);
  updateInstalled.textContent = line.installed.replace(/ · Up to date$/, " ✓").replace(/ · $/, " → ");
  updateInstalled.title = upToDate ? line.installed : "";
  updateAvailable.hidden = line.available === "";
  updateAvailable.textContent = line.available.replace(/^Update to /, "");
  if (line.href) {
    updateAvailable.href = line.href;
    updateAvailable.title = line.available;
  } else {
    updateAvailable.removeAttribute("href");
    updateAvailable.removeAttribute("title");
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
