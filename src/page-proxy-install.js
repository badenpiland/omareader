// SPDX-License-Identifier: MIT

// Dark Reader's enable() asks the page world to install its stylesheet proxy
// by setting this attribute and dispatching PROXY_EVENT. The attribute is the
// payload because CustomEvent detail does not cross into this world.
export const PROXY_ATTRIBUTE = "data-omareader-proxy";
export const PROXY_EVENT = "__omareader__installProxy";

const MAX_PROXY_FLAG = 40;

export function readProxyFlags(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PROXY_FLAG) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    return null;
  }
  if (typeof parsed[0] !== "boolean" || typeof parsed[1] !== "boolean") {
    return null;
  }
  return [parsed[0], parsed[1]];
}

export function consumeProxySignal(root, injectProxy) {
  if (!root || typeof root.getAttribute !== "function") {
    return false;
  }
  const raw = root.getAttribute(PROXY_ATTRIBUTE);
  if (raw == null) {
    return false;
  }
  const flags = readProxyFlags(raw);
  root.removeAttribute(PROXY_ATTRIBUTE);
  if (!flags) {
    return false;
  }
  injectProxy(flags[0], flags[1]);
  return true;
}

// Capture MutationObserver at document_start, before the page can replace it.
// The event is the synchronous path. The observer covers a signal that arrives
// without the event, including a repeated install of the same flags.
export function watchProxyDocument(doc, injectProxy) {
  const Observer = globalThis.MutationObserver;
  const install = () => {
    if (doc.documentElement) {
      consumeProxySignal(doc.documentElement, injectProxy);
    }
  };
  doc.addEventListener(PROXY_EVENT, install);
  const arm = (root) => {
    install();
    const observer = new Observer(install);
    observer.observe(root, { attributes: true, attributeFilter: [PROXY_ATTRIBUTE] });
  };
  if (doc.documentElement) {
    arm(doc.documentElement);
    return;
  }
  const waiting = new Observer(() => {
    const root = doc.documentElement;
    if (!root) {
      return;
    }
    waiting.disconnect();
    arm(root);
  });
  waiting.observe(doc, { childList: true });
}
