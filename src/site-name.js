// SPDX-License-Identifier: MIT
// A short name for the popup's site switch: the host without "www." and
// without its public suffix. github.com is "github", gist.github.com is
// "gist.github", en.wikipedia.org is "en.wikipedia", www.bbc.co.uk is "bbc".

// Second-level labels that sit under a country code, as in co.uk or com.au.
const COUNTRY_SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org", "ne", "or", "go", "gv"]);

export function siteName(host) {
  const name = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!name || /^[\d.]+$/.test(name) || name.includes(":") || !name.includes(".")) {
    return name;
  }
  const labels = name.split(".");
  let end = labels.length - 1;
  const top = labels[end];
  if (top.length === 2 && labels.length >= 3 && COUNTRY_SECOND_LEVEL.has(labels[end - 1])) {
    end -= 1;
  }
  const start = labels[0] === "www" && end > 1 ? 1 : 0;
  return labels.slice(start, Math.max(end, 1)).join(".");
}
