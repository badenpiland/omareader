// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { PROXY_ATTRIBUTE, PROXY_EVENT } from "../src/page-proxy-install.js";

// Chromium blocked this inline script with sha256-r1cyMJILgyTo33FkQEdMV0NGSfZO6vhBj0Gj/Medd20=.
// That is the hash of `(${injectProxy})(true, true)` after esbuild prints the function.
const PROXY_START = 'const proxyScript = createOrUpdateScript("darkreader--proxy");';
const PROXY_END = "proxyScript.remove();";

export function extractInjectProxy(source) {
  const signature = "function injectProxy(";
  const start = source.indexOf(signature);
  if (start < 0) {
    throw new Error("darkreader injectProxy() was not found");
  }
  let index = source.indexOf("{", start);
  if (index < 0) {
    throw new Error("darkreader injectProxy() has no body");
  }
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error("darkreader injectProxy() did not end");
}

export function replaceInlineProxy(source) {
  const start = source.indexOf(PROXY_START);
  if (start < 0) {
    throw new Error("Dark Reader inline proxy injection was not found");
  }
  const end = source.indexOf(PROXY_END, start);
  if (end < 0) {
    throw new Error("Dark Reader inline proxy removal was not found");
  }
  const attribute = JSON.stringify(PROXY_ATTRIBUTE);
  const eventName = JSON.stringify(PROXY_EVENT);
  const replacement = `const proxyRoot = document.documentElement;
        if (proxyRoot) {
            proxyRoot.removeAttribute(${attribute});
            proxyRoot.setAttribute(
                ${attribute},
                JSON.stringify([enableStyleSheetsProxy, enableCustomElementRegistryProxy])
            );
            document.dispatchEvent(new CustomEvent(${eventName}));
        }`;
  const next = source.slice(0, start) + replacement + source.slice(end + PROXY_END.length);
  if (next.includes(PROXY_START) || next.includes("proxyScript.append")) {
    throw new Error("Dark Reader inline proxy injection is still present");
  }
  return next;
}

export function createDarkReaderPlugin(darkReaderPath) {
  const source = readFileSync(darkReaderPath, "utf8");
  const patched = replaceInlineProxy(source);
  const injectProxySource = extractInjectProxy(source);
  return {
    name: "omareader-dark-reader",
    setup(build) {
      build.onResolve({ filter: /^darkreader$/ }, () => ({ path: darkReaderPath }));
      build.onResolve({ filter: /^omareader-inject-proxy$/ }, () => ({
        path: "omareader-inject-proxy.js",
        namespace: "omareader-proxy",
      }));
      build.onLoad({ filter: /[\\/]darkreader\.mjs$/ }, () => ({
        contents: patched,
        loader: "js",
      }));
      build.onLoad({ filter: /.*/, namespace: "omareader-proxy" }, () => ({
        contents: `${injectProxySource}\nexport { injectProxy };\n`,
        loader: "js",
      }));
    },
  };
}
