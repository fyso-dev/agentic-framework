#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
export npm_config_cache="$PWD/.data/npm-cache"
export OMB_PORT=8604 OMB_WEBHOOK_PORT=8605 OPENMAUSBOT_URL=http://127.0.0.1:8604
exec npx -y openmausbot@0.1.140 serve --port 8604 --data-dir "$PWD/.data/omb" --no-pair --no-open
