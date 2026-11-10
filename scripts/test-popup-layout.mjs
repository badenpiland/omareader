import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const popupCss = readFileSync(join(root, "src/popup.css"), "utf8");
const popupHtml = readFileSync(join(root, "src/popup.html"), "utf8");

function ruleBody(css, selector) {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

const keysRule = ruleBody(popupCss, String.raw`\.keys`);
assert.match(keysRule, /display:\s*flex/, "shortcut row stays in the layout");
assert.match(keysRule, /visibility:\s*hidden/, "shortcut row is hidden without leaving the layout");
assert.doesNotMatch(keysRule, /display:\s*none/);

const revealRule = ruleBody(popupCss, String.raw`\.ctrl:hover \.keys,\s*\.ctrl:focus-within \.keys`);
assert.match(revealRule, /visibility:\s*visible/);
assert.doesNotMatch(revealRule, /display\s*:/);
assert.doesNotMatch(revealRule, /height\s*:/);
assert.doesNotMatch(revealRule, /margin\s*:/);
assert.doesNotMatch(revealRule, /padding\s*:/);
assert.doesNotMatch(revealRule, /position\s*:/);
assert.match(popupHtml, /<kbd>alt<\/kbd><span>\+<\/span><kbd>shift<\/kbd><span>\+<\/span><kbd>o<\/kbd>/);
assert.match(popupHtml, /<kbd>alt<\/kbd><span>\+<\/span><kbd>shift<\/kbd><span>\+<\/span><kbd>u<\/kbd>/);

const popupPage = popupHtml
  .replace('<script type="module" src="popup.js"></script>', "")
  .replace('id="site-ctrl" class="ctrl" hidden', 'id="site-ctrl" class="ctrl"');
assert.equal(popupPage.includes("popup.js"), false);
assert.equal(popupPage.includes('id="site-ctrl" class="ctrl" hidden'), false);

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    const found = spawnSync("which", [candidate], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) {
      return found.stdout.trim();
    }
  }
  return "";
}

function assertSameBox(before, after, label) {
  for (const edge of ["x", "y", "width", "height"]) {
    const delta = Math.abs(before[edge] - after[edge]);
    assert.ok(
      delta < 0.5,
      `${label} ${edge} moved by ${delta} (${before[edge]} -> ${after[edge]})`,
    );
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const nextFrame = "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

const measureExpression = `(() => {
  const box = (selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const keys = (selector) => {
    const node = document.querySelector(selector);
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      visibility: style.visibility,
      display: style.display,
      text: node.textContent.replace(/\\s/g, ""),
      width: rect.width,
      height: rect.height,
    };
  };
  return {
    enabled: box("#enabled"),
    site: box("#site"),
    enabledKeys: keys("#enabled-ctrl .keys"),
    siteKeys: keys("#site-ctrl .keys"),
    pageHeight: document.documentElement.scrollHeight,
  };
})()`;

async function openTab(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) {
    response = await fetch(endpoint);
  }
  if (!response.ok) {
    throw new Error(`unable to open the popup page: ${response.status}`);
  }
  return response.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("devtools socket failed")), { once: true });
  });
  ws.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : event.data.toString();
    const message = JSON.parse(data);
    if (message.method) {
      for (const listener of listeners.get(message.method) || []) {
        listener(message.params || {});
      }
    }
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) {
      waiter.reject(new Error(message.error.message || "devtools call failed"));
    } else {
      waiter.resolve(message.result);
    }
  });
  return {
    async send(method, params = {}) {
      await opened;
      const callId = ++id;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`${method} timed out`));
        }, 8000);
        pending.set(callId, { resolve, reject, timer });
      });
      ws.send(JSON.stringify({ id: callId, method, params }));
      return result;
    },
    once(method) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.get(method)?.delete(listener);
          reject(new Error(`${method} timed out`));
        }, 8000);
        const listener = (params) => {
          clearTimeout(timer);
          listeners.get(method)?.delete(listener);
          resolve(params);
        };
        if (!listeners.has(method)) {
          listeners.set(method, new Set());
        }
        listeners.get(method).add(listener);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "popup page failed");
  }
  return result.result.value;
}

