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

// The mode rows never wrap, and the version line sits beside the wordmark.
const buttonRule = ruleBody(popupCss, String.raw`\.modes button`);
assert.match(buttonRule, /flex:\s*1/);
const updateRule = ruleBody(popupCss, String.raw`#update`);
assert.match(updateRule, /white-space:\s*nowrap/);
assert.match(updateRule, /margin-left:\s*auto/);
assert.match(popupHtml, /<header>[\s\S]*<h1>omareader<\/h1>[\s\S]*<p id="update">/);

// The page is measured without popup.js. The longest version line the popup
// can show is filled in by hand, along with a long site name.
const popupPage = popupHtml
  .replace('<script type="module" src="popup.js"></script>', "")
  .replace('<span id="update-installed"></span>', '<span id="update-installed">v0.9.1 · </span>')
  .replace('<a id="update-available" hidden', '<a id="update-available"')
  .replace('rel="noreferrer"></a>', 'rel="noreferrer">get v0.10.0</a>')
  .replace(">Not available on this page<", ">a-very-long-subdomain.of-a-long-site.example.com<");
assert.equal(popupPage.includes("popup.js"), false);
assert.equal(popupPage.includes("get v0.10.0"), true);

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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const nextFrame = "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

const measureExpression = `(() => {
  const box = (node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
  };
  const lineHeight = (node) => parseFloat(getComputedStyle(node).lineHeight) || 0;
  const header = document.querySelector("header");
  return {
    width: Math.max(...[...document.body.querySelectorAll("*")].map((node) => node.getBoundingClientRect().right)),
    bodyWidth: document.body.getBoundingClientRect().width,
    header: box(header),
    title: box(document.querySelector("h1")),
    update: box(document.querySelector("#update")),
    updateClipped: document.querySelector("#update").scrollWidth > document.querySelector("#update").clientWidth,
    updateLine: lineHeight(document.querySelector("#update")),
    buttons: [...document.querySelectorAll(".modes button")].map((node) => ({
      text: node.textContent,
      height: node.getBoundingClientRect().height,
      scroll: node.scrollWidth,
      client: node.clientWidth,
    })),
    site: box(document.querySelector("#site")),
    siteLabel: box(document.querySelector("#site").parentElement),
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

    const layout = await evaluate(send, measureExpression);
    assert.equal(layout.bodyWidth, 320, "popup is 320px wide");
    assert.ok(layout.width <= 320, `popup scrolls sideways (${layout.width}px)`);
    assert.ok(layout.update.left >= layout.title.right, "version line overlaps the wordmark");
    assert.ok(layout.update.right <= layout.header.right, "version line runs past the header");
    assert.ok(layout.update.height <= layout.updateLine * 1.5, "version line wraps");
    assert.equal(layout.updateClipped, false, "version line is cut off");
    assert.equal(layout.buttons.length, 7, "three modes for all sites, four for this site");
    const rowHeight = layout.buttons[0].height;
    for (const button of layout.buttons) {
      assert.ok(Math.abs(button.height - rowHeight) < 0.5, `${button.text} wraps onto a second line`);
      assert.ok(button.scroll <= button.client, `${button.text} is clipped`);
    }
    assert.ok(layout.site.right <= layout.siteLabel.right, "a long site name runs past its row");
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
