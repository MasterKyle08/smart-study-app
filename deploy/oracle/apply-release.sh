#!/usr/bin/env bash
# GitHub uploads this script over SSH; the original ZIP upload needs no Git checkout.
set -euo pipefail
release_sha="${1:-}"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Expected a full Git commit SHA.' >&2
  exit 1
fi
project_dir="${ORACLE_DEPLOY_DIR:-/home/ubuntu/smart-study-app}"
if [[ ! -d "$project_dir" || ! -f "$project_dir/.env" ]]; then
  echo 'The existing project directory and private .env are required.' >&2
  exit 1
fi
project_dir="$(realpath "$project_dir")"
for executable in rsync flock docker; do
  command -v "$executable" >/dev/null || { echo "Install $executable before enabling deployment." >&2; exit 1; }
done
sudo -n docker compose version >/dev/null
mkdir -p "$project_dir/.deploy"
chmod 700 "$project_dir/.deploy"
exec 9>"$project_dir/.deploy/lock"
flock -w 1200 9
archive="$project_dir/.deploy/incoming/$release_sha.tar.gz"
test -f "$archive"
stage="$(mktemp -d "$project_dir/.deploy/stage-$release_sha-XXXXXX")"
cleanup() {
  # Only remove this script's own staging directory, inside the verified project.
  case "$stage" in "$project_dir"/.deploy/stage-*) rm -rf -- "$stage" ;; esac
}
trap cleanup EXIT
tar -xzf "$archive" --no-same-owner -C "$stage"
for directory in backend public deploy scripts; do
  if [[ ! -d "$stage/$directory" || -L "$stage/$directory" || -L "$project_dir/$directory" ]]; then
    echo "Invalid source directory: $directory" >&2
    exit 1
  fi
done
ln -s "$project_dir/.env" "$stage/.env"
cd "$stage"
compose=(sudo -n docker compose)
"${compose[@]}" config --quiet
# Build and validate before changing the running application's source directory.
"${compose[@]}" build app
"${compose[@]}" run --rm --no-deps app node deploy/oracle/check-env.js
"${compose[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
for directory in backend public deploy scripts; do
  mkdir -p "$project_dir/$directory"
  rsync -a --delete --exclude='.env' --exclude='.env.*' "$stage/$directory/" "$project_dir/$directory/"
done
for file in Dockerfile compose.yml .dockerignore package.json package-lock.json server.js tailwind.config.js SECURITY-UPGRADE.md; do
  test -f "$stage/$file"
  cp -- "$stage/$file" "$project_dir/$file"
done
cd "$project_dir"
chmod 600 .env
"${compose[@]}" up -d --wait --wait-timeout 180
# Refresh the bind-mounted Caddyfile as well as any hostname/config changes.
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 180 caddy
curl --fail --silent --show-error http://127.0.0.1:3000/health
echo
printf '%s\n' "$release_sha" > .deploy/current-commit
rm -- "$archive"
rm -f -- ".deploy/incoming/$release_sha.sh"
echo "Deployed commit $release_sha."
