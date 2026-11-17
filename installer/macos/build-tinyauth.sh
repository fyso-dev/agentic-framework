#!/usr/bin/env bash
# Bundle the web login (Tinyauth) in the app (D87): upstream publishes no macOS binary, so
# build the pinned, unmodified source once per pin (arm64 + x86_64, joined with lipo) and
# ship it with its license and source note. Pins come from template/mise.toml.jinja.
# Usage: build-tinyauth.sh <Fyso.app>        bundle it and record its checksum
#        build-tinyauth.sh --record <Fyso.app>  record the checksum again (after codesign
#        changes the binary); the installer copies the binary only when it matches.
set -euo pipefail
cd "$(dirname "$0")"
record() { shasum -a 256 "$1/Contents/Helpers/tinyauth" | cut -d' ' -f1 > "$1/Contents/Resources/third-party/tinyauth/tinyauth.sha256"; }
if [ "${1:-}" = --record ]; then record "$2"; exit 0; fi
APP=$1
pin() { sed -n "s/^$1 = \"\\([^\"]*\\)\".*/\\1/p" ../../template/mise.toml.jinja; }
tool() { sed -n "s/^\"$1\" = \"\\([^\"]*\\)\".*/\\1/p" ../../template/mise.toml.jinja; }
VERSION=$(pin FYSO_TINYAUTH_VERSION) SOURCE_SHA256=$(pin FYSO_TINYAUTH_SHA256)
GO=$(pin FYSO_TINYAUTH_GO) PNPM=$(pin FYSO_TINYAUTH_PNPM) NODE=$(tool core:node)
[ -n "$VERSION" ] && [ -n "$SOURCE_SHA256" ] && [ -n "$GO" ] && [ -n "$PNPM" ] && [ -n "$NODE" ] || { echo "Tinyauth pins not found in template/mise.toml.jinja" >&2; exit 1; }
SOURCE_URL="https://codeload.github.com/tinyauthapp/tinyauth/tar.gz/refs/tags/v$VERSION"
cache="$PWD/.cache/tinyauth-$VERSION-$SOURCE_SHA256"
if [ ! -x "$cache/tinyauth" ]; then
  work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
  curl -fsSL --proto '=https' "$SOURCE_URL" -o "$work/source.tar.gz"
  echo "$SOURCE_SHA256  $work/source.tar.gz" | shasum -a 256 -c - >/dev/null
  mkdir "$work/source"; tar -xzf "$work/source.tar.gz" -C "$work/source" --strip-components=1
  run() { mise exec "core:go@$GO" "core:pnpm@$PNPM" "core:node@$NODE" -- "$@"; }
  (cd "$work/source/frontend" && run pnpm install --frozen-lockfile && run pnpm run build)
  cp -R "$work/source/frontend/dist" "$work/source/internal/assets/dist"
  for arch in arm64 amd64; do
    (cd "$work/source" && CGO_ENABLED=0 GOOS=darwin GOARCH=$arch GOTOOLCHAIN=local run go build -trimpath -tags nomsgpack \
      -ldflags "-s -w -X github.com/tinyauthapp/tinyauth/internal/model.Version=$VERSION" -o "$work/tinyauth-$arch" ./cmd/tinyauth)
  done
  mkdir -p "$cache"
  lipo -create "$work/tinyauth-arm64" "$work/tinyauth-amd64" -output "$cache/tinyauth.new"
  cp "$work/source/LICENSE" "$cache/LICENSE"
  mv "$cache/tinyauth.new" "$cache/tinyauth"
fi
# The binary is a Mach-O: it goes with the other helpers, where signing finds it.
mkdir -p "$APP/Contents/Helpers" "$APP/Contents/Resources/third-party/tinyauth"
cp "$cache/tinyauth" "$APP/Contents/Helpers/tinyauth"
meta="$APP/Contents/Resources/third-party/tinyauth"
cp "$cache/LICENSE" "$meta/LICENSE"
printf '%s\n' "$VERSION" > "$meta/version"
printf '%s\n' "$SOURCE_SHA256" > "$meta/source.sha256"
cat > "$meta/SOURCE.md" <<NOTE
# Tinyauth $VERSION

Contents/Helpers/tinyauth is Tinyauth $VERSION (https://github.com/tinyauthapp/tinyauth),
built without changes from the official source archive of tag v$VERSION:

    $SOURCE_URL
    sha256 $SOURCE_SHA256

Built for arm64 and x86_64 with the flags of the upstream release workflow (CGO disabled,
tags nomsgpack, ldflags -s -w, upstream lockfiles) and joined into one universal binary. Its license is in LICENSE next to this file.
NOTE
record "$APP"
