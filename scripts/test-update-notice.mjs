import assert from "node:assert/strict";
import {
  compareVersions,
  newerRelease,
  parseVersion,
  RELEASES_URL,
  REPO_URL,
  trustedReleasesUrl,
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

console.log("update notice checked");
