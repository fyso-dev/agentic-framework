# Source me. Isolated env for the OMB spike (port block 8500-8509).
# Repo root, derived from this file's location (no machine-specific paths).
WT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"
export WT
# OMB 0.1.140 needs Node >= 24. Set NODE24_BIN to a Node 24 bin dir if the default `node` is older.
[ -n "${NODE24_BIN:-}" ] && export PATH="$NODE24_BIN:$PATH"
export npm_config_cache=$WT/.data/npmcache
export OMB_PORT=8504 OMB_WEBHOOK_PORT=8505
export OPENMAUSBOT_URL=http://127.0.0.1:8504 ALLOW_INSECURE_HTTP=true
OMB_DATA=${OMB_DATA:-$WT/.data/omb}
omb() { npx -y openmausbot@0.1.140 "$@" --port 8504; }
