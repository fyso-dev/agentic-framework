#!/usr/bin/env bash
# The framework calls this only when the declared encrypted secret is present.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec bash extensions/cloudflare/certificate.sh
