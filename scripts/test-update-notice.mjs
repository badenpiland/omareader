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

// The popup: mode rows for all sites and this site, the wordmark with the
// version line beside it, and the site-fix and Dark Reader controls.
const header = popupHtml.match(/<header>[\s\S]*?<\/header>/);
assert.ok(header, "popup header is present");
assert.match(header[0], /<img id="logo" src="icon-dark\.svg" width="30" height="30"/);
assert.match(popupJs, /palette\?\.mode === "light" \? "icon-light\.svg" : "icon-dark\.svg"/);
const built = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
assert.match(built, /icon-\$\{mode\}\.svg/);
assert.match(header[0], /<h1>omareader<\/h1>/);
assert.match(header[0], /<p id="update">/);
assert.match(popupHtml, /id="modes" role="radiogroup"[^>]*aria-keyshortcuts="Alt\+Shift\+O"/);
assert.match(popupHtml, /id="site-modes" role="radiogroup"[^>]*aria-keyshortcuts="Alt\+Shift\+U"/);
for (const mode of ["normal", "dark", "omarchy"]) {
  assert.match(popupHtml, new RegExp(`id="modes"[\\s\\S]*data-mode="${mode}"`));
}
assert.match(popupHtml, /data-mode="default">Default</);
assert.match(popupHtml, />Follow Omarchy</);
assert.match(popupHtml, /alt\+shift\+o/);
assert.match(popupHtml, /alt\+shift\+u/);
assert.match(popupHtml, /id="site-fixes"[^>]*\schecked/);
assert.match(popupHtml, /Fetch site fixes daily/);
assert.match(popupHtml, /<section id="dark-reader" hidden>/);
assert.doesNotMatch(popupHtml, /id="settings"/);
assert.doesNotMatch(popupHtml, /<details/);
assert.doesNotMatch(popupJs, /openOptionsPage/);
assert.match(popupJs, /siteFixesAutoUpdate !== false/);
assert.match(popupJs, /type: "setSiteFixesAutoUpdate"/);
assert.match(popupJs, /type: "setMode", mode/);
assert.match(popupJs, /type: "setSiteMode", host, mode/);
assert.match(popupJs, /fontStack\(state\?\.font\)/);
assert.match(popupJs, /Live sync/);
assert.equal(popupHtml.includes("mhglniaepbokfgnpeennihlifandcgjh"), false);
assert.doesNotMatch(popupJs, /mhglniaepbokfgnpeennihlifandcgjh/);

const popupCss = readFileSync(new URL("../src/popup.css", import.meta.url), "utf8");
assert.match(popupCss, /body\s*\{[^}]*font:[^;]*var\(--font\)/);
assert.match(popupCss, /h1\s*\{[^}]*"Omarchy Font"/);
assert.match(popupCss, /--font:\s*monospace/);
assert.match(popupCss, /#update\s*\{[^}]*white-space:\s*nowrap/);
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
