// SPDX-License-Identifier: MIT
// Cross-origin stylesheets are fetched here. The page itself cannot read them.

export const THEME_RESOURCE = "theme-resource";
export const MAX_THEME_RESOURCE = 4_000_000;

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
  return parsed.href;
}

function acceptedThemeResource(contentType, byteLength) {
  const type = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (type && type !== "text/css" && type !== "text/plain") {
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
    response = await fetchImpl(href);
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
