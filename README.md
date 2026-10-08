# Omareader

Web pages use the Omarchy theme you already picked. Switch themes and the open tabs follow. 

![The same page in Harbor, then Tokyo Night, without a reload](docs/switch.gif)

## What it does

Omareader is a Chromium extension. A small Python program watches `~/.local/state/omarchy/current` and sends over the background, foreground, and selection color whenever `omarchy theme set` swaps that directory.

The painting is [Dark Reader](https://darkreader.org/)’s dynamic theme engine (`darkreader` 4.9.133, MIT, copyright Dark Reader Ltd). You do not install the Dark Reader extension. If that extension is on, the popup asks once before turning it off. Leaving it on means both extensions restyle the page.

Link and syntax colors stay on Dark Reader’s usual path. They are not replaced with the terminal’s red, green, and blue.

## Install

The installer registers Chromium, and any of Chrome, Brave, Brave Origin, and Edge that already have a config directory. The palette has to come from your machine, so it installs the extension and the native host together. The extension id is `mhglniaepbokfgnpeennihlifandcgjh`.

`install.sh` copies the host to `~/.local/share/omareader/` and downloads the signed extension for the version in `package.json`. It does not compile anything and it does not create a signing key.

## Limits

Per-site fixes from Dark Reader’s fix list are not included. `chrome://` pages and the Chrome Web Store cannot be themed. Zen is not wired up.

## Build from source

```bash
npm ci
npm run build
# then load dist/ as an unpacked extension (chrome://extensions, Developer mode, Load unpacked)
```

The extension id stays `mhglniaepbokfgnpeennihlifandcgjh`, so the native host still works. `scripts/pack.sh` prints the SHA-256 of the signed package. Publish that checksum with the release.

```bash
npm test
```

The public key in `src/manifest.json` pins the extension id. `key.pem` stays private and is how `scripts/pack.sh` signs `release/omareader.crx`. Do not generate a replacement key. A new key would publish a different extension id, and already-installed browsers would keep the old one.

The build refreshes `LICENSES/darkreader-MIT.txt` from `node_modules/darkreader/LICENSE` and copies it into the extension.

## Omarchy

This is a pre-release. Inclusion in Omarchy is suggested here: https://github.com/omacom/omarchy/discussions/14632

## License

MIT, see [LICENSE](LICENSE).

Bundles the Dark Reader engine (MIT, Copyright (c) Dark Reader Ltd.), see [LICENSES/darkreader-MIT.txt](LICENSES/darkreader-MIT.txt).
Icon derived from the Omarchy mark (MIT, Copyright (c) David Heinemeier Hansson), see [LICENSES/omarchy-MIT.txt](LICENSES/omarchy-MIT.txt).

Not affiliated with or endorsed by Dark Reader Ltd. or the Omarchy project.
