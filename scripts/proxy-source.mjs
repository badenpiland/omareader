// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const TINT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "tint.js");
const CACHE_KEYS_START = "const themeCacheKeys = [";
const MODIFY_CALL = "const modified = modifyHSL(hsl, pole, anotherPole);";

// Every color Dark Reader modifies goes through modifyColorWithCache. Its HSL
// result is handed to tint.js with the theme's hue list, which rides on the
// theme options as omareaderHues and is part of the color cache key.
export function addThemeHues(source, tintPath = TINT_PATH) {
  if (!source.includes(CACHE_KEYS_START)) {
    throw new Error("Dark Reader themeCacheKeys was not found");
  }
  if (source.split(MODIFY_CALL).length !== 2) {
    throw new Error("Dark Reader modifyColorWithCache call was not found once");
  }
  const next = source
    .replace(CACHE_KEYS_START, `${CACHE_KEYS_START}\n    "omareaderHues",`)
    .replace(
      MODIFY_CALL,
      "const modified = omareaderTintHsl(modifyHSL(hsl, pole, anotherPole), theme.omareaderHues, hsl);",
    );
  return `import { tintHsl as omareaderTintHsl } from ${JSON.stringify(tintPath)};\n${next}`;
}

// darkreader.mjs has CRLF line endings.
const ITERATE_RULES_START = /( {4}forEach\(rules, \(rule\) => \{\r?\n)( {8}if \(isStyleRule\(rule\)\) \{)/g;

// CSS nesting puts declarations that follow a nested rule into a
// CSSNestedDeclarations rule. It has a style but no selector, so Dark Reader
// 4.9.133 skips it: a variable defined there is never themed, and every
// var(--darkreader-…) that refers to it is left undefined. A border or
// background written with that variable then drops out, and the page shifts.
// HEY defines its colors this way. Each such rule is handed to Dark Reader as
// "&" inside its parent rule, which is what it means.
const NESTED_DECLARATIONS = `const omareaderNestedRules = new WeakMap();
function omareaderNestedDeclarations(rule) {
    if (
        !rule ||
        rule.selectorText ||
        !rule.style ||
        typeof CSSNestedDeclarations === "undefined" ||
        !(rule instanceof CSSNestedDeclarations)
    ) {
        return rule;
    }
    let nested = omareaderNestedRules.get(rule);
    if (!nested) {
        nested = {
            selectorText: "&",
            style: rule.style,
            get cssText() {
                return \`& { \${rule.style.cssText} }\`;
            },
            parentRule: rule.parentRule,
            parentStyleSheet: rule.parentStyleSheet
        };
        omareaderNestedRules.set(rule, nested);
    }
    return nested;
}
`;

export function addNestedDeclarations(source) {
  if ((source.match(ITERATE_RULES_START) || []).length !== 1) {
    throw new Error("Dark Reader iterateCSSRules loop was not found once");
  }
  const patched = source.replace(
    ITERATE_RULES_START,
    (_, loop, styleCheck) => `${loop}        rule = omareaderNestedDeclarations(rule);\n${styleCheck}`,
  );
  return `${NESTED_DECLARATIONS}${patched}`;
}

export function createDarkReaderPlugin(darkReaderPath) {
  const source = readFileSync(darkReaderPath, "utf8");
  const patched = addThemeHues(addNestedDeclarations(replaceInlineProxy(source)));
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
