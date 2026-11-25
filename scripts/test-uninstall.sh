#!/usr/bin/env bash
# Install into a few browsers in a throwaway home, then uninstall.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

EXT_JSON="mhglniaepbokfgnpeennihlifandcgjh.json"
HOST_JSON="com.bhp.omareader.json"
HOME_DIR="$WORK/home"
CONFIG="$HOME_DIR/.config"
printf 'crx\n' > "$WORK/omareader.crx"

BIN="$WORK/bin"
mkdir -p "$BIN"
cat > "$BIN/sudo" <<'EOS'
#!/bin/bash
printf '%s\n' sudo-called >> "${OMAREADER_SUDO_LOG:?}"
exit 99
EOS
chmod +x "$BIN/sudo"

run() {
  HOME="$HOME_DIR" \
    XDG_CONFIG_HOME="$CONFIG" \
    OMAREADER_SYSTEM=no \
    OMAREADER_SUDO_LOG="$WORK/sudo-called" \
    OMAREADER_CRX="$WORK/omareader.crx" \
    PATH="$BIN:$PATH" \
    "$@"
}

mkdir -p "$CONFIG"
for browser in chromium brave brave-origin edge chrome; do
  run env OMAREADER_BROWSER="$browser" "$ROOT/install.sh" >/dev/null
done
# A picker's separate instance, and files that are not Omareader's.
mkdir -p "$CONFIG/brave-work/External Extensions" "$CONFIG/brave-work/NativeMessagingHosts"
cp "$CONFIG/chromium/External Extensions/$EXT_JSON" "$CONFIG/brave-work/External Extensions/$EXT_JSON"
cp "$CONFIG/chromium/NativeMessagingHosts/$HOST_JSON" "$CONFIG/brave-work/NativeMessagingHosts/$HOST_JSON"
printf '{}\n' > "$CONFIG/chromium/External Extensions/other.json"
printf '{}\n' > "$CONFIG/chromium/NativeMessagingHosts/other.json"
mkdir -p "$HOME_DIR/.local/share/other"

test -f "$CONFIG/BraveSoftware/Brave-Origin/External Extensions/$EXT_JSON"
test -f "$HOME_DIR/.local/share/omareader/omareader-host"

run "$ROOT/uninstall.sh" >"$WORK/out"
grep -q "Omareader uninstalled" "$WORK/out"
for dir in chromium BraveSoftware/Brave-Browser BraveSoftware/Brave-Origin microsoft-edge google-chrome brave-work; do
  test ! -e "$CONFIG/$dir/External Extensions/$EXT_JSON"
  test ! -e "$CONFIG/$dir/NativeMessagingHosts/$HOST_JSON"
done
test ! -e "$HOME_DIR/.local/share/omareader"
test -f "$CONFIG/chromium/External Extensions/other.json"
test -f "$CONFIG/chromium/NativeMessagingHosts/other.json"
test -d "$HOME_DIR/.local/share/other"
test ! -e "$WORK/sudo-called"

# A second run finds nothing and still succeeds.
run "$ROOT/uninstall.sh" >"$WORK/out2"
grep -q "Nothing to remove" "$WORK/out2"

echo "uninstall checked"
