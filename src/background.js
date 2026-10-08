// SPDX-License-Identifier: MIT
const HOST = "com.bhp.omareader";
const DARK_READER_ID = "eimadpbcbfnmbkopoojfekhnkhdbieeh";

const clients = new Set();
let nativePort = null;
let palette = null;
let enabled = true;
let hostError = "";
let reconnectTimer = null;
let darkReaderPrompt = false;

function snapshot() {
  return { type: "state", enabled, palette, hostError, darkReaderPrompt };
}

globalThis.omareaderSnapshot = snapshot;

function broadcast() {
  const message = snapshot();
  for (const port of clients) {
    try {
      port.postMessage(message);
    } catch {
      clients.delete(port);
    }
  }
}

function applyIcon() {
  const mode = palette?.mode === "light" ? "light" : palette?.mode === "dark" ? "dark" : "";
  if (!mode) {
    return;
  }
  const path = {};
  for (const size of [16, 32, 48, 128]) {
    path[size] = `icon-${mode}-${size}.png`;
  }
  chrome.action.setIcon({ path });
}

function rememberPalette(next) {
  palette = {
    theme: next.theme || "",
    mode: next.mode === "light" ? "light" : "dark",
    background: next.background,
    foreground: next.foreground,
    selection: next.selection || "",
  };
  chrome.storage.local.set({ palette });
  applyIcon();
  broadcast();
}

function connectHost() {
  if (nativePort) {
    return;
  }
  let port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (error) {
    hostError = error instanceof Error ? error.message : String(error);
    scheduleReconnect();
    broadcast();
    return;
  }
  nativePort = port;
  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "error") {
      hostError = message.message || "Omarchy theme is unreadable";
      broadcast();
      return;
    }
    if (message.type === "palette" && message.background && message.foreground) {
      hostError = "";
      rememberPalette(message);
    }
  });
  port.onDisconnect.addListener(() => {
    nativePort = null;
    hostError = chrome.runtime.lastError?.message || "Theme host disconnected";
    broadcast();
    scheduleReconnect();
  });
  try {
    port.postMessage({ type: "hello" });
  } catch {
    nativePort = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectHost();
  }, 1000);
}

function setEnabled(value) {
  enabled = Boolean(value);
  chrome.storage.local.set({ enabled });
  broadcast();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "client") {
    return;
  }
  clients.add(port);
  port.onDisconnect.addListener(() => clients.delete(port));
  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "getState") {
      port.postMessage(snapshot());
    } else if (message.type === "setEnabled") {
      setEnabled(message.enabled);
    } else if (message.type === "darkReaderChoice") {
      resolveDarkReader(Boolean(message.disable));
    }
  });
  port.postMessage(snapshot());
  if (!nativePort) {
    connectHost();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "getState") {
    sendResponse(snapshot());
    return;
  }
  if (message.type === "setEnabled") {
    setEnabled(message.enabled);
    sendResponse(snapshot());
    return;
  }
  if (message.type === "darkReaderChoice") {
    resolveDarkReader(Boolean(message.disable));
    sendResponse(snapshot());
  }
});

chrome.alarms.onAlarm.addListener(() => {
  if (!nativePort) {
    connectHost();
  }
});

function resolveDarkReader(disable) {
  darkReaderPrompt = false;
  chrome.action.setBadgeText({ text: "" });
  if (disable) {
    chrome.management.setEnabled(DARK_READER_ID, false, () => {
      void chrome.runtime.lastError;
    });
  }
  chrome.storage.local.set({ darkReaderChoice: disable ? "off" : "keep" });
  broadcast();
}

async function considerDarkReader(stored) {
  // darkReaderOffered is the previous release, which turned Dark Reader off
  // without asking. Don't ask those installs again.
  if (stored.darkReaderChoice || stored.darkReaderOffered) {
    return;
  }
  let info;
  try {
    info = await chrome.management.get(DARK_READER_ID);
  } catch {
    return;
  }
  if (!info?.enabled) {
    return;
  }
  darkReaderPrompt = true;
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#9ECE6A" });
}

async function start() {
  const stored = await chrome.storage.local.get({
    enabled: true,
    palette: null,
    darkReaderChoice: "",
    darkReaderOffered: false,
  });
  enabled = stored.enabled !== false;
  palette = stored.palette;
  applyIcon();
  await considerDarkReader(stored);
  chrome.alarms.create("reconnect", { periodInMinutes: 1 });
  connectHost();
  broadcast();
}

start();
