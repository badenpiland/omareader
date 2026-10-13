import assert from "node:assert/strict";
import {
  MAX_THEME_RESOURCE,
  THEME_FETCH_INIT,
  readThemeResource,
  themeResourceRequest,
} from "../src/theme-fetch.js";

assert.equal(
  themeResourceRequest("https://m.media-amazon.com/images/a.css"),
  "https://m.media-amazon.com/images/a.css",
);
assert.equal(themeResourceRequest("http://example.com/a.css"), "http://example.com/a.css");
assert.equal(themeResourceRequest("file:///etc/passwd"), null);
assert.equal(themeResourceRequest("https://user:pass@example.com/a.css"), null);
assert.equal(themeResourceRequest("javascript:alert(1)"), null);
assert.equal(themeResourceRequest("not a url"), null);

const css = "body { color: #0f1111; }";
const ok = await readThemeResource("https://cdn.example/a.css", async () => new Response(css, {
  status: 200,
  headers: { "content-type": "text/css; charset=utf-8" },
}));
assert.equal(ok.text, css);

const page = await readThemeResource("https://cdn.example/a.css", async () => new Response("<html></html>", {
  status: 200,
  headers: { "content-type": "text/html" },
}));
assert.equal(page.text, undefined);
assert.equal(typeof page.error, "string");

const huge = await readThemeResource("https://cdn.example/a.css", async () => new Response("x".repeat(MAX_THEME_RESOURCE + 1), {
  status: 200,
  headers: { "content-type": "text/css" },
}));
assert.equal(huge.text, undefined);

let fetched = false;
const denied = await readThemeResource("chrome-extension://abcdefghijklmnop/a.css", async () => {
  fetched = true;
  return new Response("");
});
assert.equal(denied.error, "unsupported url");
assert.equal(fetched, false);

const plain = await readThemeResource("https://cdn.example/a.css", async () => new Response("body{}", {
  status: 200,
  headers: { "content-type": "text/plain" },
}));
assert.equal(plain.text, undefined);

const untyped = await readThemeResource("https://cdn.example/a.css", async () => new Response("body{}", {
  status: 200,
}));
assert.equal(untyped.text, undefined);

let seenInit = null;
const styled = await readThemeResource("https://cdn.example/a.css", async (_href, init) => {
  seenInit = init;
  return new Response(css, { status: 200, headers: { "content-type": "text/css" } });
});
assert.equal(styled.text, css);
assert.deepEqual(seenInit, THEME_FETCH_INIT);

const blocked = [
  "http://127.0.0.1/a.css",
  "http://127.1/a.css",
  "http://10.1.2.3/a.css",
  "http://172.16.0.1/a.css",
  "http://172.31.255.1/a.css",
  "http://192.168.1.1/a.css",
  "http://169.254.1.1/a.css",
  "http://100.64.0.1/a.css",
  "http://100.127.255.1/a.css",
  "http://0.0.0.0/a.css",
  "http://0.255.1.2/a.css",
  "http://localhost/a.css",
  "http://localhost./a.css",
  "http://foo.local/a.css",
  "http://box.ts.net/a.css",
  "http://deco.lan/a.css",
  "http://router.home.arpa/a.css",
  "http://router.home.arpa./a.css",
  "http://nas.internal/a.css",
  "http://[::1]/a.css",
  "http://[fd00::1]/a.css",
  "http://[fc00::]/a.css",
  "http://[fe80::1]/a.css",
  "http://[::ffff:127.0.0.1]/a.css",
  "http://[::ffff:10.1.2.3]/a.css",
];
for (const url of blocked) {
  let called = false;
  const result = await readThemeResource(url, async () => {
    called = true;
    return new Response("");
  });
  assert.equal(called, false, url);
  assert.equal(result.error, "unsupported url", url);
  assert.equal(themeResourceRequest(url), null, url);
}

const allowed = [
  "http://1.2.3.4/a.css",
  "http://8.8.8.8/a.css",
  "http://172.15.255.255/a.css",
  "http://172.32.0.1/a.css",
  "http://100.63.255.255/a.css",
  "http://100.128.0.1/a.css",
  "http://11.0.0.1/a.css",
  "http://notts.net/a.css",
  "http://example.lan.com/a.css",
  "http://[2001:db8::1]/a.css",
  "http://[fec0::1]/a.css",
];
for (const url of allowed) {
  assert.equal(themeResourceRequest(url), new URL(url).href, url);
}

console.log("theme resource fetch checked");
