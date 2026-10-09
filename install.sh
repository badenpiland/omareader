#!/usr/bin/env bash
# Install the prebuilt Omareader extension and its native host.
# Does not compile, and does not create a signing key.
set -euo pipefail

HOST_NAME="com.bhp.omareader"
EXT_ID="mhglniaepbokfgnpeennihlifandcgjh"
REPO="badenpiland/omareader"
REF="${OMAREADER_REF:-main}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SHARE="$HOME/.local/share/omareader"
HOST_DEST="$SHARE/omareader-host"
CRX_DEST="$SHARE/omareader.crx"
CHROME_JSON="$SHARE/google-chrome-extension.json"
CHROME_CRX="/usr/share/omareader/omareader.crx"
CHROME_EXT="/usr/share/google-chrome/extensions/${EXT_ID}.json"

default_browser() {
  local desktop
  if command -v omarchy-default-browser >/dev/null 2>&1; then
    omarchy-default-browser | head -n 1 | tr -d '[:space:]'
    return
  fi
  if ! command -v xdg-settings >/dev/null 2>&1; then
    echo "Could not find omarchy-default-browser or xdg-settings." >&2
    exit 1
  fi
  desktop="$(env -u BROWSER xdg-settings get default-web-browser | head -n 1 | tr -d '[:space:]')"
  case "$desktop" in
    chromium.desktop) printf '%s\n' chromium ;;
    google-chrome.desktop) printf '%s\n' chrome ;;
    brave-browser.desktop) printf '%s\n' brave ;;
    brave-origin.desktop) printf '%s\n' brave-origin ;;
    microsoft-edge.desktop) printf '%s\n' edge ;;
    firefox.desktop) printf '%s\n' firefox ;;
    zen.desktop) printf '%s\n' zen ;;
    *) printf '%s\n' "$desktop" ;;
  esac
}

BROWSER_ID="$(default_browser)"
case "$BROWSER_ID" in
  chromium) BROWSER_BASE="$CONFIG_HOME/chromium"; PRETTY="Chromium" ;;
  brave) BROWSER_BASE="$CONFIG_HOME/BraveSoftware/Brave-Browser"; PRETTY="Brave" ;;
  brave-origin) BROWSER_BASE="$CONFIG_HOME/BraveSoftware/Brave-Origin"; PRETTY="Brave Origin" ;;
  edge) BROWSER_BASE="$CONFIG_HOME/microsoft-edge"; PRETTY="Edge" ;;
  chrome) BROWSER_BASE="$CONFIG_HOME/google-chrome"; PRETTY="Chrome" ;;
  firefox | zen)
    echo "Omareader is for Chromium-based browsers. The default browser is ${BROWSER_ID}." >&2
    exit 1
    ;;
  *)
    echo "Omareader does not recognize the default browser: ${BROWSER_ID}" >&2
    exit 1
    ;;
esac

read_version() {
  python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$1"
}

script_path=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_path="${BASH_SOURCE[0]}"
elif [[ -f "$0" ]]; then
  script_path="$0"
fi

ROOT=""
if [[ -n "$script_path" ]]; then
  ROOT="$(cd -- "$(dirname -- "$script_path")" && pwd)"
fi

mkdir -p "$SHARE"
if [[ -n "$ROOT" && -f "$ROOT/host/omareader-host" && -f "$ROOT/package.json" ]]; then
  VERSION="$(read_version "$ROOT/package.json")"
  install -m 755 "$ROOT/host/omareader-host" "$HOST_DEST"
else
  echo "Installing Omareader from https://github.com/${REPO}"
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/omareader-host" "https://raw.githubusercontent.com/${REPO}/${REF}/host/omareader-host"
  curl -fsSL --retry 3 -o "$tmp/package.json" "https://raw.githubusercontent.com/${REPO}/${REF}/package.json"
  VERSION="$(read_version "$tmp/package.json")"
  install -m 755 "$tmp/omareader-host" "$HOST_DEST"
  rm -rf "$tmp"
  ROOT=""
fi

download_crx() {
  local url="$1"
  echo "Downloading $url"
  curl -fL --retry 3 -o "$CRX_DEST.partial" "$url"
  if sums="$(curl -fsSL --retry 3 "$url.sha256")"; then
    expected="${sums%% *}"
    actual="$(sha256sum "$CRX_DEST.partial" | cut -d' ' -f1)"
    if [[ "$expected" != "$actual" ]]; then
      rm -f "$CRX_DEST.partial"
      echo "Checksum mismatch for $url" >&2
      exit 1
    fi
  else
    echo "Warning: no $url.sha256 published; skipping checksum." >&2
  fi
  mv "$CRX_DEST.partial" "$CRX_DEST"
  chmod 644 "$CRX_DEST"
}

if [[ -n "${OMAREADER_CRX:-}" ]]; then
  install -m 644 "$OMAREADER_CRX" "$CRX_DEST"
elif [[ -n "${OMAREADER_CRX_URL:-}" ]]; then
  download_crx "$OMAREADER_CRX_URL"
elif [[ -f "$ROOT/omareader.crx" ]]; then
  install -m 644 "$ROOT/omareader.crx" "$CRX_DEST"
elif [[ -f "$ROOT/release/omareader.crx" ]]; then
  install -m 644 "$ROOT/release/omareader.crx" "$CRX_DEST"
else
  download_crx "https://github.com/${REPO}/releases/download/v${VERSION}/omareader.crx"
fi

mkdir -p "$BROWSER_BASE/NativeMessagingHosts"
cat > "$BROWSER_BASE/NativeMessagingHosts/${HOST_NAME}.json" <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Omareader Omarchy theme host",
  "path": "${HOST_DEST}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${EXT_ID}/"]
}
EOF

write_extension() {
  local crx_path="$1"
  local dest="$2"
  mkdir -p "$(dirname -- "$dest")"
  cat > "$dest" <<EOF
{
  "external_crx": "${crx_path}",
  "external_version": "${VERSION}"
}
EOF
}

chrome_accepted() {
  local choice
  case "${OMAREADER_SYSTEM:-ask}" in
    yes) return 0 ;;
    no) return 1 ;;
  esac
  if [[ ! -r /dev/tty ]]; then
    return 1
  fi
  printf '%s' "Google Chrome only loads extensions from a system folder. Use sudo to add Omareader there? [y/N] " >/dev/tty
  if ! IFS= read -r choice </dev/tty; then
    return 1
  fi
  case "$choice" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ "$BROWSER_ID" == "chrome" ]]; then
  write_extension "$CHROME_CRX" "$CHROME_JSON"
  if chrome_accepted; then
    sudo install -Dm644 "$CRX_DEST" "$CHROME_CRX"
    sudo install -Dm644 "$CHROME_JSON" "$CHROME_EXT"
  else
    echo "sudo install -Dm644 ${CRX_DEST} ${CHROME_CRX}"
    echo "sudo install -Dm644 ${CHROME_JSON} ${CHROME_EXT}"
  fi
else
  write_extension "$CRX_DEST" "$BROWSER_BASE/External Extensions/${EXT_ID}.json"
fi

echo "Omareader ${VERSION} (${EXT_ID}) installed for ${PRETTY}."
echo "Restart ${PRETTY}. If Dark Reader is installed and on, Omareader asks before turning it off."
