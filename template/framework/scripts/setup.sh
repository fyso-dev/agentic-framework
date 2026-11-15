#!/usr/bin/env bash
# One-time setup: age key (per developer), .sops.yaml and secrets.enc.yaml.
# Safe to re-run: it never overwrites an existing key or secrets file.
set -euo pipefail
cd "$(dirname "$0")/../.."

key_file="${MISE_SOPS_AGE_KEY_FILE:-${SOPS_AGE_KEY_FILE:-$HOME/.config/mise/age.txt}}"
if [ ! -f "$key_file" ]; then
  mkdir -p "$(dirname "$key_file")"
  age-keygen -o "$key_file" 2>/dev/null
  chmod 600 "$key_file"
  echo "✓ Created your age key: $key_file  (back it up; without it the secrets cannot be decrypted)"
else
  echo "✓ Age key found: $key_file"
fi
recipient=$(age-keygen -y "$key_file")
export SOPS_AGE_KEY_FILE="$key_file"

if [ ! -f .sops.yaml ]; then
  cat > .sops.yaml <<YAML
# Who can decrypt secrets.enc.yaml: one age recipient per developer or server.
creation_rules:
  - path_regex: secrets\.enc\.yaml$
    age: >-
      $recipient
YAML
  echo "✓ Created .sops.yaml"
fi

if [ ! -f secrets.enc.yaml ]; then
  # The legacy ADMIN password is now a technical Dagu credential, not a human login.
  password=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')
  tmp=$(mktemp "${TMPDIR:-/tmp}/fyso-setup.XXXXXXXX")
  trap 'rm -f "$tmp"' EXIT
  q="'"; printf "FYSO_ADMIN_PASSWORD: '%s'\n" "${password//$q/$q$q}" > "$tmp"   # YAML single-quoted
  SOPS_AGE_KEY_FILE="$key_file" sops encrypt --filename-override secrets.enc.yaml \
    --input-type yaml --output-type yaml "$tmp" > secrets.enc.yaml
  echo "✓ Created secrets.enc.yaml (random technical Dagu credential)"
else
  echo "✓ secrets.enc.yaml already exists"
fi

# Local browser users have their own encrypted hashes; existing projects migrate here.
if [ -n "${FYSO_AUTH_UPSTREAM:-}" ]; then
  echo "✓ Web users belong to the shared login at $FYSO_AUTH_UPSTREAM"
else
  framework/scripts/web-auth-users.sh init
fi
