// SPDX-License-Identifier: MIT

// Firefox and Zen id. Temporary add-ons keep this id, so the native host
// manifest can name it in allowed_extensions. This is not the Chromium id.
export const GECKO_ID = "addon@omareader";

// MAIN-world content scripts arrived in Firefox 128. data_collection_permissions
// arrived in Firefox 140, which is what addons.mozilla.org checks. 140 still
// has the page-proxy world, so the minimum follows the data-collection key.
export const FIREFOX_MIN_VERSION = "140.0";

// Firefox for Android learned data_collection_permissions in 142. The native
// host is Linux desktop, so Android is not a target; this floor only keeps
// the manifest key inside a Firefox that understands it.
export const FIREFOX_ANDROID_MIN_VERSION = "142.0";

// New addons.mozilla.org extensions since 2025-11-03 must declare this.
// "none" is the only value: Omareader does not collect or transmit personal
// or browsing data. The daily fetches are a public site-fix list and this
// repo's release list.
export const FIREFOX_DATA_COLLECTION = { required: ["none"] };

export const FIREFOX_HOST_DESCRIPTION = "Omareader Omarchy theme host";

const GECKO_ID_PATTERN = /^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$/;

export function firefoxManifest(source) {
  if (!source || source.manifest_version !== 3) {
    throw new Error("Firefox manifest needs the Chromium manifest");
  }
  const worker = source.background?.service_worker;
  if (typeof worker !== "string" || worker.length === 0) {
    throw new Error("Firefox manifest needs a background service worker to mirror");
  }
  if (source.background.type !== "module") {
    throw new Error("Firefox background has to stay an ES module");
  }
  const manifest = structuredClone(source);
  // Chrome 120 rejects background.scripts. This object is the Firefox build only.
  // Firefox does not start background.service_worker (bug 1573659) and runs scripts
  // as an event page instead.
  delete manifest.key;
  delete manifest.minimum_chrome_version;
  manifest.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN_VERSION,
      data_collection_permissions: structuredClone(FIREFOX_DATA_COLLECTION),
    },
    gecko_android: {
      strict_min_version: FIREFOX_ANDROID_MIN_VERSION,
      data_collection_permissions: structuredClone(FIREFOX_DATA_COLLECTION),
    },
  };
  manifest.background = {
    scripts: [worker],
    type: "module",
  };
  return manifest;
}

export function firefoxHostManifest({ name, description, path, extensionId = GECKO_ID }) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("Firefox host manifest needs a name");
  }
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("Firefox host path must be absolute");
  }
  if (typeof extensionId !== "string" || !GECKO_ID_PATTERN.test(extensionId)) {
    throw new Error("Firefox host manifest needs a gecko id");
  }
  if (extensionId.includes("://")) {
    throw new Error("Firefox host manifest needs a gecko id");
  }
  return {
    name,
    description: description || FIREFOX_HOST_DESCRIPTION,
    path,
    type: "stdio",
    allowed_extensions: [extensionId],
  };
}
