#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
export GATEWAY_WT="$PWD"
export XDG_DATA_HOME="$PWD/.data/caddy/data" XDG_CONFIG_HOME="$PWD/.data/caddy/config"
exec .data/bin/caddy run --config spikes/gateway/Caddyfile --adapter caddyfile
