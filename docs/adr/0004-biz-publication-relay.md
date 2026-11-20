# ADR 0004 — Managed relay for the Biz publication extension

**Status:** Accepted for the testable preview.

The extension publishes a running Fyso panel over HTTPS with Fyso Biz SSO.
The origin stays on loopback. Fyso Biz operates the public service, and the
generated project connects out over HTTPS using its existing runtime. The
project requires no Cloudflare executable, credentials or inbound listener.

## Decision

Allow a custom bounded HTTP relay as an exception to the framework's
small-glue rule for this opt-in extension. Cloudflare Workers provide
public HTTPS and Durable Objects provide per-domain relay coordination.
The project connector polls the Worker and forwards requests to Caddy on
loopback. The Worker authorizes publication and connector calls against
the verified Biz account assigned to the domain. Tinyauth and the project's
app policy authorize browser access.

The relay and connector belong to the
[public Biz publication extension](https://github.com/fyso-dev/fyso-ext-biz-publication/tree/v0.1.0).
The framework supplies the existing HTTPS contract and generic Tinyauth
OAuth provider hooks.

## Alternatives

- **Cloudflare Tunnel with a project-side connector.** This supplies a
  mature tunnel and avoids a custom relay protocol, but operating the
  tunnel with Cloudflare still requires `cloudflared` next to the loopback
  origin.
- **A Biz-operated Cloudflare Tunnel connector.** A connector running away
  from the project needs a separate network path to reach the loopback
  origin. It would add a private transport to the generated project.
- **Static site hosting.** It can serve a panel build. A running panel also
  needs its gateway APIs, session and login routes.

## Limits and evidence

The preview uses a bounded request queue and buffers HTTP responses. It
does not relay streams or WebSocket upgrades. DNS assignments are
operator-managed and the connector's OAuth token requires manual renewal.
The deployed preview passed live Biz browser SSO, project health checks,
revocation and republication. Revisit the transport if a managed connector
can satisfy the same placement constraints, or before expanding beyond
these preview limits. [Verification record](../biz-panel-publication.md#fyso-biz-cloudflare-preview)
