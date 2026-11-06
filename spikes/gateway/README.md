# Gateway Phase 0 reproduction

Verification fixtures only. Run from the `spike/gateway` worktree on macOS arm64.
See [the findings](../../docs/adr/spikes/gateway.md) before choosing an auth mode.
No command should contact any service outside ports 8600–8609.

## Install and launch

1. Run `spikes/gateway/download.sh`. It downloads pinned release binaries into
   `.data/bin` and checks the upstream archive hashes. Pins are also recorded in
   this directory's `mise.toml`; do not use `mise install` for this spike.
2. In separate foreground terminals, run:

   ```sh
   DAGU_AUTH_MODE=none spikes/gateway/dagu.sh
   spikes/gateway/caddy.sh
   spikes/gateway/omb.sh
   ```

   OMB uses the worktree npm cache and explicit port/data directory. On a sandbox
   that denies Node's `os.uptime()`, the OMB process needs permission to run
   outside that sandbox. Do not patch OMB to bypass its data-directory lease.
3. For the probes, set the gateway Basic header without printing its value.
   The Caddy fixture hash corresponds to the local test credentials requested
   for this spike. For example, in Bash:

   ```bash
   read -rs -p 'Gateway test password: ' GATEWAY_PASSWORD
   export GATEWAY_AUTH="Basic $(printf '%s' "admin:$GATEWAY_PASSWORD" | base64)"
   export DAGU_MCP_AUTH="$GATEWAY_AUTH"
   unset GATEWAY_PASSWORD
   python3 spikes/gateway/http-probe.py --label none
   python3 spikes/gateway/mcp-probe.py
   python3 spikes/gateway/mcp-probe.py --url http://127.0.0.1:8600/mcp \
     --host dagu.localhost:8600 --auth-env GATEWAY_AUTH
   python3 spikes/gateway/panel-probe.py
   python3 spikes/gateway/omb-probe.py
   ```

The OMB probe creates and revokes only sessions labelled `gateway-spike`. It tests
one native pairing exchange, cookie-authenticated API access, and `curl -N` SSE.
Its expected curl exit 28 is the intentional three-second streaming timeout.
It redacts `Set-Cookie` and never prints pairing codes or bearer credentials.
The panel probe writes a single fixture output under `.data/dagu/spike-output`.

## Claude cwd mechanism

Use the already installed subscription CLI, without installing another copy:

```sh
cd spikes/gateway/bot-none
claude -p 'List the Dagu DAGs using the dagu MCP. Call dagu_read to list DAGs.' \
  --mcp-config .mcp.json --strict-mcp-config --setting-sources '' --tools '' \
  --allowedTools mcp__dagu__dagu_read --max-turns 3 --no-session-persistence \
  --output-format json
```

Stop Dagu with Ctrl+C before changing modes. Set `DAGU_AUTH_MODE=basic`,
`DAGU_AUTH_BASIC_USERNAME=admin` and `DAGU_AUTH_BASIC_PASSWORD` from the same test
password in the Dagu terminal, then restart `dagu.sh`. Run the same Claude command
from `bot-basic`, with `DAGU_MCP_AUTH` exported. That config uses literal
`${DAGU_MCP_AUTH}` expansion, not a generated credential file. The recorded basic
run also used `--verbose --output-format stream-json` to capture the tool call.
Run `mcp-probe.py --auth-env DAGU_MCP_AUTH` for direct authenticated MCP access.
Omitting `--auth-env` is a negative auth test and returns 401 in basic mode.

## Actual proxy authentication

Stop Dagu, then launch with these settings:

```sh
export DAGU_AUTH_MODE=builtin
export DAGU_AUTH_PROXY_ENABLED=true
export DAGU_AUTH_PROXY_SOURCE=gateway-spike
export DAGU_AUTH_PROXY_HEADERS_USER=X-Auth-Request-User
export DAGU_AUTH_PROXY_AUTO_SIGNUP=true
# Set these only for the first builtin initialization:
export DAGU_AUTH_BUILTIN_INITIAL_ADMIN_USERNAME=admin
export DAGU_AUTH_BUILTIN_INITIAL_ADMIN_PASSWORD="$(openssl rand -hex 16)"
spikes/gateway/dagu.sh
```

The generated bootstrap password is not needed for the proxy denial test and
must not be logged. The initial admin is required before proxy login can be
attempted. With no SSO license, `/proxy-login` returns 403 and REST/MCP return
401 even after Caddy authentication. `http-probe.py --label builtin-proxy`
records those checks. Enabling proxy auth with `DAGU_AUTH_MODE=none` fails startup.

The Caddyfile overwrites the identity header and removes incoming groups. It
also rewrites Dagu's upstream Host for the MCP SDK's loopback Host guard.
Successful none/basic results do **not** demonstrate trusted-header SSO.

## Public URL and cleanup

Repeat OMB with `OMB_PUBLIC_URL=http://omb.localhost:8600 spikes/gateway/omb.sh`.
Only generated pairing links change in these checks; transport works either way.
Always stop the previous OMB first. Never strip forwarded headers to simulate
local owner trust.

Stop **each foreground service with Ctrl+C**. Do not kill unrelated processes.
Check only this spike's port block for remaining listeners. Runtime state,
raw logs, downloaded source, npm cache, and any credentials belong in ignored
`.data/`; only trimmed, redacted evidence is committed here.
