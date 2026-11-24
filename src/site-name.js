// SPDX-License-Identifier: MIT
// A short name for the popup's site switch: "github" for github.com,
// "wikipedia" for en.wikipedia.org, "bbc" for www.bbc.co.uk.

// Second-level labels that sit under a country code, as in co.uk or com.au.
const COUNTRY_SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org", "ne", "or", "go", "gv"]);

export function siteName(host) {
  const name = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!name || /^[\d.]+$/.test(name) || name.includes(":") || !name.includes(".")) {
    return name;
  }
  const labels = name.split(".");
  let index = labels.length - 2;
  const top = labels[labels.length - 1];
  if (top.length === 2 && labels.length >= 3 && COUNTRY_SECOND_LEVEL.has(labels[index])) {
    index -= 1;
  }
  return labels[Math.max(index, 0)];
}
