// SPDX-License-Identifier: MIT
import { injectProxy } from "omareader-inject-proxy";
import { watchProxyDocument } from "./page-proxy-install.js";

// Main-world content script. enable() no longer inserts an inline script.
watchProxyDocument(document, injectProxy);
