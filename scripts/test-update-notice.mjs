import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  compareVersions,
  newerRelease,
  parseVersion,
  RELEASES_URL,
  REPO_URL,
  restoreUpdate,
  trustedReleasesUrl,
  updateLine,
} from "../src/update-notice.js";

assert.deepEqual(parseVersion("v0.1.7"), [0, 1, 7, 0]);
assert.equal(parseVersion("0.1.10.65535").length, 4);
assert.equal(parseVersion("0.1.10.65536"), null);
assert.equal(parseVersion("nightly"), null);
assert.equal(parseVersion("1.2.3.4.5"), null);
assert.equal(parseVersion(""), null);

assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
assert.equal(compareVersions("0.1.6", "0.1.6"), 0);
assert.equal(compareVersions("0.1.5", "v0.1.6"), -1);
assert.equal(compareVersions("nope", "0.1.6"), null);

assert.equal(
  newerRelease([{ tag_name: "v0.1.6", prerelease: true, draft: false }], "0.1.5"),
  "0.1.6",
);
assert.equal(newerRelease([{ tag_name: "v0.1.10", prerelease: true }], "0.1.9"), "0.1.10");
assert.equal(newerRelease([{ tag_name: "v0.1.6", prerelease: false }], "0.1.6"), "");
assert.equal(newerRelease([{ tag_name: "v0.1.5" }], "0.1.6"), "");
assert.equal(newerRelease([{ tag_name: "nightly" }, { tag_name: "v0.1.4" }], "0.1.6"), "");
assert.equal(
  newerRelease(
    [
      { tag_name: "v0.1.9", draft: true, prerelease: true },
      { tag_name: "v0.1.6", draft: false, prerelease: true },
    ],
    "0.1.5",
  ),
  "0.1.6",
);
assert.equal(
  newerRelease(
    [
      { tag_name: "v0.1.4", prerelease: false },
      { tag_name: "v0.1.8", prerelease: true },
    ],
    "0.1.6",
  ),
  "0.1.8",
);
assert.equal(newerRelease({ message: "Not Found" }, "0.1.6"), "");
assert.equal(newerRelease([], "nope"), "");

assert.equal(trustedReleasesUrl(RELEASES_URL), true);
assert.equal(trustedReleasesUrl("https://api.github.com/repos/badenpiland/omareader/releases"), true);
assert.equal(trustedReleasesUrl("https://api.github.com/repos/badenpiland/omareader/releases/latest"), false);
assert.equal(trustedReleasesUrl("http://api.github.com/repos/badenpiland/omareader/releases"), false);
assert.equal(trustedReleasesUrl("https://example.com/repos/badenpiland/omareader/releases"), false);
assert.equal(trustedReleasesUrl("https://api.github.com/repos/other/omareader/releases"), false);
assert.equal(REPO_URL, "https://github.com/badenpiland/omareader");

assert.deepEqual(updateLine("0.2.2", "", false), {
  installed: "v0.2.2",
  available: "",
  href: "",
});
assert.deepEqual(updateLine("0.2.2", "", true), {
  installed: "v0.2.2 · Up to date",
  available: "",
  href: "",
});
assert.deepEqual(updateLine("V0.2.2", "", true), {
  installed: "v0.2.2 · Up to date",
  available: "",
  href: "",
});
assert.equal(updateLine("0.2.2", "", false).installed.includes("Up to date"), false);
assert.equal(updateLine("0.2.2", "", undefined).installed, "v0.2.2");
const offered = updateLine("0.2.2", "0.2.3", true);
assert.deepEqual(offered, {
  installed: "v0.2.2 · ",
  available: "Update to v0.2.3",
  href: "https://github.com/badenpiland/omareader/releases/tag/v0.2.3",
});
assert.equal(`${offered.installed}${offered.available}`, "v0.2.2 · Update to v0.2.3");
assert.deepEqual(updateLine("0.2.2", "v0.2.3", false), offered);
assert.equal(updateLine(" 0.2.2 ", "", false).installed, "v0.2.2");
assert.deepEqual(updateLine("", "", true), { installed: "", available: "", href: "" });
assert.equal(updateLine("0.2.2", 12, true).installed, "v0.2.2 · Up to date");
assert.equal(JSON.stringify(updateLine("0.2.2", "0.2.3", true)).includes("is installed"), false);
assert.equal(JSON.stringify(updateLine("0.2.2", "0.2.3", true)).includes("is available"), false);

