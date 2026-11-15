#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node extensions/cloudflare/doctor.cjs
