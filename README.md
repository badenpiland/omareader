<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="mockups/icon-dark.png">
    <img alt="" src="mockups/icon-light.png" width="64" height="64" align="middle">
  </picture>
  &nbsp;
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.png">
    <img alt="Omareader" src="docs/banner-light.png" width="520" height="94" align="middle">
  </picture>
</p>

<p align="center"><sub>Omarchy themes for the web</sub></p>

<p align="center">
  <a href="https://github.com/badenpiland/omareader/releases"><img alt="Release" src="https://img.shields.io/github/v/release/badenpiland/omareader?style=flat-square&label=release&color=9ece6a&labelColor=1a1b26"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/badenpiland/omareader?style=flat-square&label=license&color=9ece6a&labelColor=1a1b26"></a>
  <a href="https://omarchy.org"><img alt="Omarchy" src="https://img.shields.io/badge/Omarchy-omarchy.org-9ece6a?style=flat-square&labelColor=1a1b26&logo=omarchy&logoColor=9ece6a"></a>
</p>

Omareader is a browser extension that repaints every web page in your current [Omarchy](https://omarchy.org) theme and follows along when you switch themes.

![Switching Omarchy themes while Omareader recolors the page live](docs/switch.gif)

## Features

- **Live theme sync.** Pages recolor the moment you run `omarchy theme set`.
- **Theme colors.** Page colors snap to your theme's own palette, so links, buttons and highlights match the rest of your desktop.
- **Readable everywhere.** Built on [Dark Reader](https://darkreader.org)'s engine and site fixes, bundled. You don't need the Dark Reader extension.
- **Per-site control.** Turn it off everywhere or just for the site you're on.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/badenpiland/omareader/main/install.sh | bash
```

Then restart your browser.

The installer picks your Omarchy default browser. It supports Chromium, Chrome, Brave, Brave Origin and Edge. To choose one yourself, set `OMAREADER_BROWSER` to `chromium`, `chrome`, `brave`, `brave-origin` or `edge`:

```bash
curl -fsSL https://raw.githubusercontent.com/badenpiland/omareader/main/install.sh | OMAREADER_BROWSER=brave-origin bash
```

Chrome only loads extensions from a system folder, so the installer asks for `sudo` once.

The installer downloads the signed extension and a small native host from the [latest release](https://github.com/badenpiland/omareader/releases/latest) and verifies its checksum. The native host reads your theme from `~/.local/state/omarchy/current`.

## Usage

Click the toolbar icon to open the popup. It has two switches:

- **everywhere** turns Omareader on or off for every site.
- **the current site** (such as "github") turns it on or off for that site only.

| Shortcut | Action |
| --- | --- |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> | Toggle everywhere (**u**niversal) |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> | Toggle the current site (**o**ne site) |

These swapped places in 0.4.0. Change them at `chrome://extensions/shortcuts`.

If the Dark Reader extension is also on, Omareader offers to turn it off, since both would restyle the page.

## Update

The popup shows when a new version is out. Run the install command again and restart your browser.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/badenpiland/omareader/main/uninstall.sh | bash
```

Then restart your browser. It removes Omareader from every browser the installer added it to. For Chrome, it asks for `sudo` once.

## Privacy

Omareader reads and restyles the pages you visit, which is why it asks for access to all sites. It sends no page data anywhere. Once a day it fetches two files, without cookies:

- Dark Reader's [site-fix list](https://github.com/darkreader/darkreader/blob/92637d8c3fbb210853c005e3f25dbbec46dd21fc/src/config/dynamic-theme-fixes.config), pinned to a known commit. Remote images and imports are stripped from it. Turn this off in the popup.
- This repo's [releases](https://github.com/badenpiland/omareader/releases), to tell you about updates.

## Limitations

- `chrome://` pages and the Chrome Web Store can't be themed.
- Firefox and Zen aren't supported yet. Support is coming in a future version.

## Troubleshooting

- **Nothing changes after installing.** Restart the browser fully. Brave and Chromium pick up the extension only on restart.
- **The browser refuses the extension.** Once a browser has refused it, it won't accept the installer again. Install `omareader.crx` from the [latest release](https://github.com/badenpiland/omareader/releases/latest) by hand once, remove it, then run the install command again.

## Development

```bash
npm ci
npm run build   # load dist/ as an unpacked extension
npm run lint
npm test
```

Release steps are in [docs/releasing.md](docs/releasing.md).

## License

[MIT](LICENSE).

Omareader bundles the [Dark Reader](https://github.com/darkreader/darkreader) engine (MIT, © Dark Reader Ltd.), see [LICENSES/darkreader-MIT.txt](LICENSES/darkreader-MIT.txt). The icon is derived from the Omarchy mark (MIT, © David Heinemeier Hansson), see [LICENSES/omarchy-MIT.txt](LICENSES/omarchy-MIT.txt). The popup wordmark is set in Omarchy Font (MIT, © 2026 Mark Cuda), see [LICENSES/omarchy-font-MIT.txt](LICENSES/omarchy-font-MIT.txt).

Not affiliated with or endorsed by Dark Reader Ltd. or the Omarchy project.
