#!/usr/bin/env bash
# Remove what install.sh added, for every browser, not only the default one.
# Browsers drop an external extension on their next start once its file is gone.
set -euo pipefail

HOST_NAME="com.bhp.omareader"
EXT_ID="mhglniaepbokfgnpeennihlifandcgjh"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SHARE="$HOME/.local/share/omareader"
CHROME_SHARE="/usr/share/omareader"
CHROME_EXT="/usr/share/google-chrome/extensions/${EXT_ID}.json"

removed=0

remove() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    rm -rf -- "$path"
    echo "Removed $path"
    removed=$((removed + 1))
  fi
}

# Every browser data folder: ~/.config/chromium, ~/.config/BraveSoftware/Brave-Origin,
# and any folder a picker passes with --user-data-dir. Only Omareader's own
# files are removed, so a folder that is not a browser's is left as it was.
shopt -s nullglob
for data_dir in "$CONFIG_HOME"/*/ "$CONFIG_HOME"/*/*/; do
  data_dir="${data_dir%/}"
  remove "$data_dir/External Extensions/${EXT_ID}.json"
  remove "$data_dir/NativeMessagingHosts/${HOST_NAME}.json"
done
shopt -u nullglob

remove "$SHARE"

system_accepted() {
  local choice
  case "${OMAREADER_SYSTEM:-ask}" in
    yes) return 0 ;;
    no) return 1 ;;
  esac
  if [[ ! -r /dev/tty ]]; then
    return 1
  fi
  printf '%s' "Omareader is in Google Chrome's system folder. Use sudo to remove it? [y/N] " >/dev/tty
  if ! IFS= read -r choice </dev/tty; then
    return 1
  fi
  case "$choice" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -e "$CHROME_EXT" || -e "$CHROME_SHARE" ]]; then
  if system_accepted; then
    sudo rm -rf -- "$CHROME_EXT" "$CHROME_SHARE"
    echo "Removed $CHROME_EXT and $CHROME_SHARE"
    removed=$((removed + 1))
  else
    echo "Omareader is still in Google Chrome's system folder. To remove it, run:"
    echo "sudo rm -rf ${CHROME_EXT} ${CHROME_SHARE}"
  fi
fi

if [[ "$removed" -eq 0 ]]; then
  echo "Omareader's installer files were not found. Nothing to remove."
else
  echo "Omareader uninstalled. Restart your browser to finish."
fi
echo "If you added omareader.crx by hand, remove it from your browser's extensions page."
