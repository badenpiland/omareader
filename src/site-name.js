// SPDX-License-Identifier: MIT
// A short name for the popup's site switch, read the way people say it: the
// site, then its subdomains. github.com is "github", docs.google.com is
// "google docs", news.ycombinator.com is "ycombinator news". The public suffix
// goes, and so do leading labels that only pick a language or a device (www,
// m, mobile, en, de-at): en.m.wikipedia.org is "wikipedia", www.bbc.co.uk is
// "bbc".

// Second-level labels that sit under a country code, as in co.uk or com.au.
const COUNTRY_SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org", "ne", "or", "go", "gv"]);

// "www", "m" and "mobile", or a language code such as "en", "fr" or "zh-hant".
const NOISE_LABEL = /^(www\d*|m|mobile|[a-z]{2}(-[a-z]{2,4})?)$/;

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
  let start = 0;
  while (start < end - 1 && NOISE_LABEL.test(labels[start])) {
    start += 1;
  }
  // The site's own name, then each subdomain from the nearest outward.
  return labels.slice(start, Math.max(end, 1)).reverse().join(" ");
}
