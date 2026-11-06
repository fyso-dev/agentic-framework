# Source after env.sh, from the worktree root.
export DAGU_HOME="$TOOLING_WT/.data/dagu"
export DAGU_DAGS_DIR="$DAGU_HOME/dags"
export DAGU_HOST=127.0.0.1
export DAGU_PORT=8420
export DAGU_SCHEDULER_PORT=8421
export DAGU_COORDINATOR_PORT=8422
export DAGU_COORDINATOR_HEALTH_PORT=8423
export DAGU_WORKER_HEALTH_PORT=8424
export DAGU_GITSYNC_ENABLED=true
export DAGU_GITSYNC_REPOSITORY="$TOOLING_WT/.data/tooling-remote.git"
export DAGU_GITSYNC_BRANCH=main
export DAGU_GITSYNC_PUSH_ENABLED=true
export DAGU_GITSYNC_AUTH_TOKEN=tooling-fake-unused-local-token
export DAGU_GITSYNC_AUTOSYNC_ENABLED=false
export DAGU_GITSYNC_AUTOSYNC_ON_STARTUP=false
