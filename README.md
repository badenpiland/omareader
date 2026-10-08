# Omareader

Chromium extension that restyles web pages with the active Omarchy palette. Open tabs repaint when `omarchy theme set` swaps that theme.

![Omareader in a dark theme](mockups/icon-dark.png)
![Omareader in a light theme](mockups/icon-light.png)

It bundles [Dark Reader](https://darkreader.org/)’s dynamic theme engine (`darkreader` 4.9.133, MIT, copyright Dark Reader Ltd). The Dark Reader extension does not need to be installed. Omareader turns that extension off the first time it starts, because two copies of the engine fight over the page. Turn it back on from `chrome://extensions` if you want it, and turn Omareader off.

Light themes stay light. Harbor, for example, paints pages toward its paper background. Images are not color-inverted. Link and syntax colors stay on Dark Reader’s usual path. They are not replaced with the terminal’s red, green, and blue.

The scheme is background, foreground, and the selection color from `~/.local/state/omarchy/current/theme/colors.toml`.

## Install

Chromium, and any other Chromium-family browser that already has a config directory on this machine (Chrome, Brave, Brave Origin, Edge). This is not a Chrome Web Store install. The palette comes from a small Python native host, so the extension and the host are installed together.

```bash
git clone https://github.com/badenpiland/omareader.git
cd omareader
./install.sh
```

Restart the browser once. The extension id is `mhglniaepbokfgnpeennihlifandcgjh`.

`install.sh` copies the host to `~/.local/share/omareader/` and downloads the signed extension for the version in `package.json`. It does not compile anything and it does not create a signing key.

## Limits

Per-site fixes from Dark Reader’s fix list are not included. `chrome://` pages and the Chrome Web Store cannot be themed. Zen is not wired up.

## Develop

```bash
npm install
npm test
npm run build
```

The public key in `src/manifest.json` pins the extension id. `key.pem` stays private and is how `scripts/pack.sh` signs `release/omareader.crx`. Do not generate a replacement key. A new key would publish a different extension id, and already-installed browsers would keep the old one.

Dark Reader’s license is `LICENSES/darkreader-MIT.txt`. The build copies it into the extension package.
