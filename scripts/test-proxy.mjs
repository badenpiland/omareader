import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { consumeProxySignal, PROXY_ATTRIBUTE, PROXY_EVENT, readProxyFlags, watchProxyDocument } from "../src/page-proxy-install.js";
import { extractInjectProxy, replaceInlineProxy } from "./proxy-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const darkReader = readFileSync(join(root, "node_modules/darkreader/darkreader.mjs"), "utf8");
const proxy = extractInjectProxy(darkReader);
const injectProxy = new Function(`${proxy}\nreturn injectProxy;`)();
assert.equal(typeof injectProxy, "function");
assert.equal(injectProxy.length, 2);
assert.equal(proxy.includes("createElement"), false);

const patched = replaceInlineProxy(darkReader);
assert.equal(patched.includes('createOrUpdateScript("darkreader--proxy")'), false);
assert.equal(patched.includes("proxyScript.append"), false);
assert.match(patched, /data-omareader-proxy/);
assert.match(patched, /__omareader__installProxy/);
assert.equal(patched.includes("export {auto, disable, enable"), true);
assert.throws(() => replaceInlineProxy("no proxy here"), /inline proxy injection was not found/);

assert.deepEqual(readProxyFlags("[true,true]"), [true, true]);
assert.deepEqual(readProxyFlags("[true, false]"), [true, false]);
assert.deepEqual(readProxyFlags("[false,true]"), [false, true]);
assert.equal(readProxyFlags("[1,true]"), null);
assert.equal(readProxyFlags("true"), null);
assert.equal(readProxyFlags(""), null);
assert.equal(readProxyFlags("[" + "true,".repeat(20) + "true]"), null);

function element(value) {
  const attrs = new Map();
  if (value != null) {
    attrs.set(PROXY_ATTRIBUTE, value);
  }
  return {
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    setAttribute(name, next) {
      attrs.set(name, String(next));
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
  };
}

const calls = [];
const rootEl = element("[false,true]");
assert.equal(consumeProxySignal(rootEl, (sheets, customElements) => calls.push([sheets, customElements])), true);
assert.deepEqual(calls, [[false, true]]);
assert.equal(rootEl.getAttribute(PROXY_ATTRIBUTE), null);
assert.equal(consumeProxySignal(rootEl, () => calls.push("again")), false);
assert.equal(calls.length, 1);

const junk = element("not-json");
assert.equal(consumeProxySignal(junk, () => calls.push("junk")), false);
assert.equal(junk.getAttribute(PROXY_ATTRIBUTE), null);

const seen = [];
const listeners = new Map();
const observed = [];
class FakeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(node, options) {
    observed.push({ node, options });
  }
  disconnect() {
    this.disconnected = true;
  }
}
const previousObserver = globalThis.MutationObserver;
globalThis.MutationObserver = FakeObserver;
try {
  const doc = {
    documentElement: element(null),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  watchProxyDocument(doc, (sheets, customElements) => seen.push([sheets, customElements]));
  assert.equal(typeof listeners.get(PROXY_EVENT), "function");
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].options.attributeFilter, [PROXY_ATTRIBUTE]);
  doc.documentElement.setAttribute(PROXY_ATTRIBUTE, "[true,false]");
  listeners.get(PROXY_EVENT)();
  assert.deepEqual(seen, [[true, false]]);
  assert.equal(doc.documentElement.getAttribute(PROXY_ATTRIBUTE), null);
} finally {
  globalThis.MutationObserver = previousObserver;
}

const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8"));
assert.equal(JSON.stringify(manifest).includes("unsafe-inline"), false);
assert.equal(manifest.content_scripts.length, 2);
assert.deepEqual(manifest.content_scripts[0].js, ["page-proxy.js"]);
assert.equal(manifest.content_scripts[0].world, "MAIN");
assert.equal(manifest.content_scripts[0].run_at, "document_start");
assert.equal(manifest.content_scripts[0].all_frames, true);
assert.equal(manifest.content_scripts[0].match_about_blank, true);
assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
assert.deepEqual(manifest.content_scripts[1].js, ["content.js"]);
assert.equal(manifest.content_scripts[1].world, undefined);
assert.deepEqual(manifest.content_scripts[0].matches, manifest.content_scripts[1].matches);

const popup = readFileSync(join(root, "src/popup.html"), "utf8");
assert.deepEqual(popup.match(/<script\b/g), ['<script']);
assert.match(popup, /<script type="module" src="popup\.js"><\/script>/);

const build = readFileSync(join(root, "scripts/build.mjs"), "utf8");
assert.match(build, /entryPoints:\s*\[[^\]]*["']src\/page-proxy\.js["']/);
assert.match(build, /createElement\("script"\)/);
console.log("proxy installs from the main world without an inline script");
