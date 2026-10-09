// SPDX-License-Identifier: MIT
import { acceptSiteFixes, fixesAutoUpdateEnabled, fixesFor, SITE_FIXES_URL, trustedFixesUrl } from "./site-fixes.js";
import { RECONNECT_MIN_MS, nextDelay } from "./reconnect-delay.js";
import { fromExtensionPage } from "./extension-page.js";

const HOST = "com.bhp.omareader";
const EXTENSION_ORIGIN = chrome.runtime.getURL("");
const DARK_READER_ID = "eimadpbcbfnmbkopoojfekhnkhdbieeh";
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 6 * 60 * 60 * 1000;

const clients = new Set();
const pageUrls = new WeakMap();
let nativePort = null;
let palette = null;
let enabled = true;
let pausedSites = [];
let hostError = "";
let reconnectTimer = null;
let reconnectDelay = RECONNECT_MIN_MS;
let darkReaderPrompt = false;
let darkReaderKnown = false;
let sites = null;
let fixesText = "";
let siteFixesAutoUpdate = true;
let refreshTask = null;

function snapshot() {
  return {
    type: "state",
    enabled,
    pausedSites,
    palette,
    hostError,
    darkReaderPrompt,
    darkReaderKnown,
    siteFixesAutoUpdate,
  };
}

globalThis.omareaderSnapshot = snapshot;

function pageUrl(port) {
  return pageUrls.get(port) || port.sender?.url || "";
}

function messageFor(port) {
  const message = snapshot();
  const url = pageUrl(port);
  if (port.sender?.tab && sites && url) {
    message.siteFix = fixesFor(url, sites);
  }
  return message;
}

function postTo(port) {
  try {
    port.postMessage(messageFor(port));
  } catch {
    clients.delete(port);
  }
}

function broadcast() {
  for (const port of clients) {
    postTo(port);
  }
}

function applyFixesText(text) {
  const next = acceptSiteFixes(text);
  const changed = text !== fixesText;
  sites = next;
  fixesText = text;
  return changed;
}

function fixesDue(stored, now) {
  const fetchedAt = Number(stored.siteFixesFetchedAt) || 0;
  const attemptAt = Number(stored.siteFixesAttemptAt) || 0;
  if (!fetchedAt) {
    return now - attemptAt >= RETRY_MS;
  }
  return now - fetchedAt >= DAY_MS && now - attemptAt >= RETRY_MS;
}

async function bundledFixesText() {
  const response = await fetch(chrome.runtime.getURL("dynamic-theme-fixes.config"));
  if (!response.ok) {
    throw new Error("Bundled site fixes are unreadable");
  }
  return response.text();
}

async function loadFixes() {
  const stored = await chrome.storage.local.get({
    siteFixesText: "",
    siteFixesFetchedAt: 0,
    siteFixesAttemptAt: 0,
    siteFixesAutoUpdate: true,
  });
  siteFixesAutoUpdate = fixesAutoUpdateEnabled(stored);
  let applied = false;
  try {
    applyFixesText(stored.siteFixesText);
    applied = true;
  } catch {
    applied = false;
  }
  if (!applied) {
    try {
      applyFixesText(await bundledFixesText());
    } catch {
      sites = null;
      fixesText = "";
    }
  }
  if (fixesDue(stored, Date.now())) {
    void refreshFixes();
  }
}

const MAX_SITE_FIX_BYTES = 3 * 1024 * 1024;

