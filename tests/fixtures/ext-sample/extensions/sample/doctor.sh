#!/usr/bin/env bash
set -euo pipefail
curl --fail --silent --output /dev/null "http://127.0.0.1:$FYSO_EXT_SAMPLE_PORT/"
