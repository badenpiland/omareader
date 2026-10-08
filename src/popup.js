// SPDX-License-Identifier: MIT
const enabledInput = document.querySelector("#enabled");
const themeNode = document.querySelector("#theme");
const statusNode = document.querySelector("#status");
const swatches = document.querySelector(".swatches");
const bg = document.querySelector("#bg");
const fg = document.querySelector("#fg");
const bgLabel = document.querySelector("#bg-label");
const fgLabel = document.querySelector("#fg-label");
const darkReader = document.querySelector("#dark-reader");

function render(state) {
  if (!state) {
    return;
  }
  enabledInput.checked = state.enabled !== false;
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
    document.body.style.color = palette.foreground;
    statusNode.style.color = palette.foreground;
  }
  statusNode.textContent = state.hostError || "";
  darkReader.hidden = !state.darkReaderPrompt;
}

const port = chrome.runtime.connect({ name: "client" });
port.onMessage.addListener(render);
enabledInput.addEventListener("change", () => {
  port.postMessage({ type: "setEnabled", enabled: enabledInput.checked });
});
document.querySelector("#dark-reader-off").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: true });
});
document.querySelector("#dark-reader-keep").addEventListener("click", () => {
  port.postMessage({ type: "darkReaderChoice", disable: false });
});
