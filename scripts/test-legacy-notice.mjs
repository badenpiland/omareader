import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_MISSING } from "../src/host-message.js";
import {
  displayHostError,
  hostInstallReport,
  LEGACY_NOTICE,
  legacyDecision,
  PACKAGE_HOST,
  shouldProbePackage,
} from "../src/legacy-notice.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function decide(overrides) {
  return legacyDecision({
    report: null,
    unidentified: false,
    unreachable: false,
    probe: "unknown",
    dismissed: false,
    ...overrides,
  });
}

const userHost = { install: "user", packaged: false, path: "/home/me/.local/share/omareader/omareader-host" };
const shadowed = { ...userHost, packaged: true };
const systemHost = { install: "system", packaged: true, path: "/usr/lib/omareader/omareader-host" };

assert.equal(hostInstallReport(null), null);
assert.equal(hostInstallReport({ type: "palette", install: "user", packaged: true }), null);
assert.equal(hostInstallReport({ type: "host", install: "local", packaged: true }), null);
assert.equal(hostInstallReport({ type: "host", install: "user", packaged: "yes" }), null);
assert.deepEqual(hostInstallReport({ type: "host", install: "user", packaged: false }), {
  install: "user",
  packaged: false,
  path: "",
});
assert.equal(
  hostInstallReport({ type: "host", install: "system", packaged: true, path: systemHost.path }).path,
  systemHost.path,
);
console.log("host handshake rejected unless install and packaged are typed");

assert.deepEqual(decide({ report: systemHost }), { conflict: false, notice: "", dismiss: "clear" });
assert.deepEqual(decide({ report: userHost }), { conflict: false, notice: "", dismiss: "clear" });
assert.deepEqual(decide({ report: userHost, probe: "no" }), { conflict: false, notice: "", dismiss: "clear" });
assert.equal(decide({ report: shadowed }).notice, LEGACY_NOTICE);
assert.equal(decide({ report: shadowed, probe: "no" }).conflict, true);
assert.equal(decide({ report: userHost, probe: "yes" }).notice, LEGACY_NOTICE);

assert.deepEqual(decide({ unidentified: true, probe: "unknown" }), {
  conflict: false,
  notice: "",
  dismiss: "clear",
});
assert.deepEqual(decide({ unidentified: true, probe: "no" }), {
  conflict: false,
  notice: "",
  dismiss: "clear",
});
assert.equal(decide({ unidentified: true, probe: "yes" }).notice, LEGACY_NOTICE);
assert.equal(decide({ unreachable: true, probe: "yes" }).notice, LEGACY_NOTICE);
assert.equal(decide({ unreachable: true, probe: "no" }).conflict, false);
assert.equal(decide({ unreachable: true, probe: "unknown" }).conflict, false);
assert.equal(decide({ probe: "yes" }).conflict, false);

const dismissed = decide({ report: shadowed, dismissed: true });
assert.equal(dismissed.notice, "");
assert.equal(dismissed.dismiss, "keep");
assert.equal(dismissed.conflict, true);
assert.equal(decide({ report: systemHost, dismissed: true }).dismiss, "clear");
console.log("legacy notice stays quiet for install.sh and for the packaged host");

assert.equal(shouldProbePackage({ report: shadowed, unidentified: false, unreachable: false, probe: "unknown" }), false);
assert.equal(shouldProbePackage({ report: null, unidentified: true, unreachable: false, probe: "unknown" }), true);
assert.equal(shouldProbePackage({ report: null, unidentified: false, unreachable: true, probe: "unknown" }), true);
assert.equal(shouldProbePackage({ report: null, unidentified: true, unreachable: false, probe: "yes" }), false);
assert.equal(shouldProbePackage({ report: null, unidentified: false, unreachable: false, probe: "unknown" }), false);
console.log("package probe runs only when the live host did not identify itself");

const conflict = { conflict: true, notice: LEGACY_NOTICE, dismiss: "keep" };
const hidden = { conflict: true, notice: "", dismiss: "keep" };
assert.equal(displayHostError(HOST_MISSING, conflict, { missingText: HOST_MISSING }), "");
assert.equal(displayHostError("Theme host disconnected", conflict, { missingText: HOST_MISSING }), "");
assert.equal(displayHostError(HOST_MISSING, hidden, { missingText: HOST_MISSING }), "");
assert.equal(
  displayHostError("Theme host disconnected", hidden, { missingText: HOST_MISSING }),
  "Theme host disconnected",
);
assert.equal(
  displayHostError(HOST_MISSING, { conflict: false, notice: "" }, { missingText: HOST_MISSING, probePending: true }),
  "",
);
assert.equal(
  displayHostError(HOST_MISSING, { conflict: false, notice: "" }, { missingText: HOST_MISSING, probePending: false }),
  HOST_MISSING,
);
console.log("cleanup line replaces the install.sh hint");

const pkgbuild = readFileSync(join(repoRoot, "packaging/arch/PKGBUILD"), "utf8");
assert.match(pkgbuild, new RegExp(PACKAGE_HOST.replaceAll(".", "\\.")));
assert.match(pkgbuild, /com\.bhp\.omareader\.pkg\.json/);
assert.match(pkgbuild, /\/usr\/lib\/%s\/omareader-host/);
const hostSource = readFileSync(join(repoRoot, "host/omareader-host"), "utf8");
assert.match(hostSource, /\/usr\/lib\/omareader\/omareader-host/);
const install = readFileSync(join(repoRoot, "install.sh"), "utf8");
assert.equal(install.includes(PACKAGE_HOST), false);
const popup = readFileSync(join(repoRoot, "src/popup.html"), "utf8");
assert.match(popup, /id="legacy"/);
const background = readFileSync(join(repoRoot, "src/background.js"), "utf8");
assert.match(background, /PACKAGE_HOST/);
assert.match(background, /dismissLegacyNotice/);
console.log("package registers the probe host and install.sh does not");
