#!/usr/bin/env bash
# Native lego owns ACME state and DNS challenges; never log provider credentials.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${FYSO_DATA:?Run inside the project mise environment}"
: "${FYSO_CLOUDFLARE_DOMAIN:?Certificate domain is required}"
: "${FYSO_CLOUDFLARE_EMAIL:?ACME email is required}"
: "${CF_DNS_API_TOKEN:?Configure the encrypted Cloudflare DNS token}"
umask 077
data="$FYSO_DATA/ext/cloudflare"
mkdir -p "$data"
chmod 700 "$data"
args=(--path "$data/lego" --email "$FYSO_CLOUDFLARE_EMAIL" --dns cloudflare
  --dns.resolvers 1.1.1.1:53 --accept-tos)
while IFS= read -r name || [ -n "$name" ]; do
  [ -z "$name" ] && continue
  [[ $name =~ ^(\*\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ ]] || {
    echo 'Invalid certificate DNS name' >&2; exit 1;
  }
  args+=(--domains "$name")
done < extensions/cloudflare/names.txt
# Native lego runs this only after successful issuance or effective renewal.
if [ -x project/cloudflare-after-renew.sh ]; then
  args+=(--deploy-hook 'sh project/cloudflare-after-renew.sh')
fi
# Provider diagnostics may contain credentials. Persist no raw output, even on failure.
# lego 5's native `run` obtains missing certificates and renews only when due.
if ! lego run "${args[@]}" >/dev/null 2>&1; then
  echo 'Certificate operation failed; check Cloudflare permissions and DNS propagation on the host' >&2
  exit 1
fi
node extensions/cloudflare/doctor.cjs
