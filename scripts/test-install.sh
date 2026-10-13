#!/usr/bin/env bash
# Exercise the release checksum without touching the real home directory.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
WORK="$(mktemp -d)"
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/good" "$WORK/bad" "$WORK/bare"
printf 'good-crx\n' > "$WORK/good/omareader.crx"
sha256sum "$WORK/good/omareader.crx" > "$WORK/good/omareader.crx.sha256"
printf 'bad-crx\n' > "$WORK/bad/omareader.crx"
printf '0000000000000000000000000000000000000000000000000000000000000000  omareader.crx\n' > "$WORK/bad/omareader.crx.sha256"
printf 'bare-crx\n' > "$WORK/bare/omareader.crx"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK" >/tmp/omareader-install-test.log 2>&1 &
SERVER_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -o /dev/null "http://127.0.0.1:${PORT}/good/omareader.crx"; then
    break
  fi
  sleep 0.1
done

BIN="$WORK/bin"
mkdir -p "$BIN"
cat > "$BIN/omarchy-default-browser" <<'EOF'
#!/bin/bash
printf '%s\n' "${OMAREADER_TEST_BROWSER:-chromium}"
EOF
cat > "$BIN/xdg-settings" <<'EOF'
#!/bin/bash
if [[ "${1:-}" == "get" && "${2:-}" == "default-web-browser" ]]; then
  printf '%s\n' "${OMAREADER_TEST_DESKTOP:-brave-origin.desktop}"
  exit 0
fi
exit 1
EOF
cat > "$BIN/sudo" <<'EOF'
#!/bin/bash
printf '%s\n' sudo-called >> "${OMAREADER_SUDO_LOG:?}"
exit 99
EOF
chmod +x "$BIN/omarchy-default-browser" "$BIN/xdg-settings" "$BIN/sudo"

run_install() {
  local home="$1"
  local url="$2"
  local browser="${3:-chromium}"
  mkdir -p "$home"
  HOME="$home" \
    XDG_CONFIG_HOME="$home/.config" \
    OMAREADER_SYSTEM=no \
    OMAREADER_SUDO_LOG="$WORK/sudo-called" \
    OMAREADER_CRX_URL="$url" \
    OMAREADER_TEST_BROWSER="$browser" \
    PATH="$BIN:$PATH" \
    "$ROOT/install.sh"
}

install_into() {
  local home="$1"
  local url="$2"
  run_install "$home" "$url" chromium
}

good_home="$WORK/home-good"
install_into "$good_home" "http://127.0.0.1:${PORT}/good/omareader.crx" >/tmp/omareader-install-good.out
cmp "$WORK/good/omareader.crx" "$good_home/.local/share/omareader/omareader.crx"
test -f "$good_home/.config/chromium/External Extensions/mhglniaepbokfgnpeennihlifandcgjh.json"

bare_home="$WORK/home-bare"
set +e
install_into "$bare_home" "http://127.0.0.1:${PORT}/bare/omareader.crx" >/tmp/omareader-install-bare.out 2>/tmp/omareader-install-bare.err
status=$?
set -e
test "$status" -ne 0
grep -q "No checksum published" /tmp/omareader-install-bare.err
test ! -e "$bare_home/.local/share/omareader/omareader.crx"
test ! -e "$bare_home/.local/share/omareader/omareader.crx.partial"

bad_home="$WORK/home-bad"
set +e
run_install "$bad_home" "http://127.0.0.1:${PORT}/bad/omareader.crx" chromium >/tmp/omareader-install-bad.out 2>/tmp/omareader-install-bad.err
status=$?
set -e
test "$status" -ne 0
grep -q "Checksum mismatch" /tmp/omareader-install-bad.err
test ! -e "$bad_home/.local/share/omareader/omareader.crx"
test ! -e "$bad_home/.local/share/omareader/omareader.crx.partial"

echo "install checksums checked"

EXT_JSON="mhglniaepbokfgnpeennihlifandcgjh.json"
HOST_JSON="com.bhp.omareader.json"
GOOD_URL="http://127.0.0.1:${PORT}/good/omareader.crx"

seed_browsers() {
  local home="$1"
  mkdir -p \
    "$home/.config/chromium" \
    "$home/.config/BraveSoftware/Brave-Browser" \
    "$home/.config/BraveSoftware/Brave-Origin" \
    "$home/.config/microsoft-edge" \
    "$home/.config/google-chrome"
}

