// SPDX-License-Identifier: MIT
// URL matching follows Dark Reader's isURLMatched (darkreader 4.9.133).

const COMMANDS = {
  INVERT: "invert",
  CSS: "css",
  "IGNORE INLINE STYLE": "ignoreInlineStyle",
  "IGNORE IMAGE ANALYSIS": "ignoreImageAnalysis",
  "IGNORE CSS URL": "ignoreCSSUrl",
};

// Dark Reader publishes this file on main as site fixes land. The extension
// fetches it; the vendored copy is the offline fallback.
export const SITE_FIXES_URL =
  "https://raw.githubusercontent.com/darkreader/darkreader/main/src/config/dynamic-theme-fixes.config";

const MAX_SITE_FIX_CHARS = 3 * 1024 * 1024;

export function trustedFixesUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "raw.githubusercontent.com" &&
      parsed.pathname.startsWith("/darkreader/darkreader/") &&
      parsed.pathname.endsWith("/src/config/dynamic-theme-fixes.config")
    );
  } catch {
    return false;
  }
}

export function parseDynamicThemeFixes(text, options = {}) {
  const strict = options.strict === true;
  const sites = [];
  const blocks = text.replace(/\r/g, "").split(/^\s*={2,}\s*$/gm);
  for (const block of blocks) {
    const lines = block.split("\n");
    const commandIndices = [];
    lines.forEach((line, index) => {
      if (/^[A-Z]+(\s[A-Z]+){0,2}$/.test(line)) {
        commandIndices.push(index);
      }
    });
    if (commandIndices.length === 0) {
      continue;
    }
    const site = {
      url: lines
        .slice(0, commandIndices[0])
        .map((line) => line.trim())
        .filter(Boolean),
    };
    commandIndices.forEach((commandIndex, index) => {
      const command = lines[commandIndex].trim();
      const prop = COMMANDS[command];
      if (!prop) {
        if (strict) {
          throw new Error(`Unknown site-fix command: ${command}`);
        }
        return;
      }
      const end = index === commandIndices.length - 1 ? lines.length : commandIndices[index + 1];
      const valueText = lines.slice(commandIndex + 1, end).join("\n");
      site[prop] =
        command === "CSS"
          ? valueText.trim()
          : valueText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
    });
    sites.push(site);
  }
  return sites;
}

// Reject the whole file unless it is a size-capped Dark Reader config whose
// commands this build understands and whose first block is the common "*".
export function acceptSiteFixes(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_SITE_FIX_CHARS) {
    throw new Error("Site fixes are empty or too large");
  }
  const sites = parseDynamicThemeFixes(text, { strict: true });
  if (sites[0]?.url?.[0] !== "*") {
    throw new Error("Site fixes are missing the common block");
  }
  return sites;
}

function prepareURL(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostParts = parsed.hostname.split(".").reverse();
  const pathParts = parsed.pathname.split("/").slice(1);
  if (pathParts.length && !pathParts[pathParts.length - 1]) {
    pathParts.pop();
  }
  return { hostParts, pathParts, port: parsed.port, protocol: parsed.protocol };
}

function preparePattern(pattern) {
  if (!pattern) {
    return null;
  }
  let exactStart = pattern.startsWith("^");
  let exactEnd = pattern.endsWith("$");
  if (exactStart) {
    pattern = pattern.slice(1);
  }
  if (exactEnd) {
    pattern = pattern.slice(0, -1);
  }
  let protocol = "";
  const protocolIndex = pattern.indexOf("://");
  if (protocolIndex > 0) {
    protocol = pattern.slice(0, protocolIndex + 1);
    pattern = pattern.slice(protocolIndex + 3);
  }
  const slashIndex = pattern.indexOf("/");
  const host = slashIndex < 0 ? pattern : pattern.slice(0, slashIndex);
  let hostName = host;
  let isIPv6 = false;
  let ipV6End = -1;
  if (host.startsWith("[")) {
    ipV6End = host.indexOf("]");
    if (ipV6End > 0) {
      isIPv6 = true;
    }
  }
  let port = "*";
  const portIndex = host.lastIndexOf(":");
  if (portIndex >= 0 && (!isIPv6 || ipV6End < portIndex)) {
    hostName = host.slice(0, portIndex);
    port = host.slice(portIndex + 1);
  }
  if (isIPv6) {
    try {
      hostName = new URL(`http://${hostName}`).hostname;
    } catch {
      // Keep the raw host when it is not a URL.
    }
  }
  const hostParts = hostName.split(".").reverse();
  const path = slashIndex < 0 ? "" : pattern.slice(slashIndex + 1);
  const pathParts = path ? path.split("/") : [];
  if (pathParts.length && !pathParts[pathParts.length - 1]) {
    pathParts.pop();
  }
  return { hostParts, pathParts, port, exactStart, exactEnd, protocol };
}

function matchPrepared(url, pattern) {
  if (
    !url ||
    !pattern ||
    pattern.hostParts.length > url.hostParts.length ||
    (pattern.exactStart && pattern.hostParts.length !== url.hostParts.length) ||
    (pattern.exactEnd && pattern.pathParts.length !== url.pathParts.length) ||
    (pattern.port !== "*" && pattern.port !== url.port) ||
    (pattern.protocol && pattern.protocol !== url.protocol)
  ) {
    return false;
  }
  for (let i = 0; i < pattern.hostParts.length; i++) {
    if (pattern.hostParts[i] !== "*" && pattern.hostParts[i] !== url.hostParts[i]) {
      return false;
    }
  }
  const last = pattern.hostParts[pattern.hostParts.length - 1];
  if (
    pattern.hostParts.length >= 2 &&
    last !== "*" &&
    (pattern.hostParts.length < url.hostParts.length - 1 ||
      (pattern.hostParts.length === url.hostParts.length - 1 &&
        url.hostParts[url.hostParts.length - 1] !== "www"))
  ) {
    return false;
  }
  if (pattern.pathParts.length === 0) {
    return true;
  }
  if (pattern.pathParts.length > url.pathParts.length) {
    return false;
  }
  for (let i = 0; i < pattern.pathParts.length; i++) {
    if (pattern.pathParts[i] !== "*" && pattern.pathParts[i] !== url.pathParts[i]) {
      return false;
    }
  }
  return true;
}

function isURLMatched(url, pattern) {
  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(url);
    } catch {
      return false;
    }
  }
  return matchPrepared(prepareURL(url), preparePattern(pattern));
}

export function fixesFor(url, sites) {
  if (!Array.isArray(sites) || sites.length === 0 || sites[0].url?.[0] !== "*") {
    return null;
  }
  let best = null;
  let bestLength = -1;
  for (let i = 1; i < sites.length; i++) {
    const patterns = sites[i].url || [];
    if (!patterns.some((pattern) => isURLMatched(url, pattern))) {
      continue;
    }
    const specificity = patterns[0]?.length || 0;
    if (!best || bestLength < specificity) {
      best = sites[i];
      bestLength = specificity;
    }
  }
  const chosen = best ? [sites[0], best] : [sites[0]];
  return {
    invert: chosen.flatMap((site) => site.invert || []),
    css: chosen
      .map((site) => site.css)
      .filter(Boolean)
      .join("\n"),
    ignoreInlineStyle: chosen.flatMap((site) => site.ignoreInlineStyle || []),
    ignoreImageAnalysis: chosen.flatMap((site) => site.ignoreImageAnalysis || []),
    ignoreCSSUrl: chosen.flatMap((site) => site.ignoreCSSUrl || []),
  };
}
