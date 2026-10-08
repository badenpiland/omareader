#!/usr/bin/env bash
# Install the prebuilt Omareader extension and its native host.
# Does not compile, and does not create a signing key.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
HOST_NAME="com.bhp.omareader"
EXT_ID="mhglniaepbokfgnpeennihlifandcgjh"
REPO="badenpiland/omareader"
SHARE="$HOME/.local/share/omareader"
HOST_DEST="$SHARE/omareader-host"
CRX_DEST="$SHARE/omareader.crx"

if [[ ! -f "$ROOT/host/omareader-host" ]]; then
  echo "Missing $ROOT/host/omareader-host. Clone the repository, then run ./install.sh from it." >&2
  exit 1
fi

VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/package.json")"

mkdir -p "$SHARE"
install -m 755 "$ROOT/host/omareader-host" "$HOST_DEST"

if [[ -n "${OMAREADER_CRX:-}" ]]; then
  install -m 644 "$OMAREADER_CRX" "$CRX_DEST"
elif [[ -f "$ROOT/omareader.crx" ]]; then
  install -m 644 "$ROOT/omareader.crx" "$CRX_DEST"
elif [[ -f "$ROOT/release/omareader.crx" ]]; then
  install -m 644 "$ROOT/release/omareader.crx" "$CRX_DEST"
else
  url="https://github.com/${REPO}/releases/download/v${VERSION}/omareader.crx"
  echo "Downloading $url"
  curl -fL --retry 3 -o "$CRX_DEST.partial" "$url"
  mv "$CRX_DEST.partial" "$CRX_DEST"
  chmod 644 "$CRX_DEST"
fi

python3 - "$HOST_NAME" "$HOST_DEST" "$EXT_ID" "$CRX_DEST" "$VERSION" <<'PY'
import json
import sys
from pathlib import Path

host_name, host_dest, ext_id, crx, version = sys.argv[1:]
home = Path.home()
# Per-user External Extensions is honored by Chromium-branded builds. Chrome and
# Edge were not installed on the machine where this was checked. Brave Origin
# was: a restart loaded the crx from its per-user External Extensions folder.
# The other Brave channels were not installed, so they are not on the auto list.
auto_extension = {
    "Chromium",
    "Brave Origin",
}
browsers = [
    ("Chromium", home / ".config" / "chromium"),
    ("Chrome", home / ".config" / "google-chrome"),
    ("Chrome beta", home / ".config" / "google-chrome-beta"),
    ("Chrome unstable", home / ".config" / "google-chrome-unstable"),
    ("Brave", home / ".config" / "BraveSoftware" / "Brave-Browser"),
    ("Brave beta", home / ".config" / "BraveSoftware" / "Brave-Browser-Beta"),
    ("Brave nightly", home / ".config" / "BraveSoftware" / "Brave-Browser-Nightly"),
    ("Brave Origin", home / ".config" / "BraveSoftware" / "Brave-Origin"),
    ("Edge", home / ".config" / "microsoft-edge"),
    ("Edge dev", home / ".config" / "microsoft-edge-dev"),
]
host_manifest = {
    "name": host_name,
    "description": "Omareader Omarchy theme host",
    "path": host_dest,
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{ext_id}/"],
}
ext_manifest = {
    "external_crx": crx,
    "external_version": version,
}
extension_names = []
host_names = []
for name, base in browsers:
    if name != "Chromium" and not base.is_dir():
        continue
    host_dir = base / "NativeMessagingHosts"
    host_dir.mkdir(parents=True, exist_ok=True)
    (host_dir / f"{host_name}.json").write_text(json.dumps(host_manifest, indent=2) + "\n")
    host_names.append(name)
    if name in auto_extension:
        ext_dir = base / "External Extensions"
        ext_dir.mkdir(parents=True, exist_ok=True)
        (ext_dir / f"{ext_id}.json").write_text(json.dumps(ext_manifest, indent=2) + "\n")
        extension_names.append(name)
        continue
    print(
        f"{name}: native host registered. Install the extension manually: "
        f"chrome://extensions → Developer mode → drag {crx} in (or Load unpacked dist/)."
    )

if not host_names:
    print("No browser config directory was updated.", file=sys.stderr)
    sys.exit(1)
print(f"Omareader {version} ({ext_id}) installed.")
print("Extension auto-install registered for:")
for name in extension_names:
    print(f"  {name}")
print("Native host registered for:")
for name in host_names:
    print(f"  {name}")
PY
echo "Restart Chromium and Brave Origin once. Other browsers need the manual extension install above, then one restart. If Dark Reader is installed and on, Omareader asks before turning it off."