async function readCappedText(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SITE_FIX_BYTES) {
    throw new Error("Site fixes are empty or too large");
  }
  if (!response.body) {
    return response.text();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_SITE_FIX_BYTES) {
        throw new Error("Site fixes are empty or too large");
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The body is already finished or already cancelled.
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function refreshFixes() {
  if (refreshTask) {
    return refreshTask;
  }
  refreshTask = (async () => {
    const attemptAt = Date.now();
    try {
      const stored = await chrome.storage.local.get({
        siteFixesFetchedAt: 0,
        siteFixesAttemptAt: 0,
        siteFixesAutoUpdate: true,
      });
      siteFixesAutoUpdate = fixesAutoUpdateEnabled(stored);
      if (!siteFixesAutoUpdate || !fixesDue(stored, attemptAt)) {
        return;
      }
      await chrome.storage.local.set({ siteFixesAttemptAt: attemptAt });
      const response = await fetch(SITE_FIXES_URL, { cache: "no-store", redirect: "follow" });
      if (!response.ok || !trustedFixesUrl(response.url)) {
        throw new Error("Site-fix download was rejected");
      }
      const text = await readCappedText(response);
      const changed = applyFixesText(text);
      await chrome.storage.local.set({
        siteFixesText: text,
        siteFixesFetchedAt: Date.now(),
        siteFixesAttemptAt: attemptAt,
      });
      if (changed) {
        broadcast();
      }
    } catch {
      try {
        await chrome.storage.local.set({ siteFixesAttemptAt: attemptAt });
      } catch {
        // The list already in memory stays. The next due check will try again.
      }
    } finally {
      refreshTask = null;
    }
  })();
  return refreshTask;
}

function normalizeHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || /[\s/]/.test(host)) {
    return "";
  }
  return host;
}

function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

// Dark glasses while this tab is themed. Light glasses when Omareader is off,
// or when this site is paused.
function iconMode(host) {
  if (!enabled || (host && pausedSites.includes(host))) {
    return "light";
  }
  return "dark";
}

function iconPaths(mode) {
  const path = {};
  for (const size of [16, 32, 48, 128]) {
    path[size] = `icon-${mode}-${size}.png`;
  }
  return path;
}

function applyIcon(tabId, url) {
  const path = iconPaths(iconMode(typeof url === "string" ? hostFromUrl(url) : ""));
  if (typeof tabId === "number") {
    chrome.action.setIcon({ tabId, path });
    return;
  }
  chrome.action.setIcon({ path });
}

function applyAllIcons() {
  applyIcon();
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs)) {
      return;
    }
    for (const tab of tabs) {
      if (typeof tab.id === "number") {
        applyIcon(tab.id, tab.url);
      }
    }
  });
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
  chrome.storage.session.set({ palette });
  applyIcon();
  broadcast();
}

const EARLY_ID = "omareader-early";

async function syncEarlyCss() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [EARLY_ID] });
  } catch {
    // The early sheet is not registered yet.
  }
  if (!enabled) {
    return;
  }
  const script = {
    id: EARLY_ID,
    matches: ["<all_urls>"],
    css: ["early.css"],
    runAt: "document_start",
    allFrames: true,
  };
  const excludeMatches = pausedSites.map((host) => `*://${host}/*`);
  if (excludeMatches.length) {
    script.excludeMatches = excludeMatches;
  }
  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch {
    // A bad paused host must not stop the rest of the worker.
  }
}

function connectHost() {
  if (nativePort) {
    return;
  }
  let port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hostError = /not found/i.test(message)
      ? "Theme host not installed — run ./install.sh"
      : message;
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
      reconnectDelay = RECONNECT_MIN_MS;
      rememberPalette(message);
    }
  });
  port.onDisconnect.addListener(() => {
    nativePort = null;
    const message = chrome.runtime.lastError?.message || "";
    hostError = /not found/i.test(message)
      ? "Theme host not installed — run ./install.sh"
      : message || "Theme host disconnected";
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
  const step = nextDelay(reconnectDelay);
  reconnectDelay = step.next;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectHost();
  }, step.delay);
}

function setSiteFixesAutoUpdate(enabled) {
  siteFixesAutoUpdate = enabled !== false;
  chrome.storage.local.set({ siteFixesAutoUpdate });
  broadcast();
  if (siteFixesAutoUpdate) {
    void refreshFixes();
  }
}

