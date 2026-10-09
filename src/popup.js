// SPDX-License-Identifier: MIT
import { REPO_URL } from "./update-notice.js";

const enabledInput = document.querySelector("#enabled");
const enabledLabel = document.querySelector("#enabled-label");
const siteHost = document.querySelector("#site-host");
const siteButton = document.querySelector("#site");
const themeNode = document.querySelector("#theme");
const statusNode = document.querySelector("#status");
const swatches = document.querySelector(".swatches");
const bg = document.querySelector("#bg");
const fg = document.querySelector("#fg");
const bgLabel = document.querySelector("#bg-label");
const fgLabel = document.querySelector("#fg-label");
const darkReader = document.querySelector("#dark-reader");
const siteFixesInput = document.querySelector("#site-fixes");
const updateNode = document.querySelector("#update");
const updateInstalled = document.querySelector("#update-installed");
const updateAvailable = document.querySelector("#update-available");
const darkReaderText = document.querySelector("#dark-reader-text");
const DARK_READER_KNOWN = "Dark Reader is also on. Both extensions restyle the page. Turn Dark Reader off?";
const DARK_READER_UNKNOWN = "If Dark Reader is also on, both restyle pages. Turn it off?";
let declineNote = "";
let latest = null;
let host = "";

function renderSite() {
  const paused = Boolean(host && latest?.pausedSites?.includes(host));
  siteHost.hidden = !host;
  siteButton.hidden = !host;
  if (!host) {
    return;
  }
  siteHost.textContent = host;
  siteButton.textContent = paused ? "Theme this site" : "Pause on this site";
}

function render(state) {
  if (!state) {
    return;
  }
  latest = state;
  enabledInput.checked = state.enabled !== false;
  enabledLabel.textContent = enabledInput.checked ? "On" : "Off";
  renderSite();
  const palette = state.palette;
  if (!palette?.background || !palette?.foreground) {
    themeNode.textContent = "Waiting for Omarchy";
    swatches.hidden = true;
  } else {
    const name = palette.theme || "current theme";
    themeNode.textContent = `${name} · ${palette.mode}`;
    swatches.hidden = false;
    bg.style.background = palette.background;
    fg.style.background = palette.foreground;
    bgLabel.textContent = palette.background;
    fgLabel.textContent = palette.foreground;
    document.body.style.background = palette.background;
    document.documentElement.style.setProperty("--popup-bg", palette.background);
    document.body.style.color = palette.foreground;
    statusNode.style.color = palette.foreground;
  }
  statusNode.textContent = state.hostError || declineNote;
  darkReader.hidden = !state.darkReaderPrompt;
  siteFixesInput.checked = state.siteFixesAutoUpdate !== false;
  const available = typeof state.updateVersion === "string" ? state.updateVersion : "";
  updateNode.hidden = available === "";
  updateInstalled.textContent = available ? `${chrome.runtime.getManifest().version} is installed. ` : "";
  updateAvailable.textContent = available;
  if (available) {
    updateAvailable.href = REPO_URL;
  } else {
    updateAvailable.removeAttribute("href");
  }
  if (state.darkReaderPrompt) {
    darkReaderText.textContent = state.darkReaderKnown ? DARK_READER_KNOWN : DARK_READER_UNKNOWN;
  }
}

const port = chrome.runtime.connect({ name: "client" });
port.onMessage.addListener(render);
enabledInput.addEventListener("change", () => {
  enabledLabel.textContent = enabledInput.checked ? "On" : "Off";
  port.postMessage({ type: "setEnabled", enabled: enabledInput.checked });
});
siteButton.addEventListener("click", () => {
  if (!host) {
    return;
  }
  const paused = Boolean(latest?.pausedSites?.includes(host));
  port.postMessage({ type: "setSitePaused", host, paused: !paused });
});
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    host = new URL(tabs?.[0]?.url || "").hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    host = "";
  }
  renderSite();
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