assert_only() {
  local home="$1"
  local expect="$2"
  local rel
  for rel in \
    ".config/chromium" \
    ".config/BraveSoftware/Brave-Browser" \
    ".config/BraveSoftware/Brave-Origin" \
    ".config/microsoft-edge" \
    ".config/google-chrome"
  do
    if [[ "$rel" == "$expect" ]]; then
      test -f "$home/$rel/NativeMessagingHosts/$HOST_JSON"
    else
      test ! -e "$home/$rel/NativeMessagingHosts"
      test ! -e "$home/$rel/External Extensions"
    fi
  done
  test ! -e "$WORK/sudo-called"
}

brave_home="$WORK/home-brave"
seed_browsers "$brave_home"
run_install "$brave_home" "$GOOD_URL" brave >/tmp/omareader-install-brave.out
assert_only "$brave_home" ".config/BraveSoftware/Brave-Browser"
test -f "$brave_home/.config/BraveSoftware/Brave-Browser/External Extensions/$EXT_JSON"

edge_home="$WORK/home-edge"
seed_browsers "$edge_home"
run_install "$edge_home" "$GOOD_URL" edge >/tmp/omareader-install-edge.out
assert_only "$edge_home" ".config/microsoft-edge"
test -f "$edge_home/.config/microsoft-edge/External Extensions/$EXT_JSON"

chrome_home="$WORK/home-chrome"
seed_browsers "$chrome_home"
run_install "$chrome_home" "$GOOD_URL" chrome >/tmp/omareader-install-chrome.out
assert_only "$chrome_home" ".config/google-chrome"
test ! -e "$chrome_home/.config/google-chrome/External Extensions/$EXT_JSON"
grep -q "sudo install -Dm644" /tmp/omareader-install-chrome.out
grep -q "/usr/share/omareader/omareader.crx" /tmp/omareader-install-chrome.out
grep -q "/usr/share/google-chrome/extensions/" /tmp/omareader-install-chrome.out

FALLBACK="$WORK/bin-fallback"
mkdir -p "$FALLBACK"
for cmd in bash env python3 curl install sha256sum cut head tr mkdir cat chmod mktemp dirname rm mv; do
  ln -sf "$(command -v "$cmd")" "$FALLBACK/$cmd"
done
cp "$BIN/xdg-settings" "$BIN/sudo" "$FALLBACK/"
chmod +x "$FALLBACK/xdg-settings" "$FALLBACK/sudo"
origin_home="$WORK/home-origin"
seed_browsers "$origin_home"
HOME="$origin_home" \
  XDG_CONFIG_HOME="$origin_home/.config" \
  OMAREADER_SYSTEM=no \
  OMAREADER_SUDO_LOG="$WORK/sudo-called" \
  OMAREADER_CRX_URL="$GOOD_URL" \
  OMAREADER_TEST_DESKTOP="brave-origin.desktop" \
  PATH="$FALLBACK" \
  "$ROOT/install.sh" >/tmp/omareader-install-origin.out
assert_only "$origin_home" ".config/BraveSoftware/Brave-Origin"
test -f "$origin_home/.config/BraveSoftware/Brave-Origin/External Extensions/$EXT_JSON"

zen_home="$WORK/home-zen"
set +e
run_install "$zen_home" "$GOOD_URL" zen >/tmp/omareader-install-zen.out 2>/tmp/omareader-install-zen.err
status=$?
set -e
test "$status" -ne 0
grep -q "Chromium-based" /tmp/omareader-install-zen.err
test ! -e "$zen_home/.local/share/omareader"

echo "default browser install checked"

quote_home="$WORK/say\"hi"
mkdir -p "$quote_home"
run_install "$quote_home" "$GOOD_URL" chromium >/tmp/omareader-install-quote.out
python3 - "$quote_home" <<'PY'
import json
import sys
from pathlib import Path

home = Path(sys.argv[1])
host = json.loads((home / ".config/chromium/NativeMessagingHosts/com.bhp.omareader.json").read_text())
ext = json.loads((home / ".config/chromium/External Extensions/mhglniaepbokfgnpeennihlifandcgjh.json").read_text())
share = home / ".local/share/omareader"
assert host["path"] == str(share / "omareader-host")
assert host["allowed_origins"] == ["chrome-extension://mhglniaepbokfgnpeennihlifandcgjh/"]
assert ext["external_crx"] == str(share / "omareader.crx")
assert ext["external_version"]
PY
echo "quoted home json checked"

printf 'remote-crx\n' > "$WORK/remote-crx-body"
REMOTE_SHA="$(sha256sum "$WORK/remote-crx-body" | cut -d' ' -f1)"
REMOTE_SRC="$WORK/remote-src"
mkdir -p "$REMOTE_SRC"
cp "$ROOT/install.sh" "$REMOTE_SRC/install.sh"
CURL_BIN="$WORK/bin-remote"
mkdir -p "$CURL_BIN"
cat > "$CURL_BIN/curl" <<'EOF'
#!/bin/bash
set -euo pipefail
out=""
url=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-o" ]]; then
    out="$arg"
    prev=""
    continue
  fi
  case "$arg" in
    -o) prev="-o" ;;
    -*) ;;
    *) url="$arg" ;;
  esac