const popupJs = readFileSync(new URL("../src/popup.js", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../src/popup.html", import.meta.url), "utf8");
const background = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");
assert.match(popupJs, /updateLine\(\s*chrome\.runtime\.getManifest\(\)\.version/);
assert.doesNotMatch(popupJs, /0\.2\.\d/);
assert.doesNotMatch(popupHtml, /0\.2\.\d/);
assert.match(popupHtml, /<p id="update">/);
assert.doesNotMatch(popupHtml, /<p id="update"[^>]*\shidden/);
const snapshot = background.match(/function snapshot\(\) \{([\s\S]*?)\n\}/);
assert.ok(snapshot, "snapshot is present");
assert.match(snapshot[1], /updateChecked/);
assert.match(background, /restoreUpdate\(stored, chrome\.runtime\.getManifest\(\)\.version\)/);
assert.match(background, /updateCheckedFor: installed/);

// A release saved while 0.2.1 was installed must not be offered to 0.3.0.
assert.deepEqual(
  restoreUpdate({ updateVersion: "0.2.2", updateCheckedAt: 5 }, "0.3.0"),
  { updateVersion: "", updateChecked: false, stale: true },
);
assert.deepEqual(
  restoreUpdate({ updateVersion: "0.2.2", updateCheckedFor: "0.2.1", updateCheckedAt: 5 }, "0.3.0"),
  { updateVersion: "", updateChecked: false, stale: true },
);
// A check run by this version keeps its result while that release is newer.
assert.deepEqual(
  restoreUpdate({ updateVersion: "0.3.1", updateCheckedFor: "0.3.0", updateCheckedAt: 5 }, "0.3.0"),
  { updateVersion: "0.3.1", updateChecked: true, stale: false },
);
assert.deepEqual(
  restoreUpdate({ updateVersion: "", updateCheckedFor: "0.3.0", updateCheckedAt: 5 }, "0.3.0"),
  { updateVersion: "", updateChecked: true, stale: false },
);
assert.equal(
  restoreUpdate({ updateVersion: "0.2.2", updateCheckedFor: "0.3.0", updateCheckedAt: 5 }, "0.3.0").updateVersion,
  "",
);
assert.equal(restoreUpdate({ updateVersion: "nope", updateCheckedFor: "0.3.0" }, "0.3.0").updateVersion, "");
assert.equal(restoreUpdate({ updateCheckedFor: "0.3.0" }, "").stale, true);
assert.equal(restoreUpdate(undefined, "0.3.0").stale, true);

// The popup never offers a release that is not newer than the install.
assert.deepEqual(updateLine("0.3.0", "0.2.2", true), {
  installed: "v0.3.0 · Up to date",
  available: "",
  href: "",
});
assert.equal(updateLine("0.3.0", "0.3.0", false).available, "");
assert.equal(updateLine("0.3.0", "0.3.1", true).available, "Update to v0.3.1");

// The popup: logo and wordmark, the theme name, two matching switches, and a
// footer with the site-fix toggle and the version line.
const header = popupHtml.match(/<header>[\s\S]*?<\/header>/);
assert.ok(header, "popup header is present");
assert.match(header[0], /<img id="logo" src="icon-dark\.svg" width="30" height="30"/);
assert.match(header[0], /<h1>omareader<\/h1>/);
assert.match(header[0], /id="theme"/);
assert.match(popupJs, /palette\?\.mode === "light" \? "icon-light\.svg" : "icon-dark\.svg"/);
const built = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
assert.match(built, /icon-\$\{mode\}\.svg/);
for (const [id, key] of [["enabled", "U"], ["site", "O"]]) {
  const button = popupHtml.match(new RegExp(`<button id="${id}"[\\s\\S]*?</button>`));
  assert.ok(button, `${id} switch is present`);
  assert.match(button[0], /class="switch"/);
  assert.match(button[0], new RegExp(`aria-keyshortcuts="Alt\\+Shift\\+${key}"`));
  assert.match(button[0], /role="switch" aria-checked="true"/);
  assert.match(button[0], /class="toggle"/);
  assert.doesNotMatch(button[0], /class="keys"/, `${id} switch keeps its shortcut outside the button`);
  const ctrl = popupHtml.match(new RegExp(`<div id="${id}-ctrl" class="ctrl"[\\s\\S]*?</div>`));
  assert.ok(ctrl, `${id} switch sits in its control`);
  assert.match(ctrl[0], new RegExp(`class="keys"[^>]*>alt\\+shift\\+${key.toLowerCase()}</p>`));
}
assert.match(popupHtml, /<span id="enabled-label">everywhere<\/span>/);
assert.doesNotMatch(popupHtml, /<details/);
assert.doesNotMatch(popupHtml, /turn off|pause/i);
assert.doesNotMatch(popupHtml, /id="settings"/);
assert.doesNotMatch(popupJs, /openOptionsPage/);
const footer = popupHtml.match(/<footer>[\s\S]*?<\/footer>/);
assert.ok(footer, "popup footer is present");
assert.match(footer[0], /id="site-fixes"[^>]*\schecked/);
assert.match(footer[0], /fetch site fixes daily/);
assert.match(footer[0], /<p id="update">/);
assert.match(popupJs, /siteFixesAutoUpdate !== false/);
assert.match(popupJs, /type: "setSiteFixesAutoUpdate"/);
assert.match(popupJs, /enabled: siteFixesInput\.checked/);
assert.equal(popupHtml.includes("mhglniaepbokfgnpeennihlifandcgjh"), false);
assert.match(popupJs, /enabledButton\.setAttribute\("aria-checked", String\(enabled\)\)/);
assert.match(popupJs, /siteButton\.setAttribute\("aria-checked", String\(!paused\)\)/);
assert.match(popupJs, /siteLabel\.textContent = siteName\(host\)/);
{
  const { siteName } = await import("../src/site-name.js");
  for (const [host, name] of [
    ["github.com", "github"],
    ["www.github.com", "github"],
    ["en.wikipedia.org", "wikipedia"],
    ["news.ycombinator.com", "ycombinator"],
    ["www.bbc.co.uk", "bbc"],
    ["shop.example.com.au", "example"],
    ["github.io", "github"],
    ["x.co", "x"],
    ["localhost", "localhost"],
    ["127.0.0.1", "127.0.0.1"],
    ["Example.COM.", "example"],
  ]) {
    assert.equal(siteName(host), name, host);
  }
}
assert.doesNotMatch(popupJs, /turn off|turn on|pause on|theme this site/);
assert.match(popupJs, /siteButton\.classList\.toggle\("muted", !enabled\)/);
assert.match(popupJs, /type: "setEnabled", enabled/);
assert.match(popupJs, /applyFont\(state\.font, state\.fontFaces\)/);
assert.match(popupJs, /fontStack\(family, faces\)/);
{
  const { fontFaceRule, fontFacesFromHost, fontStack } = await import("../src/font.js");
  const faces = ["JetBrainsMono NF Regular", "JetBrainsMonoNF-Regular"];
  const rule = fontFaceRule(faces);
  assert.equal(rule.family, "Omareader JetBrainsMono NF Regular");
  assert.equal(
    rule.css,
    '@font-face { font-family: "Omareader JetBrainsMono NF Regular"; src: local("JetBrainsMono NF Regular"), local("JetBrainsMonoNF-Regular"); }',
  );
  assert.equal(
    fontStack("JetBrainsMono Nerd Font", faces),
    '"Omareader JetBrainsMono NF Regular", "JetBrainsMono Nerd Font", monospace',
  );
  assert.equal(fontStack("JetBrainsMono Nerd Font"), '"JetBrainsMono Nerd Font", monospace');
  assert.equal(fontStack(""), "monospace");
  assert.deepEqual(fontFacesFromHost(['Bad"); } body { x', "Ok-Name", "Ok-Name", 3]), ["Ok-Name"]);
  assert.deepEqual(fontFaceRule("nope"), { family: "", css: "" });
}
assert.doesNotMatch(popupJs, /mhglniaepbokfgnpeennihlifandcgjh/);

const popupCss = readFileSync(new URL("../src/popup.css", import.meta.url), "utf8");
assert.match(popupCss, /\.brand\s*\{[^}]*justify-content:\s*center/);
assert.match(popupCss, /\.switch\s*\{[^}]*width:\s*100%/);
assert.match(popupCss, /\.switch\.muted/);
assert.match(popupCss, /\.switch\[aria-checked="true"\] \.toggle::after\s*\{[^}]*translateX/);
assert.match(popupCss, /:root\s*\{[^}]*font:[^;]*var\(--font\)/);
assert.match(popupCss, /--font:\s*monospace/);
assert.match(popupCss, /:root\s*\{[^}]*font-size-adjust:\s*ex-height 0\.42/, "every Omarchy font draws at the same x-height");
assert.match(popupCss, /\nh1\s*\{[^}]*font-size-adjust:\s*none/, "the wordmark keeps its own size");
assert.match(popupCss, /\nbody\s*\{[^}]*font:\s*inherit/, "body takes the Omarchy font, not Chromium's extension-page font");
// The shortcut is a tooltip on hover or focus. It floats, so nothing moves and no space is kept.
assert.doesNotMatch(popupCss, /\.keys\s*\{[^}]*display:\s*none/);
assert.match(popupCss, /\.keys\s*\{[^}]*visibility:\s*hidden/);
assert.match(popupCss, /\.keys\s*\{[^}]*position:\s*absolute/);
assert.match(popupCss, /\.ctrl:hover \.keys\s*\{[^}]*visibility:\s*visible/);
assert.match(popupCss, /\.ctrl:has\(:focus-visible\) \.keys\s*\{[^}]*visibility:\s*visible/);
assert.match(popupJs, /siteCtrl\.hidden = !host/);
assert.match(popupCss, /font-family:\s*"Omarchy Font"/);
assert.match(popupCss, /url\("omarchy-font\.ttf"\)/);
assert.ok(statSync(new URL("../src/omarchy-font.ttf", import.meta.url)).size > 1000);
const fontLicense = readFileSync(new URL("../LICENSES/omarchy-font-MIT.txt", import.meta.url), "utf8");
assert.match(fontLicense, /Copyright \(c\) 2026 Mark Cuda/);
assert.match(fontLicense, /Permission is hereby granted/);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
assert.match(readme, /LICENSES\/omarchy-font-MIT\.txt/);
const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
assert.match(build, /"omarchy-font\.ttf"/);
assert.match(build, /omarchy-font-MIT\.txt/);
const pack = readFileSync(new URL("../scripts/pack.sh", import.meta.url), "utf8");
assert.match(pack, /omarchy-font\.ttf/);
assert.match(pack, /omarchy-font-MIT\.txt/);
assert.doesNotMatch(pack, /options\.html/);
assert.doesNotMatch(build, /"options\.html"/);
assert.doesNotMatch(build, /"options\.js"/);

console.log("update notice checked");
