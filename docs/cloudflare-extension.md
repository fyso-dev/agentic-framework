# Cloudflare DNS certificates

Reusable DNS-01 certificate provisioning for private Fyso hosts. Deployed on
`juancarlosvm`; final authenticated browser acceptance remains pending.

Cloudflare controls DNS validation; `lego` issues and renews Let's Encrypt
certificates. Tailscale keeps transport private. DNS records for applications point
to the host's Tailscale IP with proxying disabled. No Cloudflare Tunnel or public
listener is required, and no existing DNS record is replaced automatically.

The extension uses native Copier slots, a pinned lego binary, encrypted
`CF_DNS_API_TOKEN`, a Dagu renewal schedule and Caddy's manual TLS configuration.
The token requires Zone Read and DNS Edit restricted to the selected zone.
Wrangler's default OAuth session has been checked: it can see `fyso.dev` but the
DNS and certificate APIs return 403. Never copy its OAuth credentials to the VM.

One host certificate may include `jc.fyso.dev`, `*.jc.fyso.dev` and wildcard names
for the three project domains. The shared hub owns user authentication. Its HTTPS
support and the host TLS entry point must be verified before changing live DNS or
removing existing access paths. Keep native app names and exact-origin checks.

Acceptance requires real certificate validation, a single browser login across the
hub and projects, global logout, rejected anonymous/cross-origin writes, all four
doctors, and the D65 remote-MCP flow in every project. Local certificate fixtures
and mocked DNS do not establish production certificate issuance.

## Current evidence

The framework regression tests cover stale shared-login configuration, provider
error redaction, invalid certificate names, repeated native lego commands, missing
certificates and private-key permissions. The Copier extension generates on macOS
and installs on the Linux ARM64 VM with lego 5.6.0. Its real `run --help` was checked:
version 5 uses `lego run` for both issuance and renewal; the old `renew` subcommand
is not used. An optional project-owned reload script is passed through lego's native
deploy hook, which runs only after an effective successful issuance/renewal.

The separate hub HTTPS worktree has a real Tinyauth/Caddy integration fixture with
three native framework gateways and simulated application/console upstreams. One
login opens the portal, all three panel sites, declared app routes and consoles;
the web cookie never reaches application upstreams. Cross-origin writes and logout
replay are rejected. Certificates and users in that fixture are fictitious. These
checks do not establish production issuance, actual application functionality or
browser acceptance on the VM.

## Deployment on juancarlosvm

On 2026-11-12 the administrator supplied the encrypted DNS token in Auditor.
Its native connection hook issued a Let's Encrypt certificate expiring
2027-02-10, covering `jc.fyso.dev` and wildcards for the hub and three project
domains. DNS records were created only after confirming the five names were free;
they are unproxied and point to the host's Tailscale IP. The existing TCP forwards
were preserved; private TCP 443 now forwards to the hub's loopback TLS listener.

The hub and three project domains were changed through Copier in isolated
worktrees. The old `mise.local.toml` domain overrides also required changing:
they outrank the generated configuration. Project-owned process-compose fragments
enter the current mise environment on restart. All four live doctors pass.

Certificate issuance and the DNS token temporarily remain owned by Auditor, at the
administrator's explicit request. Its project-owned native lego deploy hook calls
the hub's `tls:reload` task. That complete reload path was exercised successfully.
Moving issuance to the hub is deferred; authentication already belongs to the hub.

The three live `fyso-agent-connect` runs succeeded. Their outputs did not contain
their stored MCP tokens; each real HTTPS MCP endpoint initialized and listed
26 platform tools without Dagu tools. Browser Run, shared-session navigation and
global logout on the deployed host are still pending an interactive hub login.

See [delivery evidence](../artifacts/delivery-evidence/cloudflare-https/README.md)
for the current acceptance matrix, sanitized run IDs and reproducible hub patch.

References: [lego Cloudflare provider](https://go-acme.github.io/lego/dns/cloudflare/),
[Cloudflare DNS tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/),
[Tailscale TCP forwarding](https://tailscale.com/docs/reference/tailscale-cli/serve).
