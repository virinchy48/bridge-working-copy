#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-4404}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVICE_URL="${BASE_URL}/bridge-management"
AUTH_HEADER="Authorization: Basic $(printf 'admin:admin' | base64)"
SERVER_LOG="${TMPDIR:-/tmp}/nhvr-e2e-smoke.log"

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

print_step() {
  printf "\n==> %s\n" "$*"
}

assert_http_ok() {
  local url="$1"
  local accept_header="$2"
  local output_file
  output_file="$(mktemp)"
  local status
  status=$(curl -sS -o "$output_file" -w '%{http_code}' -H "$AUTH_HEADER" -H "Accept: ${accept_header}" "$url")
  if [ "$status" != "200" ]; then
    printf 'Request failed (%s): %s\n' "$status" "$url" >&2
    cat "$output_file" >&2
    rm -f "$output_file"
    exit 1
  fi
  rm -f "$output_file"
}

print_step "Prepare local sqlite database"
if [ ! -f db.sqlite ]; then
  npx cds deploy --profile development --to sqlite:db.sqlite >/dev/null
fi

print_step "Start CAP service"
PORT="$PORT" npx cds serve --profile development >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  if curl -sS -o /dev/null -H "$AUTH_HEADER" "$SERVICE_URL/\$metadata" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! kill -0 "$SERVER_PID" 2>/dev/null || ! curl -sS -o /dev/null -H "$AUTH_HEADER" "$SERVICE_URL/\$metadata" 2>/dev/null; then
  printf 'CAP service did not start. Log:\n' >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

print_step "Run OData smoke checks"
assert_http_ok "$SERVICE_URL/\$metadata" "application/xml"
assert_http_ok "$SERVICE_URL/me()" "application/json"
assert_http_ok "$SERVICE_URL/Bridges?\$top=1" "application/json"
assert_http_ok "$SERVICE_URL/Restrictions?\$top=1" "application/json"
assert_http_ok "$SERVICE_URL/InspectionOrders?\$top=1" "application/json"
assert_http_ok "$SERVICE_URL/WorkOrders?\$top=1" "application/json"

print_step "Smoke regression passed"
printf 'Validated: metadata, auth, Bridges, Restrictions, InspectionOrders, WorkOrders\n'
