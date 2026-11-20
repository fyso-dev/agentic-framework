#!/usr/bin/env bash
# Install the pinned, unmodified Tinyauth (D87).
# Linux: the upstream release binary, checked against its pinned SHA-256.
# macOS: upstream publishes no build. The installer app bundles one built from the pinned
# source; without it the source is built once. Either way it is kept in the user's cache,
# keyed by version and source checksum, and later projects with the same pin copy it.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env FYSO_DATA FYSO_TINYAUTH_VERSION FYSO_TINYAUTH_SHA256
destination="$FYSO_DATA/web-auth/bin"
if [ -x "$destination/tinyauth" ] && [ "$(cat "$destination/version" 2>/dev/null)" = "$FYSO_TINYAUTH_VERSION" ]; then exit 0; fi
umask 077
mkdir -p "$destination"
# check_sha256 <file> <expected-hex>
check_sha256() {
  node - "$1" "$2" <<'JS'
const fs = require('node:fs'), crypto = require('node:crypto');
if (crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex') !== process.argv[3]) {
  console.error('Tinyauth checksum mismatch: ' + process.argv[2]); process.exit(1);
}
JS
}
install_binary() {
  chmod 700 "$1"
  mv -f "$1" "$destination/tinyauth"
  printf '%s\n' "$FYSO_TINYAUTH_VERSION" > "$destination/version"
}
fetch() { curl --fail --silent --show-error --location --proto '=https' "$1" -o "$2"; }

case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) fail "no Tinyauth build for this processor: $(uname -m)" ;;
esac

case "$(uname -s)" in
Linux)
  if [ "$arch" = amd64 ]; then expected=${FYSO_TINYAUTH_LINUX_AMD64_SHA256:-}; else expected=${FYSO_TINYAUTH_LINUX_ARM64_SHA256:-}; fi
  [ -n "$expected" ] || fail "no pinned checksum for the Linux $arch Tinyauth binary in mise.toml"
  fetch "https://github.com/tinyauthapp/tinyauth/releases/download/v$FYSO_TINYAUTH_VERSION/tinyauth-$arch" "$destination/tinyauth.download"
  check_sha256 "$destination/tinyauth.download" "$expected" || { rm -f "$destination/tinyauth.download"; exit 1; }
  install_binary "$destination/tinyauth.download"
  ;;
Darwin)
  # One copy per pinned version and source checksum: a new pin never reuses an old binary.
  # The binary's own SHA-256 is kept next to it and checked on every copy.
  cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/fyso/web-auth"
  cached="$cache_root/$FYSO_TINYAUTH_VERSION-$FYSO_TINYAUTH_SHA256-darwin/tinyauth"
  if [ ! -x "$cached" ] || [ ! -s "$cached.sha256" ]; then
    mkdir -p "$cache_root"
    build=$(mktemp -d "$cache_root/build.XXXXXX")
    trap 'rm -rf "$build"' EXIT
    bin=${FYSO_TINYAUTH_BUNDLED_BIN:-} meta=${FYSO_TINYAUTH_BUNDLED_META:-}
    # The installer app bundles a universal binary built from this same pinned source.
    if [ -n "$bin" ] && [ -f "$bin" ] && [ -f "$meta/version" ] \
      && [ "$(cat "$meta/version")" = "$FYSO_TINYAUTH_VERSION" ] \
      && [ "$(cat "$meta/source.sha256" 2>/dev/null)" = "$FYSO_TINYAUTH_SHA256" ] \
      && cp "$bin" "$build/tinyauth" && check_sha256 "$build/tinyauth" "$(cat "$meta/tinyauth.sha256" 2>/dev/null)"; then
      echo "Using the web login bundled with the installer (Tinyauth $FYSO_TINYAUTH_VERSION)"
    else
      [ -z "$bin" ] || echo "The bundled web login does not match this project's pin; building it from source" >&2
      rm -f "$build/tinyauth"
      # Fallback: build the pinned source with its locked dependencies. The build tools are
      # pinned in mise.toml and installed only here, the first time a Mac needs them.
      mise install "core:go@$FYSO_TINYAUTH_GO" "core:pnpm@$FYSO_TINYAUTH_PNPM" >&2
      go_bin="$(mise where "core:go@$FYSO_TINYAUTH_GO")/bin/go"
      pnpm_bin=$(mise exec "core:pnpm@$FYSO_TINYAUTH_PNPM" -- sh -c 'command -v pnpm')
      go_root=$("$go_bin" env GOROOT)
      fetch "https://codeload.github.com/tinyauthapp/tinyauth/tar.gz/refs/tags/v$FYSO_TINYAUTH_VERSION" "$build/source.tar.gz"
      check_sha256 "$build/source.tar.gz" "$FYSO_TINYAUTH_SHA256"
      mkdir "$build/source"
      tar -xzf "$build/source.tar.gz" -C "$build/source" --strip-components=1
      (
        cd "$build/source"
        # Go modules download while the frontend builds; both use the upstream lockfiles.
        CGO_ENABLED=0 GOTOOLCHAIN=local GOROOT="$go_root" "$go_bin" mod download & modules=$!
        (cd frontend && "$pnpm_bin" install --frozen-lockfile && "$pnpm_bin" run build)
        wait "$modules"
        cp -R frontend/dist internal/assets/dist
        CGO_ENABLED=0 GOTOOLCHAIN=local GOROOT="$go_root" "$go_bin" build -trimpath -tags nomsgpack -ldflags "-s -w -X github.com/tinyauthapp/tinyauth/internal/model.Version=$FYSO_TINYAUTH_VERSION" \
          -o "$build/tinyauth" ./cmd/tinyauth
      )
    fi
    mkdir -p "$(dirname "$cached")"
    node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' \
      "$build/tinyauth" > "$build/tinyauth.sha256"
    chmod 700 "$build/tinyauth"
    mv -f "$build/tinyauth" "$cached"
    mv -f "$build/tinyauth.sha256" "$cached.sha256"
  fi
  cp "$cached" "$destination/tinyauth.new"
  check_sha256 "$destination/tinyauth.new" "$(cat "$cached.sha256")" || { rm -f "$destination/tinyauth.new"; exit 1; }
  install_binary "$destination/tinyauth.new"
  ;;
*) fail "no Tinyauth build for $(uname -s)" ;;
esac
