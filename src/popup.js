// SPDX-License-Identifier: MIT
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
  statusNode.textContent = state.hostError || "";
  darkReader.hidden = !state.darkReaderPrompt;
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
document.querySelector("#dark-reader-off").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: true });
});
document.querySelector("#dark-reader-keep").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: false });
});