done
printf '%s\n' "$url" >> "${OMAREADER_CURL_LOG:?}"
write_out() {
  if [[ -n "$out" ]]; then
    cat > "$out"
  else
    cat
  fi
}
mode="${OMAREADER_CURL_MODE:-ok}"
if [[ "$mode" == "fail" ]]; then
  exit 1
fi
case "$url" in
  *api.github.com/repos/badenpiland/omareader/releases/latest*)
    printf '%s\n' '{"tag_name":"v9.9.9"}' | write_out
    ;;
  */host/omareader-host)
    printf '%s\n' '#!/usr/bin/env python3' | write_out
    ;;
  */package.json)
    version="${OMAREADER_CURL_VERSION:-9.9.9}"
    printf '{"version":"%s"}\n' "$version" | write_out
    ;;
  *.sha256)
    printf '%s  omareader.crx\n' "${OMAREADER_CURL_SHA:?}" | write_out
    ;;
  *omareader.crx)
    printf 'remote-crx\n' | write_out
    ;;
  *)
    printf 'unexpected url %s\n' "$url" >&2
    exit 1
    ;;
esac
EOF
cat > "$CURL_BIN/mktemp" <<'EOF'
#!/bin/bash
set -euo pipefail
dir="$(/usr/bin/mktemp "$@")"
printf '%s\n' "$dir" >> "${OMAREADER_MKTEMP_LOG:?}"
printf '%s\n' "$dir"
EOF
chmod +x "$CURL_BIN/curl" "$CURL_BIN/mktemp"

run_remote() {
  local home="$1"
  shift
  mkdir -p "$home"
  : > "$WORK/curl.log"
  : > "$WORK/mktemp.log"
  HOME="$home" \
    XDG_CONFIG_HOME="$home/.config" \
    OMAREADER_SYSTEM=no \
    OMAREADER_SUDO_LOG="$WORK/sudo-called" \
    OMAREADER_TEST_BROWSER=chromium \
    OMAREADER_CURL_LOG="$WORK/curl.log" \
    OMAREADER_MKTEMP_LOG="$WORK/mktemp.log" \
    OMAREADER_CURL_SHA="$REMOTE_SHA" \
    PATH="$CURL_BIN:$BIN:$PATH" \
    "$@" \
    "$REMOTE_SRC/install.sh"
}

remote_home="$WORK/home-remote"
run_remote "$remote_home" >/tmp/omareader-install-remote.out
grep -q "api.github.com/repos/badenpiland/omareader/releases/latest" "$WORK/curl.log"
grep -q "/v9.9.9/host/omareader-host" "$WORK/curl.log"
grep -q "/releases/download/v9.9.9/omareader.crx" "$WORK/curl.log"
cmp "$WORK/remote-crx-body" "$remote_home/.local/share/omareader/omareader.crx"
test -s "$WORK/mktemp.log"
while IFS= read -r tmpdir; do
  test ! -e "$tmpdir"
done < "$WORK/mktemp.log"

ref_home="$WORK/home-ref"
run_remote "$ref_home" env OMAREADER_REF=v9.9.9 >/tmp/omareader-install-ref.out
grep -q "/v9.9.9/host/omareader-host" "$WORK/curl.log"
if grep -q "api.github.com" "$WORK/curl.log"; then
  echo "explicit ref still called the releases API" >&2
  exit 1
fi

mismatch_home="$WORK/home-mismatch"
set +e
run_remote "$mismatch_home" env OMAREADER_REF=v1.2.3 OMAREADER_CURL_VERSION=9.9.9 >/tmp/omareader-install-mismatch.out 2>/tmp/omareader-install-mismatch.err
status=$?
set -e
test "$status" -ne 0
grep -q "does not match" /tmp/omareader-install-mismatch.err
if grep -q "api.github.com" "$WORK/curl.log"; then
  echo "version mismatch still called the releases API" >&2
  exit 1
fi

fail_home="$WORK/home-fail"
set +e
run_remote "$fail_home" env OMAREADER_REF=v9.9.9 OMAREADER_CURL_MODE=fail >/tmp/omareader-install-fail.out 2>/tmp/omareader-install-fail.err
status=$?
set -e
test "$status" -ne 0
test -s "$WORK/mktemp.log"
while IFS= read -r tmpdir; do
  test ! -e "$tmpdir"
done < "$WORK/mktemp.log"

echo "remote release install checked"
