import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareVersions,
  newerRelease,
  parseVersion,
  RELEASES_URL,
  REPO_URL,
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
assert.match(background, /updateChecked = Number\(stored\.updateCheckedAt\) > 0/);

console.log("update notice checked");
