# Releasing

1. Bump the version in `package.json` and `src/manifest.json`, and add a `CHANGELOG.md` entry.
2. Build and sign:

   ```bash
   npm ci
   npm run build
   scripts/pack.sh
   ```

   `scripts/pack.sh` writes `release/omareader.crx` and `release/omareader.crx.sha256`.
3. Publish a GitHub release tagged `vX.Y.Z` with both files attached. `install.sh` refuses to install when the `.sha256` file is missing.
4. Comment on the Omarchy suggestion, [omacom/omarchy discussion 14632](https://github.com/omacom/omarchy/discussions/14632), with the version, the install command, and any behavior change that matters for inclusion. Correct the original post if a claim there is no longer true.

## Signing key

The public key in `src/manifest.json` pins the extension id `mhglniaepbokfgnpeennihlifandcgjh`. `key.pem` stays private and is what `scripts/pack.sh` signs with. Do not generate a replacement key: a new key publishes a different extension id, and installed browsers would keep the old one.

## CI

GitHub Actions runs the lint, the tests and the build on every push and pull request. It does not sign a release.

The build refreshes `LICENSES/darkreader-MIT.txt` from `node_modules/darkreader/LICENSE` and copies it into the extension.

## Installing from a checkout

`./install.sh` from a checkout installs that checkout's native host and, if `release/omareader.crx` exists, that extension.
