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

install_into() {
  local home="$1"
  local url="$2"
  mkdir -p "$home"
  HOME="$home" OMAREADER_CRX_URL="$url" "$ROOT/install.sh"
}

good_home="$WORK/home-good"
install_into "$good_home" "http://127.0.0.1:${PORT}/good/omareader.crx" >/tmp/omareader-install-good.out
cmp "$WORK/good/omareader.crx" "$good_home/.local/share/omareader/omareader.crx"
test -f "$good_home/.config/chromium/External Extensions/mhglniaepbokfgnpeennihlifandcgjh.json"

bare_home="$WORK/home-bare"
install_into "$bare_home" "http://127.0.0.1:${PORT}/bare/omareader.crx" >/tmp/omareader-install-bare.out 2>/tmp/omareader-install-bare.err
cmp "$WORK/bare/omareader.crx" "$bare_home/.local/share/omareader/omareader.crx"
grep -q "skipping checksum" /tmp/omareader-install-bare.err

bad_home="$WORK/home-bad"
set +e
HOME="$bad_home" OMAREADER_CRX_URL="http://127.0.0.1:${PORT}/bad/omareader.crx" "$ROOT/install.sh" >/tmp/omareader-install-bad.out 2>/tmp/omareader-install-bad.err
status=$?
set -e
test "$status" -ne 0
grep -q "Checksum mismatch" /tmp/omareader-install-bad.err
test ! -e "$bad_home/.local/share/omareader/omareader.crx"
test ! -e "$bad_home/.local/share/omareader/omareader.crx.partial"

echo "install checksums checked"
