#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ ! -f .env ]]; then
  echo 'Create the private .env first; see deploy/oracle/README.md.' >&2
  exit 1
fi
chmod 600 .env
mkdir -p .deploy
chmod 700 .deploy
exec 9>.deploy/lock
flock -w 1200 9
compose=(sudo docker compose)
"${compose[@]}" config --quiet
"${compose[@]}" build app
"${compose[@]}" run --rm --no-deps app node deploy/oracle/check-env.js
"${compose[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${compose[@]}" up -d --wait --wait-timeout 180
curl --fail --silent --show-error http://127.0.0.1:3000/health
echo
"${compose[@]}" ps
echo 'App is running. Open the HTTPS hostname in .env; initial certificate issuance may take a few minutes.'
