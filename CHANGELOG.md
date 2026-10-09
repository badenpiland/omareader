# Changelog

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
