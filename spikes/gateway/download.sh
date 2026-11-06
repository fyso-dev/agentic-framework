#!/bin/sh
# Pinned macOS arm64 release binaries; no global installs.
set -eu
cd "$(dirname "$0")/../.."
mkdir -p .data/bin .data/downloads
curl -fL --retry 2 --max-time 300 https://github.com/dagucloud/dagu/releases/download/v2.24.0/dagu_2.24.0_darwin_arm64.tar.gz -o .data/downloads/dagu.tar.gz
curl -fL --retry 2 --max-time 300 https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_mac_arm64.tar.gz -o .data/downloads/caddy.tar.gz
printf '%s\n' '021c618f83ddddd845fe8076a609f7f31a5a633cabcdfd2f0e87c4fcc1b97410  .data/downloads/dagu.tar.gz' | shasum -a 256 -c -
printf '%s\n' '3b8a4b24054bddd96cae8da5c34e48c19105be29859d6f09e37344b7e188881cfd6b0a91af3f3e8f1d10987153e6bad70d1752c967e1360cc0041fc7736076ec  .data/downloads/caddy.tar.gz' | shasum -a 512 -c -
tar -xzf .data/downloads/dagu.tar.gz -C .data/bin dagu
tar -xzf .data/downloads/caddy.tar.gz -C .data/bin caddy
.data/bin/dagu version
.data/bin/caddy version
