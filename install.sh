#!/usr/bin/env bash
# Install the prebuilt Omareader extension and its native host.
# Does not compile, and does not create a signing key.
set -euo pipefail

tmp=""
cleanup() {
  if [[ -n "${tmp}" ]]; then
    rm -rf "${tmp}"
  fi
}
trap cleanup EXIT

HOST_NAME="com.bhp.omareader"
EXT_ID="mhglniaepbokfgnpeennihlifandcgjh"
REPO="badenpiland/omareader"
REF="${OMAREADER_REF:-}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SHARE="$HOME/.local/share/omareader"
HOST_DEST="$SHARE/omareader-host"
CRX_DEST="$SHARE/omareader.crx"
CHROME_JSON="$SHARE/google-chrome-extension.json"
CHROME_CRX="/usr/share/omareader/omareader.crx"
CHROME_EXT="/usr/share/google-chrome/extensions/${EXT_ID}.json"

# A browser id for a launcher command: chromium, chrome, brave, brave-origin,
# edge, firefox or zen. Anything else prints nothing.
browser_for_command() {
  case "${1##*/}" in
    chromium) printf '%s\n' chromium ;;
    google-chrome-stable | google-chrome) printf '%s\n' chrome ;;
    brave-origin) printf '%s\n' brave-origin ;;
    brave | brave-browser) printf '%s\n' brave ;;
    microsoft-edge-stable | microsoft-edge) printf '%s\n' edge ;;
    firefox) printf '%s\n' firefox ;;
    zen-browser | zen) printf '%s\n' zen ;;
  esac
}

browser_for_desktop() {
  case "$1" in
    chromium.desktop) printf '%s\n' chromium ;;
    google-chrome.desktop) printf '%s\n' chrome ;;
    brave-browser.desktop) printf '%s\n' brave ;;
    brave-origin.desktop) printf '%s\n' brave-origin ;;
    microsoft-edge.desktop) printf '%s\n' edge ;;
    firefox.desktop) printf '%s\n' firefox ;;
    zen.desktop) printf '%s\n' zen ;;
  esac
}

