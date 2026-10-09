// SPDX-License-Identifier: MIT
// /releases/latest skips pre-releases. This list includes them.

export const RELEASES_URL = "https://api.github.com/repos/badenpiland/omareader/releases?per_page=20";
export const REPO_URL = "https://github.com/badenpiland/omareader";
export const MAX_RELEASES_BYTES = 1024 * 1024;

export function trustedReleasesUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "api.github.com" &&
      parsed.pathname === "/repos/badenpiland/omareader/releases"
    );
  } catch {
    return false;
  }
}

// Chromium manifest versions are one to four dot-separated integers, 0 through 65535.
export function parseVersion(value) {
  const text = String(value ?? "").trim().replace(/^v/, "");
  const parts = text.split(".");
  if (parts.length < 1 || parts.length > 4 || text === "") {
    return null;
  }
  const numbers = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) {
      return null;
    }
    const number = Number(part);
    if (!Number.isInteger(number) || number > 65535) {
      return null;
    }
    numbers.push(number);
  }
  while (numbers.length < 4) {
    numbers.push(0);
  }
  return numbers;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return null;
  }
  for (let i = 0; i < 4; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] > b[i] ? 1 : -1;
    }
  }
  return 0;
}

function versionText(tag) {
  return String(tag).trim().replace(/^v/, "");
}

// Greatest release newer than current, from this page. Drafts and non-versions are ignored.
export function newerRelease(releases, currentVersion) {
  if (!Array.isArray(releases) || !parseVersion(currentVersion)) {
    return "";
  }
  let best = "";
  for (const release of releases) {
    if (!release || release.draft === true || typeof release.tag_name !== "string") {
      continue;
    }
    if (compareVersions(release.tag_name, currentVersion) !== 1) {
      continue;
    }
    if (!best || compareVersions(release.tag_name, best) === 1) {
      best = versionText(release.tag_name);
    }
  }
  return best;
}
