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
