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

// Prompt only for positive evidence that extension eimadpbcbfnmbkopoojfekhnkhdbieeh
// is installed and enabled. A missing or denied management permission is the
// normal install state, including an external package install, and is not evidence.
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
