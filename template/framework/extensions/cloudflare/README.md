# Cloudflare DNS certificates

Copier extension for a private host with Cloudflare DNS and Tailscale transport.
Uses lego 5.6.0, native ACME state and a daily Dagu renewal workflow.

Set `CF_DNS_API_TOKEN` through the project's encrypted secret editor or the panel's
extension-secret form. Scope it to Zone Read and DNS Edit for the selected zone.
Never paste a token into chat, a workflow parameter or a tracked file.

`mise run cloudflare:certificate` obtains or renews the certificate. The certificate
and private key live under `.data/ext/cloudflare/lego/certificates/`. The key is
private to the host user; raw provider output is discarded. `mise run cloudflare:doctor` checks requested
names, remaining validity and key permissions. ACME account creation accepts the
CA terms; install/run only for a host whose administrator authorizes issuance.

This extension does not publish a listener, change DNS application records or mark
the project as HTTPS by itself. Configure the native TLS terminator and an executable
project-owned `project/cloudflare-after-renew.sh` to reload it after renewal.
Verify it before setting `FYSO_WEB_SCHEME=https` in a provider conf.d
file. DNS challenges need Cloudflare permissions; Wrangler OAuth alone may not
have them. Staging/local fixtures do not prove public trust or live issuance.