# A browser picker, such as omapicker's brave-pick.desktop, is the default
# browser but starts a real browser itself. Follow its Exec= line: the command
# may be the browser, or a short script that runs one.
browser_behind_desktop() {
  local desktop="$1" dir file exec_line command line word found
  local -a words
  local dirs="${XDG_DATA_HOME:-$HOME/.local/share}:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
  local IFS=:
  for dir in $dirs; do
    if [[ -f "$dir/applications/$desktop" ]]; then
      file="$dir/applications/$desktop"
      break
    fi
  done
  unset IFS
  [[ -n "${file:-}" ]] || return 0
  while IFS= read -r line; do
    if [[ "$line" == Exec=* ]]; then
      exec_line="${line#Exec=}"
      break
    fi
  done < "$file"
  [[ -n "${exec_line:-}" ]] || return 0
  read -r command _ <<< "$exec_line"
  [[ "$command" == env ]] && read -r _ command _ <<< "$exec_line"
  found="$(browser_for_command "$command")"
  if [[ -n "$found" ]]; then
    printf '%s\n' "$found"
    return 0
  fi
  if [[ "$command" != */* ]]; then
    command="$(command -v -- "$command" 2>/dev/null || true)"
  fi
  [[ -f "$command" && -r "$command" ]] || return 0
  # A script: the first browser command it runs. brave-origin is checked
  # before brave, so the longer name wins.
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    read -r -a words <<< "$line"
    for word in "${words[@]}"; do
      word="${word//\"/}"
      found="$(browser_for_command "$word")"
      if [[ -n "$found" ]]; then
        printf '%s\n' "$found"
        return 0
      fi
    done
  done < <(head -c 65536 -- "$command" 2>/dev/null | tr -d '\0')
}

default_browser() {
  local desktop found
  if [[ -n "${OMAREADER_BROWSER:-}" ]]; then
    printf '%s\n' "$OMAREADER_BROWSER"
    return
  fi
  if command -v omarchy-default-browser >/dev/null 2>&1; then
    desktop="$(omarchy-default-browser | head -n 1 | tr -d '[:space:]')"
  elif command -v xdg-settings >/dev/null 2>&1; then
    desktop="$(env -u BROWSER xdg-settings get default-web-browser | head -n 1 | tr -d '[:space:]')"
  else
    echo "Could not find omarchy-default-browser or xdg-settings." >&2
    exit 1
  fi
  # omarchy-default-browser already names the browser; xdg-settings gives a desktop file.
  if [[ "$desktop" != *.desktop ]]; then
    printf '%s\n' "$desktop"
    return
  fi
  found="$(browser_for_desktop "$desktop")"
  if [[ -z "$found" ]]; then
    found="$(browser_behind_desktop "$desktop")"
  fi
  printf '%s\n' "${found:-$desktop}"
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
    echo "Set OMAREADER_BROWSER to the browser to install into: chromium, chrome, brave, brave-origin or edge." >&2
    echo "For example: curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | OMAREADER_BROWSER=brave-origin bash" >&2
    exit 1
    ;;
esac

read_version() {
  python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$1"
}

latest_release_tag() {
  python3 -c 'import json, re, sys
data = json.load(sys.stdin)
tag = data.get("tag_name")
if not isinstance(tag, str) or re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", tag) is None:
    sys.stderr.write("latest release tag is not a version\n")
    raise SystemExit(1)
sys.stdout.write(tag + "\n")'
}

write_host_json() {
  local dest="$1"
  mkdir -p "$(dirname -- "$dest")"
  python3 - "$dest" "$HOST_NAME" "$HOST_DEST" "$EXT_ID" <<'PY'
import json
import sys

dest, name, path, ext_id = sys.argv[1:5]
with open(dest, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "name": name,
            "description": "Omareader Omarchy theme host",
            "path": path,
            "type": "stdio",
            "allowed_origins": [f"chrome-extension://{ext_id}/"],
        },
        handle,
        indent=2,
    )
    handle.write("\n")
PY
}

write_extension() {
  local crx_path="$1"
  local dest="$2"
  mkdir -p "$(dirname -- "$dest")"
  python3 - "$dest" "$crx_path" "$VERSION" <<'PY'
import json
import sys

dest, crx_path, version = sys.argv[1:4]
with open(dest, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "external_crx": crx_path,
            "external_version": version,
        },
        handle,
        indent=2,
    )
    handle.write("\n")
PY
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
  if [[ -z "$REF" ]]; then
    # releases/latest omits pre-releases, so the published release has to be a normal one.
    REF="$(curl -fsSL --retry 3 "https://api.github.com/repos/${REPO}/releases/latest" | latest_release_tag)"
  fi
  echo "Installing Omareader ${REF} from https://github.com/${REPO}"
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/omareader-host" "https://raw.githubusercontent.com/${REPO}/${REF}/host/omareader-host"
  curl -fsSL --retry 3 -o "$tmp/package.json" "https://raw.githubusercontent.com/${REPO}/${REF}/package.json"
  VERSION="$(read_version "$tmp/package.json")"
  if [[ "$REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ && "$REF" != "v${VERSION}" ]]; then
    echo "Release tag ${REF} does not match package version ${VERSION}." >&2
    exit 1
  fi
  install -m 755 "$tmp/omareader-host" "$HOST_DEST"
  ROOT=""
fi

download_crx() {
  local url="$1"
  echo "Downloading $url"
  curl -fL --retry 3 -o "$CRX_DEST.partial" "$url"
  if ! sums="$(curl -fsSL --retry 3 "$url.sha256")"; then
    rm -f "$CRX_DEST.partial"
    echo "No checksum published for $url" >&2
    exit 1
  fi
  expected="${sums%% *}"
  actual="$(sha256sum "$CRX_DEST.partial" | cut -d' ' -f1)"
  if [[ "$expected" != "$actual" ]]; then
    rm -f "$CRX_DEST.partial"
    echo "Checksum mismatch for $url" >&2
    exit 1
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

write_host_json "$BROWSER_BASE/NativeMessagingHosts/${HOST_NAME}.json"

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
  # A browser started with --user-data-dir, as a picker's separate instances
  # are, reads extensions from "External Extensions" in that folder, so the
  # one above never updates it. Update every such folder that already has
  # Omareader. This never adds Omareader anywhere new.
  for data_dir in "$CONFIG_HOME"/*/; do
    data_dir="${data_dir%/}"
    [[ "$data_dir" == "$BROWSER_BASE" ]] && continue
    # Chrome only loads system-wide external extensions, which take sudo.
    [[ "${data_dir##*/}" == google-chrome* ]] && continue
    [[ -f "$data_dir/Local State" ]] || continue
    for profile_ext in "$data_dir"/*/Extensions/"$EXT_ID"; do
      if [[ -d "$profile_ext" ]]; then
        write_extension "$CRX_DEST" "$data_dir/External Extensions/${EXT_ID}.json"
        echo "Also updated the browser using ${data_dir}."
        break
      fi
    done
  done
fi

echo "Omareader ${VERSION} (${EXT_ID}) installed for ${PRETTY}."
echo "Restart ${PRETTY}. If Dark Reader is installed and on, Omareader asks before turning it off."
