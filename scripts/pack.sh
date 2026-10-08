#!/usr/bin/env bash
# Sign dist/ into release/omareader.crx. Requires the private key.pem, which is not in git.
# Refuses to generate a key: a new key would mint a new extension id.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/key.pem" ]]; then
  echo "Refusing to sign: $ROOT/key.pem is missing. Do not generate a new key." >&2
  exit 1
fi

EXPECTED="$(sed -n 's/^EXT_ID="\([^"]*\)"$/\1/p' "$ROOT/install.sh")"
if [[ -z "$EXPECTED" ]]; then
  echo "install.sh does not set EXT_ID." >&2
  exit 1
fi

chmod 600 "$ROOT/key.pem"
npm run build
EXT_ID="$(tr -d '[:space:]' < "$ROOT/extension-id")"
if [[ "$EXT_ID" != "$EXPECTED" ]]; then
  echo "Extension id is $EXT_ID, expected $EXPECTED. The signing key does not match this release." >&2
  exit 1
fi

for required in \
  "$ROOT/dist/LICENSE" \
  "$ROOT/dist/LICENSES/darkreader-MIT.txt" \
  "$ROOT/dist/content.js"
do
  if [[ ! -f "$required" ]]; then
    echo "Build is missing $required" >&2
    exit 1
  fi
done
if ! grep -q "Copyright (c) 2026 Dark Reader Ltd." "$ROOT/dist/content.js"; then
  echo "dist/content.js is missing the Dark Reader copyright notice." >&2
  exit 1
fi

PACK_PROFILE="$(mktemp -d)"
chromium \
  --user-data-dir="$PACK_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-gpu \
  --pack-extension="$ROOT/dist" \
  --pack-extension-key="$ROOT/key.pem"
rm -rf "$PACK_PROFILE"
rm -f "$ROOT/dist.pem"

mkdir -p "$ROOT/release"
mv "$ROOT/dist.crx" "$ROOT/release/omareader.crx"
echo "Packed $ROOT/release/omareader.crx ($EXT_ID)"
