#!/usr/bin/env bash
set -euo pipefail
export SSL_CERT_FILE="$(uv run python -c 'import certifi; print(certifi.where())')"
echo "✅ SSL_CERT_FILE set to: $SSL_CERT_FILE"
