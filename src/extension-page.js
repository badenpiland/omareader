// SPDX-License-Identifier: MIT

// True for popup and other extension pages. Content scripts have a tab.
export function fromExtensionPage(sender, extensionOrigin) {
  return !sender?.tab
    && typeof extensionOrigin === "string"
    && extensionOrigin.length > 0
    && typeof sender?.url === "string"
    && sender.url.startsWith(extensionOrigin);
}
