# Phase 0 spike: gateway

**Verdict:** the transport and no-backend pattern work, but the proposed Dagu
trusted-header single-login contract does not work on the unlicensed build.
OMB needs its own pairing behind Caddy. No product code or phase advancement.

## Scope and versions

Executed on branch `spike/gateway`, macOS arm64, **2026-11-06 01:10–01:17 UTC**
(local date 2026-11-05). All service traffic used 8600–8609. Dagu and OMB user
instances and home data directories were not contacted. The shared installed
Claude CLI/login was used for two short, read-only MCP prompts.

| Component | Tested version / provenance |
|---|---|
| Dagu | `2.24.0`, release published `2026-10-27T08:02:05Z`, over a week before this test |
| Caddy | `v2.10.2`, official macOS arm64 release archive |
| OMB | `openmausbot@0.1.140`, npm package |
| Claude Code | `2.1.318`, existing subscription CLI; no install or login changes |
| Node | `v26.5.0`, existing runtime |
| curl | `8.7.1`, existing system client |

Dagu/Caddy were downloaded into `.data/bin`, not globally installed. Upstream
archive checksums matched: Dagu SHA-256
`021c618f83ddddd845fe8076a609f7f31a5a633cabcdfd2f0e87c4fcc1b97410`;
Caddy SHA-512
`3b8a4b24054bddd96cae8da5c34e48c19105be29859d6f09e37344b7e188881cfd6b0a91af3f3e8f1d10987153e6bad70d1752c967e1360cc0041fc7736076ec`.
The [download script](../../../spikes/gateway/download.sh) pins and checks these.
Release evidence: [Dagu v2.24.0](https://github.com/dagucloud/dagu/releases/tag/v2.24.0),
[Dagu checksums](https://github.com/dagucloud/dagu/releases/download/v2.24.0/checksums.txt),
[Caddy v2.10.2](https://github.com/caddyserver/caddy/releases/tag/v2.10.2),
[Caddy checksums](https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_checksums.txt),
[OMB exact package](https://www.npmjs.com/package/openmausbot/v/0.1.140).

All fixtures and probes are in [spikes/gateway](../../../spikes/gateway/README.md).
The project's Phase 0 status remains unchanged. Board shared-memory lookup
failed because the connector did not accept this conversation's native identity;
no identity belonging to another agent was substituted.

## 1. Dagu MCP from a bot cwd

### Answer

**Yes**, the Claude CLI loads the cwd-local `.mcp.json` when explicitly supplied
and can discover Dagu's tools and call `dagu_read`. Both `DAGU_AUTH_MODE=none`
and `basic` worked. In basic mode the Authorization header came from literal
`${DAGU_MCP_AUTH}` in the committed JSON, expanded from an exported environment
variable. No credential was written into that config.

This reproduces the requested CLI mechanism, not a full OMB bot conversation.
The exact OMB package source corroborates the wiring: `projectMcpServers(cwd)`
reads `join(cwd,".mcp.json")`; the Claude adapter merges it into its MCP config
for isolated, non-guest-confined turns. Bot restrictions can still filter tools.
No OMB engine turn was launched for this question.

### Evidence

From `spikes/gateway/bot-none` with Dagu mode `none`:

```sh
claude -p 'List the Dagu DAGs using the dagu MCP. Call dagu_read to list DAGs and report their names. Do not use any other service.' \
  --mcp-config .mcp.json --strict-mcp-config --setting-sources '' --tools '' \
  --allowedTools mcp__dagu__dagu_read --max-turns 3 --no-session-persistence \
  --output-format json
```

Trimmed CLI result: `is_error: false`, `num_turns: 2`,
`I listed the DAGs with dagu_read ... gateway-echo (not suspended)`.
[Saved result](../../../spikes/gateway/evidence/claude-none.json).

Repeated from `bot-basic` with Dagu mode `basic`, its username/password supplied
at process launch, `DAGU_MCP_AUTH` exported, and `--verbose --output-format
stream-json`. [Saved tool call and result](../../../spikes/gateway/evidence/claude-basic.json):

```text
tool_use: mcp__dagu__dagu_read {"target":"dags"}
result: is_error=false; gateway-echo; latest run succeeded
available: mcp__dagu__dagu_read, mcp__dagu__dagu_change, mcp__dagu__dagu_execute
```

Independent protocol checks used `mcp-probe.py` with an initialize handshake,
initialized notification, `tools/list`, and `tools/call`:

```text
initialize 200; serverInfo {name: dagu, version: 2.24.0}
tools/list 200 ['dagu_change', 'dagu_execute', 'dagu_read']
tools/call 200; target=dags; items[0].name=gateway-echo
```

Saved [none](../../../spikes/gateway/evidence/mcp-none.txt) and
[basic](../../../spikes/gateway/evidence/mcp-basic.txt) traces. Basic requests
without the auth header returned 401. Only `dagu_read` was invoked: this spike
did not test mutation or execution through MCP.

Sources: [Dagu MCP authentication](https://docs.dagu.sh/mcp/authentication),
[pinned MCP server](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/service/mcp/server.go),
[exact OMB distributed source](https://unpkg.com/openmausbot@0.1.140/dist-server/index.js)
(symbols `projectMcpServers`, `canUseMcpServer`, Claude adapter).

### Implications for PLAN.md

§3's cwd MCP integration is viable. Keep environment expansion in native JSON;
carry the header env var into the bot process. Pin the tools and test permissions
in Phase 2. Do not infer API-key bot or full OMB turn success from these CLI tests.

**Confidence:** high for the tested Claude/config/protocol path; medium for
end-to-end OMB bot behavior, supported by package source but not exercised.

## 2. Dagu behind Caddy with proxy auth

### Answer

**No**, not as proposed with free trusted-header auth. v2.24.0 requires
`DAGU_AUTH_MODE=builtin` for proxy auth and gates proxy login behind an SSO license.
Caddy authentication and identity forwarding work, but without that license
`/proxy-login` returns 403. REST and MCP do not authenticate from that header.
An HTML 200 is only the SPA shell, not proof of an authenticated UI.

The [Caddyfile](../../../spikes/gateway/Caddyfile) uses `basic_auth`, a hash of the
requested local test password, and `header_up X-Auth-Request-User
{http.auth.user.id}`. It overwrites client identity and removes incoming groups.
No plaintext password is committed.

### Evidence

Dagu was started with the isolated env in `dagu.sh`, plus:

```sh
DAGU_AUTH_MODE=builtin
DAGU_AUTH_PROXY_ENABLED=true
DAGU_AUTH_PROXY_SOURCE=gateway-spike
DAGU_AUTH_PROXY_HEADERS_USER=X-Auth-Request-User
DAGU_AUTH_PROXY_AUTO_SIGNUP=true
```

The initial builtin administrator was provisioned with a random, unprinted
bootstrap password. No license was supplied or changed. Startup reported:

```text
Proxy authentication enabled autoSignup=true defaultRole=viewer
Proxy authentication is configured but currently unavailable because the active license does not enable it
Proxy login denied reason=license_unavailable
```

[License evidence](../../../spikes/gateway/evidence/proxy-license.txt),
[HTTP matrix](../../../spikes/gateway/evidence/http-proxy.txt):

| Request | No Caddy credentials | After Caddy basic auth |
|---|---:|---:|
| Dagu `/` | 401 | 200 HTML shell |
| `/api/v1/dags` | 401 | 401 |
| `/mcp` initialize | 401 | 401 |
| `/proxy-login` | 401 | 403 `access denied` |

`DAGU_AUTH_MODE=none DAGU_AUTH_PROXY_ENABLED=true` fails startup:
`auth.proxy.enabled requires auth.mode to be builtin`.
[Recorded failure](../../../spikes/gateway/evidence/proxy-none.txt).

Two **different auth configurations** succeeded:

| Dagu mode | UI shell / REST / MCP through authenticated Caddy | Direct REST / MCP without credentials |
|---|---|---|
| `none` | 200 / 200 / 200 | 200 / 200 |
| `basic`, matching credentials | 200 / 200 / 200 | 401 / 401 |

See [none matrix](../../../spikes/gateway/evidence/http-none.txt),
[basic matrix](../../../spikes/gateway/evidence/http-basic-rewrite.txt),
[proxied MCP none](../../../spikes/gateway/evidence/mcp-caddy-none.txt), and
[proxied MCP basic](../../../spikes/gateway/evidence/mcp-caddy-basic.txt).
The basic alternative works because Caddy forwards the same Authorization
header to Dagu; it is not trusted-header SSO. No second credential is needed
for these requests. Actual interactive UI navigation was not tested.

The first proxied MCP attempt with the external Host preserved returned:
`403 Forbidden: invalid Host header "dagu.localhost:8600"`.
[Initial matrix](../../../spikes/gateway/evidence/http-basic.txt).
Adding `header_up Host {upstream_hostport}` to Dagu proxy routes made MCP work.
Dagu's MCP server uses the Go MCP SDK's streamable HTTP handler. Preserve this
finding in the Phase 1 gateway test; do not disable authentication to fix Host.

**Bypass:** Dagu does not require requests to have passed through Caddy.
With `none`, a plain direct GET without any identity header also returned 200.
With `basic`, valid credentials can authenticate directly. In builtin proxy mode,
direct spoofed-header `/proxy-login` reached the same license-denial handler;
a successful impersonation was **not** demonstrated because the license gate
prevented it. The pinned handler has no source-IP trust check, consistent with
the upstream warning. Loopback binding blocks remote direct ingress, but local
processes can still reach it; remote deployments need private exposure/firewalls.

Sources: [proxy auth documentation](https://docs.dagu.sh/server-admin/authentication/proxy),
[pinned handler including license gate](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/service/frontend/auth/trustedproxy.go),
[pinned server wiring](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/service/frontend/server.go),
[pinned validation tests](https://github.com/dagucloud/dagu/blob/v2.24.0/internal/cmn/config/trusted_proxy_test.go),
[Caddy basic auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth),
[Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

### Implications for PLAN.md

§3 and D11 cannot promise transparent Dagu proxy-header auth on the free build.
Choose explicitly between Caddy-only auth with a private Dagu `none` listener,
matching upstream basic auth, or licensed builtin SSO with API keys for automation.
The panel/API auth must match that choice. Header SSO is a browser session flow,
not universal REST/MCP identity injection. Browser credential reuse across app
subdomains was not verified; curl credentials per request do not prove a single
browser prompt across origins.

**Confidence:** high for failures, none/basic transport, and Host workaround;
source-backed for licensed bypass risk; licensed success remains untested.

## 3. OMB UI on a Caddy subdomain

### Answer

**Yes for page/assets and paired API/SSE transport.** Caddy basic authentication
alone is insufficient: proxied API and SSE requests require OMB's native pairing.
`OMB_PUBLIC_URL` is **not required for these checks**; it provides generated
pairing links. OMB sends headers that disallow framing. No supported trusted
proxy user-header authentication was found in this self-hosted build.

### Evidence

The initial launch used exactly the isolated service arguments, with the npm
cache additionally redirected into the worktree:

```sh
npm_config_cache="$PWD/.data/npm-cache" \
OMB_WEBHOOK_PORT=8605 OMB_PORT=8604 OPENMAUSBOT_URL=http://127.0.0.1:8604 \
npx -y openmausbot@0.1.140 serve --port 8604 \
  --data-dir "$PWD/.data/omb" --no-pair --no-open
```

The default npm cache was not writable under the sandbox. After redirecting it,
Node's `uv_uptime` call failed with EPERM while acquiring the data-directory lease.
The same isolated process was then run with sandbox escalation; it started on
`127.0.0.1:8604`, webhook `127.0.0.1:8605`, with the specified worktree data dir.
No OMB code was patched. Startup warned that the installed browser engine was
not its pinned version; browser-agent tools were not used by this transport test.

The [OMB probe](../../../spikes/gateway/omb-probe.py) requests the page and three
referenced assets, checks unpaired API/SSE with an injected user header, creates
a pairing locally at `:8604`, exchanges it through Caddy, then sends the paired
cookie plus Caddy credentials. It revokes its session in `finally`.

[Without public URL](../../../spikes/gateway/evidence/omb-none-probe.txt):

```text
page 200; X-Frame-Options DENY; CSP frame-ancestors 'none'
/assets/index-BmKvJk3H.js 200
/assets/styles-Chs7EqVA.js 200
/assets/styles-Dhftw_bd.css 200
unpaired /api/bots 403: request came through a proxy (pair this device ...)
unpaired /api/events 403: request came through a proxy (pair this device ...)
pairing URL present False
hint: set OMB_PUBLIC_URL, or open /pair on the address you use and type the code
exchange 200
paired API 200; bot count 1
```

The SSE request was equivalent to:

```sh
curl -N --max-time 3 -i \
  -H 'Host: omb.localhost:8600' -H 'Origin: http://omb.localhost:8600' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H "Authorization: $GATEWAY_AUTH" -H "Cookie: $OMB_COOKIE" \
  http://127.0.0.1:8600/api/events
```

The probe handles the cookie in memory; no cookie is needed in committed config.
Trimmed output:

```text
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Set-Cookie: [redacted]
X-Accel-Buffering: no
Via: 1.1 Caddy

data: {"kind":"hello","cursor":"3cf41b36:4","resumed":false}
```

Curl exits **28 intentionally** after three seconds, having received an event;
it is not a completed stream or a long-duration reconnect test. The Caddy route
sets `flush_interval -1`. The cookie was host-only (no Domain attribute),
`Path=/; HttpOnly; SameSite=Lax`, without Secure on this HTTP test.

Repeated after restart with `OMB_PUBLIC_URL=http://omb.localhost:8600`:
page/assets/API/SSE all still passed; `pairing URL present True`, no missing-URL
hint. [Recorded comparison](../../../spikes/gateway/evidence/omb-public-probe.txt).
No HTTPS, external OAuth callback, webhook callback or real browser rendering
was tested; those features may require an externally correct public URL.

The [exact package source](https://unpkg.com/openmausbot@0.1.140/dist-server/index.js)
shows `resolveRequestAuth` checking OMB bearer/session-cookie/stream-ticket auth
before its loopback policy. `isProxied` detects Forwarded/X-Forwarded-*; its
unpaired proxy branch explicitly rejects the request. `X-Auth-Request-User`
did not change the 403. This supports native pairing for this self-hosted mode,
not a generic trusted-user header. Other hosted/enterprise auth modes were not
exercised. Do not strip proxy headers to obtain local owner trust.

### Implications for PLAN.md

Keep §3's separate-tab OMB and native pairing contract. The customization layer
must not claim Caddy login pairs a browser. No iframe embedding with the tested
headers. Set a public URL for convenient pairing links and evaluate external
callbacks during deployment. Keep streaming flush behavior and paired SSE in
Phase 1 checks.

**Confidence:** high for HTTP assets, pairing, cookies, headers and initial SSE;
medium for complete browser UI behavior and absence of any other auth integration,
which was assessed from this build's auth function and a spoofed-header test.

## 4. Panel with no custom backend

### Answer

**Yes**, with either Dagu `none` behind Caddy or Dagu basic auth using matching
credentials. Caddy serves an explicitly allowed config file read-only and passes
same-origin REST calls through; Dagu accepts params, executes the DAG, and exposes
status and captured output. No panel server or custom backend was started.
**No under the unlicensed builtin proxy-auth configuration:** the start POST
returns 401 after successful Caddy auth.

### Evidence

The Caddy route serves only `/config/team.yaml`, mapped to the fixture
`spikes/gateway/project/bots/team.yaml`. GET/HEAD are allowed; POST, PUT and
DELETE return 405. Other non-API panel paths return 404. This is an allowlisted
fixture, not a directory listing of project files.

The [DAG](../../../spikes/gateway/dags/gateway-echo.yaml) uses a `MESSAGE` param,
writes it using `printenv MESSAGE` to `$DAGU_HOME/spike-output/message.txt`, and
captures stdout with `output: ECHO`. Values are not interpolated into shell code.

The [panel probe](../../../spikes/gateway/panel-probe.py) sends:

```http
POST /api/v1/dags/gateway-echo/start
Host: panel.localhost:8600
Origin: http://panel.localhost:8600
Sec-Fetch-Site: same-origin
Content-Type: application/json
Authorization: [gateway Basic header]

{"params":"MESSAGE=gateway-panel-proof"}
```

It polls `GET /api/v1/dag-runs/gateway-echo/{id}`, reads
`GET /api/v1/dag-runs/gateway-echo/{id}/outputs`, and independently checks the
written file. All requests go to Caddy `127.0.0.1:8600`, with the panel Host.
The API's `params` property is a string; the tested named-argument form works.

[None-mode result](../../../spikes/gateway/evidence/panel-none.txt):

```text
config GET 200
config POST 405
config PUT 405
config DELETE 405
start 200 034scCrnhnAQsz2ZwnD3f3
status 200 succeeded
outputs 200 {'echo': 'gateway-panel-proof'}
file matches supplied param True
```

[Basic-mode result](../../../spikes/gateway/evidence/panel-basic.txt): same checks
passed with run `034scDVXVr5Z4O32l2cjYn`. Native proxy mode returned 401 for the
same start route; `proxy-must-not-run` was not executed.

Sources: [pinned start API schema](https://github.com/dagucloud/dagu/blob/v2.24.0/api/v1/api.yaml),
[Caddy file server](https://caddyserver.com/docs/caddyfile/directives/file_server),
[Caddy handle routing](https://caddyserver.com/docs/caddyfile/directives/handle).

### Implications for PLAN.md

§9's read-only-file → parameterized workflow → run status/output contract is
viable without custom backend code. Use same-origin `/api` passthrough to avoid
cross-origin frontend requirements. The chosen Dagu auth mode remains a blocking
design choice from question 2. This verifies transport, not form validation,
workflow authorization boundaries, safe editing of real team files, snapshot
ordering, retry semantics, or arbitrary user-input safety.

**Confidence:** high for the exercised HTTP/DAG/file chain; full SPA integration
and licensed authentication remain outside this spike.

## Cleanup and limits

All started Dagu, Caddy and OMB foreground processes were interrupted and exited.
At **2026-11-06 01:16:30 UTC**, an IPv4 loopback connect check found every port
8600–8609 closed. Disposable OMB sessions were explicitly revoked. An initial
manual diagnostic accidentally printed its disposable session cookie; that
session was revoked, and committed probes/evidence redact session headers.
The later probes were repeated with redaction enabled. No credentials or runtime
state are included in the commit; `.data/` remains ignored.

No `mise run doctor` exists yet (Phase 0). Verification was live isolated HTTP,
MCP and CLI tests plus pinned upstream source review, followed by static checks
of these fixtures. This is not a deployment, a full browser E2E, a successful
licensed SSO test, or a claim that Phase 0 as a whole is complete.
