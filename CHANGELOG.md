# Changelog

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
