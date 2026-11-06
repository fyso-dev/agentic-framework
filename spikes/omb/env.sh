# Source me. Isolated env for the OMB spike (port block 8500-8509).
WT=/Users/sebastianbarrozo/Documents/work/skalo/agentic-framework.worktrees/spike-omb
export PATH=/opt/homebrew/opt/node@24/bin:$PATH        # OMB 0.1.140 needs Node >= 24
export npm_config_cache=$WT/.data/npmcache
export OMB_PORT=8504 OMB_WEBHOOK_PORT=8505
export OPENMAUSBOT_URL=http://127.0.0.1:8504 ALLOW_INSECURE_HTTP=true
OMB_DATA=${OMB_DATA:-$WT/.data/omb}
omb() { npx -y openmausbot@0.1.140 "$@" --port 8504; }
