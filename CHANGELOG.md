# Changelog

## 0.4.0 — 2026-11-23

### Changed

- Page colors take on the Omarchy theme’s own colors. A blue button becomes the theme’s blue, a red badge the theme’s red, and so on, matched by hue in OKLCH. Lightness stays as Dark Reader set it, so contrast does not change, and colors the page drew as grays are left alone. The native host now also sends the theme’s named colors.
- The popup is cleaner. It has two switches: "everywhere", and the site in the tab by its short name, such as "github". Each sits right while on. Each switch shows its shortcut as a tooltip on hover or keyboard focus. The theme name sits under the wordmark, and the site-fix toggle and version line share the bottom row. The Details panel with the theme's hex colors is gone.
- The popup uses the font Omarchy set as the system monospace font, and follows `omarchy-font-set` without a browser restart. The wordmark stays in Omarchy Font.
- The popup shows the glasses logo beside the wordmark, light glasses on a light theme. The version line is shorter: "v0.3.1 ✓" when up to date, "v0.3.1 → v0.4.0" when a newer release is out.

### Performance

- Finding a page's site fix is about 8 times faster (3.6 ms to 0.4 ms a lookup over 20,000 test URLs, with identical answers). Each site's URL patterns are prepared once instead of on every lookup.

### Fixed

- Sites late in the alphabet lost their fixes once the daily site-fix download arrived. Removing remote `url()`s from the downloaded list misread a `url(` quoted inside a selector and dropped the rest of the file, so Wikipedia's wordmark, for one, showed as dark text on a dark page. The cleanup now works one line at a time and only touches CSS, and every site keeps its fixes.
- The shortcuts swap: Alt+Shift+U (universal) now disables or enables Omareader everywhere, and Alt+Shift+O (one site) the current site. Both flash ON or OFF on the toolbar badge. Shortcuts you set yourself at `chrome://extensions/shortcuts` stay as they are.
- The popup now really uses the Omarchy monospace font. Chromium gives extension pages a sans-serif body font of its own, which hid the font the popup set. A font change also shows without a browser restart now. Chromium keeps the fontconfig rules it read at startup, which map every monospace family to the font set back then, so the host now also sends the face's full and PostScript names and the popup loads the face by name with CSS `local()`. Each font is also scaled to the same small x-height, so a wide or tall font doesn't make the popup text look bigger than another.
- Browser pages such as chrome://extensions no longer count as a site. The popup used to offer to pause "extensions" there, and Alt+Shift+O paused it.
- Hovering a popup switch no longer moves anything. The shortcut used to appear on hover and push the controls down. It is now a tooltip that floats over the popup.

## 0.3.1 — 2026-10-15

### Fixed

- After an update, the popup no longer offers an older release. A release found while an earlier version was installed is dropped, and the release check runs again.

### Security

- The published `omareader.crx.sha256` names only `omareader.crx`. It no longer includes a local path from the machine that packed the release.

## 0.3.0 — 2026-10-15

### Added

- Alt+Shift+U pauses the current site, or themes it again. Alt+Shift+O still turns Omareader on or off. The toolbar badge flashes ON or OFF. Pausing a site switches that tab's toolbar icon to the light glasses, and theming it again switches the icon back. The site toggle does not flash a badge.
- The popup shows the installed version on one line. After a finished release check that found nothing newer, it adds “Up to date”. When a release is newer, it links “Update to” that version.
- The README has the Omareader wordmark and glasses mark, in dark and light versions, release and license badges, an Omarchy link to omarchy.org, and a Shortcuts section.

### Changed

- The popup is redesigned. The `omareader` title is centered, with no logo. Two full-width outline buttons turn Omareader off or on everywhere, and pause or theme this site. Each shows its shortcut keys on hover or keyboard focus. Each button greys out when its own setting is off, and stays clickable. The site button has a pause icon.
- The popup's Details section lists the site, background, and foreground, with the labels on the left ending in colons and the values on the right. The daily site-fix setting moved into Details as “Fetch site fixes daily”.

### Fixed

- The popup asks about turning Dark Reader off only when the Dark Reader extension is installed and enabled. Before, it also asked when Omareader could not see other extensions, including in Brave with no Dark Reader installed.
- Theming a page no longer inserts an inline script. A page whose CSP is `script-src 'self'` no longer reports that error. The Dark Reader stylesheet proxy runs from the extension instead.

## 0.2.2 — 2026-10-13

### Fixed

- Packed extension failed to start, host-message.js was missing.

## 0.2.1 — 2026-10-13

### Security

- A stylesheet from another host is fetched with no cookies and no redirects, and only `text/css` is accepted. Localhost, private and link-local addresses, and names ending in `.local`, `.lan`, `.home.arpa`, `.ts.net`, or `.internal` are refused.
- The daily site-fix list is pinned to Dark Reader 4.9.133. A downloaded list drops `@import` and any `url()` that is not a `data:` URL. The bundled list is unchanged.
- `install.sh` installs the native host and the extension from the latest GitHub release, and it stops when the CRX has no checksum.
- The native host reads at most 64 KiB of `colors.toml` or `theme.name`.

### Fixed

- The popup keeps a theme name to 100 characters.
- While the theme host is connected, the extension does not wake every minute to reconnect.

## 0.2.0 — 2026-10-09

### Added

- The popup says when the installed version is older than a GitHub release, including pre-releases, and links the available version to the repo.

### Fixed

- Text that would disappear into the theme background is drawn in the theme foreground.
- Stylesheets served from another host are read, so the theme reaches pages such as Amazon.
- The Amazon header wordmark stays light on a dark theme. Its orange smile is unchanged.

## 0.1.6 — 2026-10-08

### Changed

- The one-liner installs Omareader into the current default browser only. Chromium, Brave, Brave Origin, and Edge load on restart. Chrome asks once for sudo. Firefox and Zen are not supported.

## 0.1.5 — 2026-10-08

### Added

- The page background is painted with the theme color before Dark Reader initializes.
- The popup says where the daily site-fix list comes from, and “Update site fixes daily” can turn that download off.
- GitHub Actions lints with ESLint and Ruff, then runs the tests and the build.

### Changed

- The extension auto-installs only for Chromium and Brave Origin. Other Chromium-family browsers still get the native host when their config directory already exists, and the extension is installed by hand.
- Permission to manage extensions is requested only when you choose to turn Dark Reader off.
- The native host waits on theme changes instead of polling.

### Fixed

- A content script stops reconnecting after its extension context is gone.
- Reconnecting to the native host backs off from one second to one minute.
- State changes are accepted only from Omareader’s own extension pages.
- A native message that is not valid UTF-8 does not stop the host from answering the next hello.
- A theme file missing for less than a second during `omarchy theme set` is not reported as an error.

### Security

- `install.sh` checks a downloaded crx against the published `.sha256` and deletes the partial file when they differ. A release with no checksum file warns and still installs.
