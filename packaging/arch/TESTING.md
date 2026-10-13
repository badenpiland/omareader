# omareader-bin 0.2.0-1 on pitwr

Tested 2026-10-13. `npm test` in the repo passed. The package was installed with `pacman -U` from the local build.

Per-user `install.sh` files were moved, not deleted, to `~/omareader-installsh-backup-2026-10-13/`. `com.omarchy.*` and Proton Pass host files were left in place.

Each browser below was a new throwaway profile, then that window was closed. Brave and Brave Origin were already open and were not restarted. Those two sessions were still running `~/.local/share/omareader/omareader-host` from before the move. They pick up `/usr/lib/omareader/omareader-host` on the next full restart.

`location` 2 is Chromium's external-install location. An empty `disable_reasons` list means the browser did not leave the extension disabled.

| Browser | Installed package | Extension | Host manifest actually opened | Page restyle |
|---|---|---|---|---|
| Chromium | `chromium` 152.0.7977.82-1 | Omareader 0.2.0, id `mhglniaepbokfgnpeennihlifandcgjh`, location 2, disable reasons empty, service worker running | `/etc/chromium/native-messaging-hosts/com.bhp.omareader.json` and `/usr/share/chromium/extensions/<id>.json` | Yes. example.com went from Theme Liftoff `rgb(21, 30, 38)` to Tokyo Night `rgb(26, 27, 38)` and back. Theme restored to Theme Liftoff. Host was `/usr/lib/omareader/omareader-host`. |
| Chrome | `google-chrome` 154.0.8037.97-1 | Same id, version, location, and empty disable reasons | `/etc/opt/chrome/native-messaging-hosts/com.bhp.omareader.json` and `/usr/share/google-chrome/extensions/<id>.json` | Host started from `/usr/lib/omareader/omareader-host`. A second pixel read was not captured. |
| Brave | `brave-bin` 1:1.96.61-1 | Same id, version, location, and empty disable reasons | `/usr/share/chromium/extensions/<id>.json` and `/etc/opt/chrome/native-messaging-hosts/com.bhp.omareader.json`. It did not open `/etc/brave/native-messaging-hosts/` or `/etc/chromium/native-messaging-hosts/`. | Host started from `/usr/lib/omareader/omareader-host`. A second pixel read was not captured. |
| Brave Origin | `brave-origin-bin` 1:1.96.61-1 | Same id, version, location, and empty disable reasons. Service worker was running. | Same files as Brave. | Host started from `/usr/lib/omareader/omareader-host`. A second pixel read was not captured. |
| Edge | `microsoft-edge-stable-bin` 154.0.4258.53-1 | Same id, version, location, and empty disable reasons | `/etc/opt/edge/native-messaging-hosts/com.bhp.omareader.json` and `/usr/share/microsoft-edge/extensions/<id>.json` | Host started from `/usr/lib/omareader/omareader-host`. A second pixel read was not captured. |

`omarchy-chromium-bin` is not installed. No browser was installed for this test.

Brave and Brave Origin read `/etc/opt/chrome/native-messaging-hosts/com.bhp.omareader.json`. They did not open `/etc/brave/native-messaging-hosts/` or `/etc/chromium/native-messaging-hosts/`. `pkgrel` 2 drops `/etc/brave/native-messaging-hosts` from the package. The Chrome host file stays, and that is the one those two browsers use.

Upgrade: `makepkg -sf` built `omareader-bin-0.2.0-2-any.pkg.tar.zst`. `namcap` reported nothing on the recipe or the package. `pacman -U` upgraded 0.2.0-1 to 0.2.0-2 and removed `/etc/brave/native-messaging-hosts/com.bhp.omareader.json`. `pacman -R omareader-bin` then removed the package. These paths were gone afterward: the host script, the CRX, the three extension JSON files, the Chromium, Chrome, and Edge host JSON files, the Brave host JSON file, and the three license files. The directories that had held them were gone too. `pacman -U` installed 0.2.0-2 again for daily use. `pacman -Q` reports `omareader-bin 0.2.0-2`.
