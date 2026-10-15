// SPDX-License-Identifier: MIT
// Chromium prefers a per-user native-messaging manifest over the packaged one.
// install.sh is that per-user host, and it is the right install when no package
// is present. The notice is for a pacman install that is still shadowed by the
// old manifest, or blocked by one whose binary is gone.

export const LEGACY_NOTICE = "Run omareader-cleanup-legacy, then fully restart the browser.";
// Registered only under /etc by the package. install.sh does not create it, so a
// successful connection means the package is installed even when com.bhp.omareader
// is stuck on a per-user manifest.
export const PACKAGE_HOST = "com.bhp.omareader.pkg";

export function hostInstallReport(message) {
  if (!message || message.type !== "host") {
    return null;
  }
  if (message.install !== "user" && message.install !== "system") {
    return null;
  }
  if (typeof message.packaged !== "boolean") {
    return null;
  }
  return {
    install: message.install,
    packaged: message.packaged,
    path: typeof message.path === "string" ? message.path : "",
  };
}

// The packaged host file is only visible to a host that speaks this handshake.
// An older binary, or a manifest whose binary is gone, needs the package-only name.
export function shouldProbePackage({ report, unidentified, unreachable, probe }) {
  if (probe !== "unknown") {
    return false;
  }
  if (report) {
    return false;
  }
  return Boolean(unidentified || unreachable);
}

function legacyConflict({ report, unidentified, unreachable, probe }) {
  if (report?.install === "system") {
    return false;
  }
  if (report?.install === "user") {
    return report.packaged === true || probe === "yes";
  }
  if (probe !== "yes") {
    return false;
  }
  return Boolean(unidentified || unreachable);
}

export function legacyDecision({ report, unidentified, unreachable, probe, dismissed }) {
  const conflict = legacyConflict({ report, unidentified, unreachable, probe });
  if (!conflict) {
    return { conflict: false, notice: "", dismiss: "clear" };
  }
  return {
    conflict: true,
    notice: dismissed ? "" : LEGACY_NOTICE,
    dismiss: "keep",
  };
}

// While the cleanup line is up, the popup stays on that one sentence. A dismissed
// conflict also drops the "run ./install.sh" line, which would undo the cleanup.
export function displayHostError(hostError, decision, { missingText, probePending } = {}) {
  const error = typeof hostError === "string" ? hostError : "";
  if (decision?.notice) {
    return "";
  }
  if ((decision?.conflict || probePending) && missingText && error === missingText) {
    return "";
  }
  return error;
}
