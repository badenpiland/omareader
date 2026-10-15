// SPDX-License-Identifier: MIT
const siteFixesInput = document.querySelector("#site-fixes");

function applyPalette(palette) {
  const root = document.documentElement;
  if (!palette?.background || !palette?.foreground) {
    root.style.removeProperty("--popup-bg");
    root.style.removeProperty("--popup-fg");
    root.style.colorScheme = "";
    return;
  }
  root.style.setProperty("--popup-bg", palette.background);
  root.style.setProperty("--popup-fg", palette.foreground);
  root.style.colorScheme = palette.mode === "light" ? "light" : "dark";
}

function render(state) {
  if (!state) {
    return;
  }
  applyPalette(state.palette);
  siteFixesInput.checked = state.siteFixesAutoUpdate !== false;
}

const port = chrome.runtime.connect({ name: "client" });
port.onMessage.addListener(render);
siteFixesInput.addEventListener("change", () => {
  port.postMessage({ type: "setSiteFixesAutoUpdate", enabled: siteFixesInput.checked });
});
