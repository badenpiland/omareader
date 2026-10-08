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

mapfile -t registered < <(python3 - "$HOST_NAME" "$HOST_DEST" "$EXT_ID" "$CRX_DEST" "$VERSION" <<'PY'
import json
import sys
from pathlib import Path

host_name, host_dest, ext_id, crx, version = sys.argv[1:]
home = Path.home()
chromium = home / ".config" / "chromium"
candidates = [
    chromium,
    home / ".config" / "google-chrome",
    home / ".config" / "google-chrome-beta",
    home / ".config" / "google-chrome-unstable",
    home / ".config" / "BraveSoftware" / "Brave-Browser",
    home / ".config" / "BraveSoftware" / "Brave-Browser-Beta",
    home / ".config" / "BraveSoftware" / "Brave-Browser-Nightly",
    home / ".config" / "BraveSoftware" / "Brave-Origin",
    home / ".config" / "microsoft-edge",
    home / ".config" / "microsoft-edge-dev",
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
for base in candidates:
    if base != chromium and not base.is_dir():
        continue
    host_dir = base / "NativeMessagingHosts"
    ext_dir = base / "External Extensions"
    host_dir.mkdir(parents=True, exist_ok=True)
    ext_dir.mkdir(parents=True, exist_ok=True)
    (host_dir / f"{host_name}.json").write_text(json.dumps(host_manifest, indent=2) + "\n")
    (ext_dir / f"{ext_id}.json").write_text(json.dumps(ext_manifest, indent=2) + "\n")
    print(base)
PY
)

echo "Omareader $VERSION ($EXT_ID) installed."
if ((${#registered[@]})); then
  echo "Registered for:"
  printf '  %s\n' "${registered[@]}"
else
  echo "No browser config directory was updated." >&2
  exit 1
fi
echo "Restart each of those browsers once. The first start turns the Dark Reader extension off so the two do not both restyle the page."
