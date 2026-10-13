// SPDX-License-Identifier: MIT
// Cross-origin stylesheets are fetched here. The page itself cannot read them.

export const THEME_RESOURCE = "theme-resource";
export const MAX_THEME_RESOURCE = 4_000_000;

// The worker fetches with these options. No cookies, no redirect hop, cached CSS only.
export const THEME_FETCH_INIT = {
  credentials: "omit",
  redirect: "error",
  cache: "force-cache",
};

// Apex names and their subdomains. Home routers use .lan, .home.arpa, and .internal.
const BLOCKED_NAMES = ["local", "lan", "home.arpa", "ts.net", "internal"];

function normalizedHost(hostname) {
  let host = String(hostname || "").trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  return host;
}

function octets(text) {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value > 255) {
      return null;
    }
    nums.push(value);
  }
  return nums;
}

function blockedIpv4(nums) {
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  return false;
}

function expandIpv6(host) {
  let text = host;
  const dotted = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const nums = octets(dotted[2]);
    if (!nums) {
      return null;
    }
    const hi = (nums[0] << 8) | nums[1];
    const lo = (nums[2] << 8) | nums[3];
    text = `${dotted[1]}${hi.toString(16)}:${lo.toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseSide = (side) => {
    if (side === "") {
      return [];
    }
    return side.split(":").map((part) => (/^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN));
  };
  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) {
    return null;
  }
  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 1) {
    return null;
  }
  return [...left, ...Array(missing).fill(0), ...right];
}

function blockedIpv6(host) {
  const words = expandIpv6(host);
  if (!words) {
    return false;
  }
  const loopback = words.every((word, index) => word === (index === 7 ? 1 : 0));
  if (loopback) {
    return true;
  }
  if (words[0] >= 0xfc00 && words[0] <= 0xfdff) {
    return true;
  }
  if (words[0] >= 0xfe80 && words[0] <= 0xfebf) {
    return true;
  }
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (!mapped) {
    return false;
  }
  const hi = words[6];
  const lo = words[7];
  return blockedIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
}

export function blockedThemeHost(hostname) {
  const host = normalizedHost(hostname);
  if (!host || host === "localhost") {
    return true;
  }
  if (BLOCKED_NAMES.some((name) => host === name || host.endsWith(`.${name}`))) {
    return true;
  }
  if (host.includes(":")) {
    return blockedIpv6(host);
  }
  const nums = octets(host);
  return nums ? blockedIpv4(nums) : false;
}

export function themeResourceRequest(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (blockedThemeHost(parsed.hostname)) {
    return null;
  }
  return parsed.href;
}

function acceptedThemeResource(contentType, byteLength) {
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "text/css") {
    return false;
  }
  return Number.isFinite(byteLength) && byteLength >= 0 && byteLength <= MAX_THEME_RESOURCE;
}

export async function readThemeResource(url, fetchImpl) {
  const href = themeResourceRequest(url);
  if (!href) {
    return { error: "unsupported url" };
  }
  let response;
  try {
    response = await fetchImpl(href, THEME_FETCH_INIT);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "fetch failed" };
  }
  if (!response?.ok) {
    return { error: `HTTP ${response?.status || 0}` };
  }
  const contentType = response.headers?.get("content-type") || "";
  const buffer = await response.arrayBuffer();
  if (!acceptedThemeResource(contentType, buffer.byteLength)) {
    return { error: "unsupported resource" };
  }
  return {
    text: new TextDecoder().decode(buffer),
    contentType: contentType || "text/css",
  };
}
