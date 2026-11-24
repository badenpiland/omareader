import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptSiteFixes,
  fixesAutoUpdateEnabled,
  fixesFor,
  parseDynamicThemeFixes,
  sanitizeFetchedFixes,
  SITE_FIXES_URL,
  trustedFixesUrl,
} from "../src/site-fixes.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const text = readFileSync(join(root, "vendor/darkreader/dynamic-theme-fixes.config"), "utf8");
const sites = acceptSiteFixes(text);
const amazon = fixesFor("https://www.amazon.com/s?k=keyboard", sites);
const uk = fixesFor("https://www.amazon.co.uk/", sites);
const shop = fixesFor("https://www.apple.com/shop/buy-mac", sites);
const plain = fixesFor("https://example.org/", sites);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(sites[0].url[0] === "*", "common fix is first");
assert(amazon?.invert?.includes("i.a-icon.a-icon-search") || amazon?.invert?.some((rule) => rule.includes("a-icon-search")), "amazon.com uses the Amazon fix");
assert(uk?.invert?.some((rule) => rule.includes("a-icon")), "amazon.co.uk uses the Amazon fix");
assert(!plain?.invert?.some((rule) => rule.includes("a-icon-search")), "example.org does not get the Amazon fix");
assert(plain?.invert?.length > 0, "every site gets the common fix");
assert(shop?.invert?.includes(".as-localnav.as-localnav-scrim"), "apple.com/shop uses its path fix");
assert(!fixesFor("https://www.apple.com/iphone/", sites)?.invert?.includes(".as-localnav.as-localnav-scrim"), "apple.com/iphone does not use the shop fix");

const unknown = "*\nINVERT\n.a\n\n================================\nexample.com\nNOPE\n.b\n";
let rejected = false;
try {
  acceptSiteFixes(unknown);
} catch (error) {
  rejected = error instanceof Error && error.message === "Unknown site-fix command: NOPE";
}
assert(rejected, "an unknown command rejects the whole file");
const loose = parseDynamicThemeFixes(unknown);
assert(loose.length === 2 && !("nope" in loose[1]), "a non-strict parse skips an unknown command");

let missingCommon = false;
try {
  acceptSiteFixes("example.com\nINVERT\n.a\n");
} catch (error) {
  missingCommon = error instanceof Error && error.message === "Site fixes are missing the common block";
}
assert(missingCommon, "a file without the common block is rejected");

let tooLarge = false;
try {
  acceptSiteFixes(`${"*\n".repeat(3 * 1024 * 1024)}`);
} catch (error) {
  tooLarge = error instanceof Error && error.message === "Site fixes are empty or too large";
}
assert(tooLarge, "an oversized file is rejected");

assert(fixesAutoUpdateEnabled({}), "site-fix updates default on");
assert(fixesAutoUpdateEnabled({ siteFixesAutoUpdate: true }), "an explicit true stays on");
assert(!fixesAutoUpdateEnabled({ siteFixesAutoUpdate: false }), "the opt-out stops the download");
const fetched = [
  "*\nCSS\n",
  "body { background: url(\"https://evil.test/x.png\"); }\n",
  "@import \"https://evil.test/a.css\";\n",
  "@import url(//evil.test/b.css);\n",
  "div { background: URL(/secret); }\n",
  "img { content: url('data:image/png;base64,aaaa'); }\n",
].join("");
const cleaned = sanitizeFetchedFixes(fetched);
assert(!cleaned.toLowerCase().includes("@import"), "fetched @import is removed");
assert(!cleaned.includes("https://evil.test"), "fetched https url() is removed");
assert(!cleaned.includes("//evil.test"), "fetched protocol-relative url() is removed");
assert(!cleaned.includes("/secret"), "fetched path url() is removed");
assert(cleaned.includes("data:image/png;base64,aaaa"), "fetched data url() stays");
const quotedSelector = [
  "*\nINVERT\n.a\n\n================================\n\nexample.com\n\nINVERT\n",
  "div[style^=\"background-image: url(\\\"https://example.com/a.png\\\")\"]\n",
  "x{} body { background: url(https://evil.test/c.png) } y\n",
  "\nCSS\n",
  "a { background: url(\"https://evil.test/open.png\n",
  "b { color: red; }\n",
  "\n================================\n\nlater.test\n\nINVERT\n.later-logo\n",
].join("");
const quotedSites = acceptSiteFixes(sanitizeFetchedFixes(quotedSelector));
const escaped = sanitizeFetchedFixes([
  "*\nCSS\n",
  "a { background: \\75 rl(https://evil.test/e.png); }\n",
  "b { background: \\55\\52\\4c(https://evil.test/f.png); }\n",
  "c { background-image: image-set(\"https://evil.test/g.png\" 1x); }\n",
  "d { background-image: -webkit-image-set(url(https://evil.test/h.png) 1x); }\n",
  "e { background: url(data:image/png;base64,bbbb); }\n",
  "@\\69mport \"https://evil.test/i.css\";\n",
  ".bg-\\[\\#E5E7EB\\] { color: red; }\n",
  ".bg-\\[url\\(\\/static\\/a\\.svg\\)\\] { color: blue; }\n",
].join(""));
assert(!escaped.includes("evil.test"), "escaped url(), image-set() and @import are removed");
assert(escaped.includes("data:image/png;base64,bbbb"), "a data url() still stays");
assert(escaped.includes(".bg-\\[\\#E5E7EB\\] { color: red; }"), "escapes that hide nothing stay");
assert(escaped.includes(".bg-\\[url\\(\\/static\\/a\\.svg\\)\\] { color: blue; }"), "an escaped ( in a class name stays");

const quotedFix = fixesFor("https://example.com/", quotedSites);
assert(quotedFix.invert.some((selector) => selector.startsWith("div[style^=")), "a url( quoted in a selector stays");
assert(!quotedFix.invert.some((selector) => selector.includes("evil.test")), "a selector line that opens a rule is dropped");
assert(!quotedFix.css.includes("evil.test") && quotedFix.css.includes("color: red"), "an unclosed url() drops only its own line");
assert(
  fixesFor("https://later.test/", quotedSites).invert.includes(".later-logo"),
  "sites after a quoted url( keep their fixes",
);
const cleanedBundle = acceptSiteFixes(sanitizeFetchedFixes(text));
assert(cleanedBundle.length === sites.length, "cleaning the full list keeps every site");
assert(
  fixesFor("https://en.wikipedia.org/wiki/Arch_Linux", cleanedBundle).invert.includes(".mw-logo-wordmark"),
  "the cleaned list still inverts the Wikipedia wordmark",
);
assert(trustedFixesUrl(SITE_FIXES_URL) === true, "the Dark Reader list URL is trusted");
assert(
  SITE_FIXES_URL.includes("/92637d8c3fbb210853c005e3f25dbbec46dd21fc/"),
  "the Dark Reader list is pinned to 4.9.133",
);
assert(!trustedFixesUrl(SITE_FIXES_URL.replace("https:", "http:")), "plain HTTP is rejected");
assert(
  !trustedFixesUrl("https://raw.githubusercontent.com/evil/darkreader/main/src/config/dynamic-theme-fixes.config"),
  "another repository is rejected",
);
assert(!trustedFixesUrl("https://example.com/darkreader/darkreader/main/src/config/dynamic-theme-fixes.config"), "another host is rejected");

console.log(`site fixes ${sites.length} blocks, amazon invert ${amazon.invert.length}, common invert ${plain.invert.length}`);
