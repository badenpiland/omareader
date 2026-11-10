// SPDX-License-Identifier: MIT

// The Dark Reader extension's MAIN-world proxy (inject/proxy.js) sets this.
// The bundled darkreader enable() API does not. data-darkreader-mode,
// data-darkreader-scheme, and style.darkreader are shared with that API.
export const DARK_READER_PROXY_ATTRIBUTE = "data-darkreader-proxy-injected";

export function extensionProxyInjected(root) {
  if (!root || typeof root.getAttribute !== "function") {
    return false;
  }
  return root.getAttribute(DARK_READER_PROXY_ATTRIBUTE) === "true";
}

// Chromium Dark Reader id. Firefox's listing is addon@darkreader.org.
export const DARK_READER_CHROMIUM_ID = "eimadpbcbfnmbkopoojfekhnkhdbieeh";
export const DARK_READER_GECKO_ID = "addon@darkreader.org";

export function darkReaderExtensionId(extensionUrl) {
  if (String(extensionUrl || "").startsWith("moz-extension:")) {
    return DARK_READER_GECKO_ID;
  }
  return DARK_READER_CHROMIUM_ID;
}

// Prompt only for positive evidence that Dark Reader is installed and enabled.
// A missing or denied management permission is the normal install state,
// including an external package install, and is not evidence.
export function decideDarkReaderPrompt({
  stored,
  managementGranted,
  extensionEnabled,
  proxyInjected,
}) {
  if (stored?.darkReaderChoice || stored?.darkReaderOffered) {
    return { prompt: false, known: false };
  }
  if (managementGranted === true) {
    if (extensionEnabled === true) {
      return { prompt: true, known: true };
    }
    return { prompt: false, known: false };
  }
  if (proxyInjected === true) {
    return { prompt: true, known: true };
  }
  return { prompt: false, known: false };
}
