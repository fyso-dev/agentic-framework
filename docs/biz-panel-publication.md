# Managed panel publication through Fyso Biz

The target is a testable beta that publishes the running Fyso panel at a public
HTTPS URL. Users sign in to Tinyauth with their Fyso Biz identity. Each linked
project serves its own version from its assigned domain.

The [Biz publication extension](https://github.com/fyso-dev/fyso-ext-biz-publication/tree/v0.1.0)
owns the Cloudflare Worker, relay, project connector and native Tinyauth
provider. Fyso Biz is the OAuth authority. The framework exposes its existing
D62 HTTPS contract and a generic Tinyauth provider slot. Cloudflare provisioning
and the relay run on infrastructure managed by Fyso Biz. Install the external
extension with `mise run ext:add gh:fyso-dev/fyso-ext-biz-publication -- --vcs-ref v0.1.0`.
The [relay decision](adr/0004-biz-publication-relay.md) records the architectural exception and its preview limits.

## Acceptance

- An assigned project publishes and retrieves its URL and publication state.
- An unauthorized Biz identity cannot publish, connect or revoke.
- Starting with a browser signed in to Biz, the Tinyauth SSO callback completes
  and the panel loads the authorized user session.
- An unauthorized Biz account cannot open the panel.
- Revocation immediately disables the public route.
- The generated project doctor passes.

## Checkpoint

The previous local Cloudflare connector draft was replaced by an extension-owned
Worker and an outbound HTTPS connector. The prototype requires domain
assignment and an OAuth client per project. Publication credentials are
configured separately from the browser identity grant.

Verified with Copier 9.19.1, a local Cloudflare Workers runtime, Tinyauth 5.2
and Caddy 2.11.9. The Worker relayed a redirect, two session cookies and a
subsequent request to a loopback origin, denied another identity and returned
404 after revocation. The real auth gateway completed a cross-site callback
with PKCE against a simulated Biz issuer, authorized the panel session and
denied an email outside the provider whitelist. The ordinary cross-site API
guard also remained active.

## Fyso Biz Cloudflare preview

The isolated Worker `fyso-biz-panel-publication-preview` runs version
`56c532ba-86d4-44e5-9308-932aa0451fad`. The preview deployment initially used
an incorrect Durable Object binding name. The corrected deployment binds
`PUBLICATION_RELAY`. The public extension includes a [deployment example](https://github.com/fyso-dev/fyso-ext-biz-publication/blob/v0.1.0/service/wrangler.example.toml).

On 2026-11-19, the real Biz issuer verified the smoke account. An isolated
generated project on port block 47960 was published at
[the preview panel](https://panel.publication-smoke.fyso.biz). Chrome reached
Tinyauth with the Fyso Biz provider and loaded the authenticated panel after
SSO. `mise run doctor` passed, including the publication extension and the
project's runtime isolation. Revocation returned HTTP 404. After republishing,
the Worker reported enabled and connected and an anonymous request returned
HTTP 401. The preview was left enabled for the authorized account.

An unauthorized identity was tested in the local Worker and Tinyauth fixtures.
The deployed preview also rejected publication without an OAuth credential.
The preview depends on the local project staying online and on the current
OAuth access token. Token renewal and streaming remain outside this prototype.
