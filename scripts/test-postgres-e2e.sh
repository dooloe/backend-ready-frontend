#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

project="kezek-postgres-e2e-${$}"
if [[ -n "${KEZEK_TEST_PORT:-}" ]]; then
  port="$KEZEK_TEST_PORT"
else
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
fi
export COMPOSE_PROJECT_NAME="$project"
export KEZEK_TEST_PORT="$port"
export KEZEK_PORT="$port"
export POSTGRES_PASSWORD=kezek_test_only
export KEZEK_REPO_ROOT="$root"

compose=(docker compose -p "$project" -f docker-compose.yaml -f compose.test.yaml)
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans
}
trap cleanup EXIT

"${compose[@]}" up -d --build --wait
base_url="http://127.0.0.1:${port}"
curl --fail --silent --show-error --retry 30 --retry-connrefused --retry-delay 2 "${base_url}/" --output /dev/null
KEZEK_E2E_BASE_URL="${base_url}" npm --prefix frontend run test:compose
KEZEK_E2E_BASE_URL="http://127.0.0.1:${port}" npm --prefix frontend run test:postgres
