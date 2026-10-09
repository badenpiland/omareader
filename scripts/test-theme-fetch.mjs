import assert from "node:assert/strict";
import { MAX_THEME_RESOURCE, readThemeResource, themeResourceRequest } from "../src/theme-fetch.js";

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
console.log("theme resource fetch checked");
