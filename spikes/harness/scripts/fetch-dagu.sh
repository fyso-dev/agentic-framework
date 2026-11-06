#!/bin/sh
# Download the pinned Dagu release into .data/bin (no global install) and verify its checksum.
set -eu
VERSION="${DAGU_VERSION:-2.22.4}"
WT="$(git rev-parse --show-toplevel)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"; [ "$ARCH" = x86_64 ] && ARCH=amd64; [ "$ARCH" = aarch64 ] && ARCH=arm64
ASSET="dagu_${VERSION}_${OS}_${ARCH}.tar.gz"
DL="$WT/.data/dl"; mkdir -p "$DL" "$WT/.data/bin"
gh release download "v$VERSION" -R dagu-org/dagu -p "$ASSET" -p checksums.txt -D "$DL" --clobber
(cd "$DL" && grep " $ASSET\$" checksums.txt | shasum -a 256 -c -)
tar -xzf "$DL/$ASSET" -C "$DL" dagu
mv "$DL/dagu" "$WT/.data/bin/dagu"
"$WT/.data/bin/dagu" version