async function measurePopup(chromeBin) {
  const font = readFileSync(join(root, "src/omarchy-font.ttf"));
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/popup.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(popupCss);
      return;
    }
    if (path === "/omarchy-font.ttf") {
      response.setHeader("content-type", "font/ttf");
      response.end(font);
      return;
    }
    if (path === "/" || path === "/popup.html") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(popupPage);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const pagePort = await listen(server);
  const userDataDir = mkdtempSync(join(tmpdir(), "omareader-popup-"));
  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let chromeLog = "";
  const note = (chunk) => {
    chromeLog += chunk;
  };
  chrome.stdout.on("data", note);
  chrome.stderr.on("data", note);
  const stopChrome = () => {
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // The profile is only a scratch directory for this run.
    }
  };

  try {
    const debugPort = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`chrome did not start\n${chromeLog}`)), 10000);
      const watch = () => {
        const match = chromeLog.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (!match) {
          return;
        }
        clearTimeout(timer);
        chrome.stdout.off("data", watch);
        chrome.stderr.off("data", watch);
        resolve(Number(match[1]));
      };
      chrome.stdout.on("data", watch);
      chrome.stderr.on("data", watch);
      chrome.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`chrome exited ${code}\n${chromeLog}`));
      });
    });
    const tab = await openTab(debugPort, `http://127.0.0.1:${pagePort}/popup.html`);
    const cdp = connect(tab.webSocketDebuggerUrl);
    const send = cdp.send.bind(cdp);
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 400,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const loaded = cdp.once("Page.loadEventFired");
    await send("Page.reload", { ignoreCache: true });
    await loaded;
    await evaluate(send, "document.fonts.ready");
    await evaluate(send, nextFrame);

    const before = await evaluate(send, measureExpression);
    assert.ok(before.enabled.width > 200 && before.enabled.height > 20, "enabled button has a box");
    assert.ok(before.site.width > 200 && before.site.height > 20, "site button has a box");
    assert.equal(before.enabledKeys.display, "flex");
    assert.equal(before.siteKeys.display, "flex");
    assert.equal(before.enabledKeys.visibility, "hidden");
    assert.equal(before.siteKeys.visibility, "hidden");
    assert.equal(before.enabledKeys.text, "alt+shift+o");
    assert.equal(before.siteKeys.text, "alt+shift+u");
    assert.ok(before.enabledKeys.height > 8, "enabled shortcut reserves height");
    assert.ok(before.siteKeys.height > 8, "site shortcut reserves height");
    assert.ok(before.enabledKeys.width > 40, "enabled shortcut reserves width");

    const point = {
      x: before.enabled.x + before.enabled.width / 2,
      y: before.enabled.y + before.enabled.height - 1,
    };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await evaluate(send, nextFrame);
    const hovered = await evaluate(send, measureExpression);
    assert.equal(hovered.enabledKeys.visibility, "visible");
    assert.equal(hovered.siteKeys.visibility, "hidden");
    assert.ok(hovered.enabledKeys.width > 40, "shortcut is readable on hover");
    assert.equal(hovered.pageHeight, before.pageHeight, "hover resized the popup");
    assertSameBox(before.enabled, hovered.enabled, "enabled button");
    assertSameBox(before.site, hovered.site, "site button");
    const hit = await evaluate(
      send,
      `document.elementFromPoint(${point.x}, ${point.y})?.closest("button")?.id || ""`,
    );
    assert.equal(hit, "enabled", "hover moved the enabled button off the pointer");

    const sitePoint = {
      x: before.site.x + before.site.width / 2,
      y: before.site.y + before.site.height - 1,
    };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sitePoint.x, y: sitePoint.y });
    await evaluate(send, nextFrame);
    const siteHovered = await evaluate(send, measureExpression);
    assert.equal(siteHovered.siteKeys.visibility, "visible");
    assert.equal(siteHovered.enabledKeys.visibility, "hidden");
    assert.equal(siteHovered.pageHeight, before.pageHeight, "hover resized the popup");
    assertSameBox(before.enabled, siteHovered.enabled, "enabled button");
    assertSameBox(before.site, siteHovered.site, "site button");
    const siteHit = await evaluate(
      send,
      `document.elementFromPoint(${sitePoint.x}, ${sitePoint.y})?.closest("button")?.id || ""`,
    );
    assert.equal(siteHit, "site", "hover moved the site button off the pointer");

    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await evaluate(send, 'document.querySelector("#enabled").focus()');
    await evaluate(send, nextFrame);
    const focused = await evaluate(send, measureExpression);
    assert.equal(focused.enabledKeys.visibility, "visible");
    assert.equal(focused.siteKeys.visibility, "hidden");
    assert.equal(focused.pageHeight, before.pageHeight, "focus resized the popup");
    assertSameBox(before.enabled, focused.enabled, "enabled button");
    assertSameBox(before.site, focused.site, "site button");
    cdp.close();
  } finally {
    server.close();
    stopChrome();
  }
}

const chromeBin = findChrome();
if (!chromeBin) {
  console.log("popup layout checked (geometry skipped; chrome not found)");
} else {
  await measurePopup(chromeBin);
  console.log("popup layout checked");
}
