// SPDX-License-Identifier: MIT
// A short name for the popup's site switch, read the way people say it: the
// site, then its subdomains. github.com is "github", docs.google.com is
// "google docs", news.ycombinator.com is "ycombinator news". The public suffix
// goes, and so do leading labels that only pick a language or a device (www,
// m, mobile, en, pt-br): en.m.wikipedia.org is "wikipedia", www.bbc.co.uk is
// "bbc".

// Second-level labels that sit under a country code, as in co.uk or com.au.
const COUNTRY_SECOND_LEVEL = new Set(["ac", "co", "com", "edu", "gov", "net", "org", "ne", "or", "go", "gv"]);

// Leading labels that only pick a device: www, www2, m, mobile.
const DEVICE_LABEL = /^(www\d*|m|mobile)$/;

// ISO 639-1 language codes, as in en.wikipedia.org or pt-br.example.com. A few
// codes usually name a thing instead, such as "io", "ml", "my", "id" and "is",
// so they stay in the name: my.example.edu is "example my". "ai" is not a
// language code, so ai.google.com is "google ai".
const LANGUAGES = new Set([
  "aa", "ab", "ae", "af", "ak", "ar", "as", "av", "ay", "az", "ba", "bg", "bh",
  "bi", "bm", "bn", "bo", "br", "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu",
  "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et", "eu",
  "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv",
  "ha", "he", "hi", "ho", "hr", "ht", "hu", "hy", "hz", "ia", "ie", "ig", "ii",
  "ik", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk", "kl", "km", "kn",
  "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo",
  "lt", "lu", "lv", "mg", "mh", "mi", "mk", "mn", "mr", "mt", "na", "nb", "nd",
  "ne", "ng", "nl", "nn", "nr", "nv", "ny", "oc", "oj", "om", "or", "pa", "pi",
  "pl", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se",
  "sg", "si", "sk", "sl", "sm", "sn", "sq", "sr", "ss", "st", "su", "sv", "sw",
  "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "tr", "ts", "tt", "tw", "ty",
  "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo", "za",
  "zh", "zu",
]);

function noiseLabel(label) {
  if (DEVICE_LABEL.test(label)) {
    return true;
  }
  const match = /^([a-z]{2})(-[a-z]{2,4})?$/.exec(label);
  return Boolean(match && LANGUAGES.has(match[1]));
}

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
  while (start < end - 1 && noiseLabel(labels[start])) {
    start += 1;
  }
  // The site's own name, then each subdomain from the nearest outward.
  return labels.slice(start, Math.max(end, 1)).reverse().join(" ");
}