function setEnabled(value) {
  enabled = Boolean(value);
  chrome.storage.local.set({ enabled });
  applyAllIcons();
  broadcast();
  void syncEarlyCss();
}

function setSitePaused(host, paused) {
  host = normalizeHost(host);
  if (!host) {
    return;
  }
  const next = new Set(pausedSites);
  if (paused) {
    next.add(host);
  } else {
    next.delete(host);
  }
  pausedSites = [...next].sort();
  chrome.storage.local.set({ pausedSites });
  applyAllIcons();
  broadcast();
  void syncEarlyCss();
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
      if (typeof message.url === "string") {
        pageUrls.set(port, message.url);
      }
      postTo(port);
      return;
    }
    // Content scripts share the "client" port name. Only extension pages may change settings.
    if (!fromExtensionPage(port.sender, EXTENSION_ORIGIN)) {
      return;
    }
    if (message.type === "setEnabled") {
      setEnabled(message.enabled);
    } else if (message.type === "setSitePaused") {
      setSitePaused(message.host, Boolean(message.paused));
    } else if (message.type === "darkReaderChoice") {
      void resolveDarkReader(Boolean(message.disable));
    } else if (message.type === "setSiteFixesAutoUpdate") {
      setSiteFixesAutoUpdate(message.enabled);
    }
  });
  postTo(port);
  if (!nativePort) {
    connectHost();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "site-fixes") {
    void refreshFixes();
    return;
  }
  // A pending backoff timer already covers this wake. Don't start a second attempt.
  if (alarm.name === "reconnect" && !nativePort && !reconnectTimer) {
    connectHost();
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle") {
    setEnabled(!enabled);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      return;
    }
    applyIcon(tab.id, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    applyIcon(tabId, tab.url);
  }
});

function showDarkReaderPrompt(known) {
  darkReaderPrompt = true;
  darkReaderKnown = known;
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#9ECE6A" });
}

async function managementGranted() {
  try {
    return await chrome.permissions.contains({ permissions: ["management"] });
  } catch {
    return false;
  }
}

async function resolveDarkReader(disable) {
  darkReaderPrompt = false;
  darkReaderKnown = false;
  chrome.action.setBadgeText({ text: "" });
  // A missing permission means keep. Do not call management without it.
  const granted = disable ? await managementGranted() : false;
  if (granted) {
    chrome.management.setEnabled(DARK_READER_ID, false, () => {
      void chrome.runtime.lastError;
    });
  }
  chrome.storage.local.set({ darkReaderChoice: disable && granted ? "off" : "keep" });
  broadcast();
}

async function considerDarkReader(stored) {
  // darkReaderOffered is the previous release, which turned Dark Reader off
  // without asking. Don't ask those installs again.
  if (stored.darkReaderChoice || stored.darkReaderOffered) {
    return;
  }
  if (!(await managementGranted())) {
    showDarkReaderPrompt(false);
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
  showDarkReaderPrompt(true);
}

async function start() {
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  } catch {
    // Content scripts then wait for the port.
  }
  const stored = await chrome.storage.local.get({
    enabled: true,
    pausedSites: [],
    palette: null,
    darkReaderChoice: "",
    darkReaderOffered: false,
  });
  enabled = stored.enabled !== false;
  pausedSites = Array.isArray(stored.pausedSites)
    ? stored.pausedSites.map(normalizeHost).filter(Boolean)
    : [];
  palette = stored.palette;
  if (palette?.background && palette?.foreground) {
    chrome.storage.session.set({ palette });
  }
  await loadFixes();
  applyAllIcons();
  await considerDarkReader(stored);
  chrome.alarms.create("reconnect", { periodInMinutes: 1 });
  // Recreating this alarm on every wake would push the daily check out forever.
  if (!(await chrome.alarms.get("site-fixes"))) {
    chrome.alarms.create("site-fixes", { periodInMinutes: 24 * 60 });
  }
  await syncEarlyCss();
  connectHost();
  broadcast();
}

start();
