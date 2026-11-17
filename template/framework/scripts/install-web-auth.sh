#!/usr/bin/env bash
# Install the pinned, unmodified Tinyauth (D87).
# Linux: the upstream release binary, checked against its pinned SHA-256.
# macOS: upstream publishes no build, so the pinned source archive is built once per
# machine with its locked dependencies and kept in the user's cache; every later project
# with the same pin copies it instead of building again.
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
  # One build per pinned version and source checksum: a new pin never reuses an old build.
  # The build's own SHA-256 is kept next to it and checked on every copy.
  cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/fyso/web-auth"
  cached="$cache_root/$FYSO_TINYAUTH_VERSION-$FYSO_TINYAUTH_SHA256-darwin-$arch/tinyauth"
  if [ ! -x "$cached" ] || [ ! -s "$cached.sha256" ]; then
    # Resolve the project's tools before entering upstream source: shims otherwise
    # discover the caller's global versions when mise runs tasks from nested folders.
    go_bin=$(mise which go)
    pnpm_bin=$(mise which pnpm)
    go_root=$("$go_bin" env GOROOT)
    mkdir -p "$cache_root"
    build=$(mktemp -d "$cache_root/build.XXXXXX")
    trap 'rm -rf "$build"' EXIT
    fetch "https://codeload.github.com/tinyauthapp/tinyauth/tar.gz/refs/tags/v$FYSO_TINYAUTH_VERSION" "$build/source.tar.gz"
    check_sha256 "$build/source.tar.gz" "$FYSO_TINYAUTH_SHA256"
    mkdir "$build/source"
    tar -xzf "$build/source.tar.gz" -C "$build/source" --strip-components=1
    cd "$build/source"
    # Go modules download while the frontend builds; both use the upstream lockfiles.
    CGO_ENABLED=0 GOTOOLCHAIN=local GOROOT="$go_root" "$go_bin" mod download & modules=$!
    (cd frontend && "$pnpm_bin" install --frozen-lockfile && "$pnpm_bin" run build)
    wait "$modules"
    cp -R frontend/dist internal/assets/dist
    CGO_ENABLED=0 GOTOOLCHAIN=local GOROOT="$go_root" "$go_bin" build -trimpath -ldflags "-X github.com/tinyauthapp/tinyauth/internal/model.Version=$FYSO_TINYAUTH_VERSION" \
      -o "$build/tinyauth" ./cmd/tinyauth
    mkdir -p "$(dirname "$cached")"
    node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' \
      "$build/tinyauth" > "$build/tinyauth.sha256"
    mv -f "$build/tinyauth" "$cached"
    mv -f "$build/tinyauth.sha256" "$cached.sha256"
  fi
  cp "$cached" "$destination/tinyauth.new"
  check_sha256 "$destination/tinyauth.new" "$(cat "$cached.sha256")" || { rm -f "$destination/tinyauth.new"; exit 1; }
  install_binary "$destination/tinyauth.new"
  ;;
*) fail "no Tinyauth build for $(uname -s)" ;;
esac
