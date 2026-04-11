#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

print_step() {
  printf "\n==> %s\n" "$*"
}

if [ "${SKIP_LINT:-0}" != "1" ]; then
  print_step "1/3 Lint"
  npm run lint --silent
fi

if [ "${SKIP_CDS:-0}" != "1" ]; then
  print_step "2/3 CDS compile"
  npx cds compile srv/service.cds --to sql >/dev/null
fi

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  print_step "3/3 Fast unit tests"
  npm run test:unit --silent
fi

printf "\nverify-session passed\n"
