const HOST = "com.bhp.omareader";
const DARK_READER_ID = "eimadpbcbfnmbkopoojfekhnkhdbieeh";

const clients = new Set();
let nativePort = null;
let palette = null;
let enabled = true;
let hostError = "";
let reconnectTimer = null;

function snapshot() {
  return { type: "state", enabled, palette, hostError };
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
  }
});

chrome.alarms.onAlarm.addListener(() => {
  if (!nativePort) {
    connectHost();
  }
});

async function start() {
  const stored = await chrome.storage.local.get({
    enabled: true,
    palette: null,
    darkReaderOffered: false,
  });
  enabled = stored.enabled !== false;
  palette = stored.palette;
  applyIcon();
  if (!stored.darkReaderOffered) {
    chrome.management.setEnabled(DARK_READER_ID, false, () => {
      void chrome.runtime.lastError;
      chrome.storage.local.set({ darkReaderOffered: true });
    });
  }
  chrome.alarms.create("reconnect", { periodInMinutes: 1 });
  connectHost();
  broadcast();
}

start();
