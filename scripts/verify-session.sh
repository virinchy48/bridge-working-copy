#!/usr/bin/env bash
# ============================================================
# verify-session.sh — fast pre-commit / pre-deploy safety net
#
# Runs in <30s on a warm cache. Bails on the FIRST failure.
# Use this before every commit or before walking away from a change.
#
# Checks (in order, cheapest first):
#   1. Mirror drift  — app/bridge-management/webapp/ vs app-router/resources/*
#   2. Lint          — npm run lint
#   3. CDS compile   — catches schema.cds / service.cds breakage
#   4. Fast tests    — npm run test:unit (skips slow integration/supertester)
#
# Skip groups with env vars if you know what you're doing:
#   SKIP_MIRROR=1 SKIP_LINT=1 SKIP_CDS=1 SKIP_TESTS=1
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

step() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

START=$(date +%s)

# ── 1. Mirror drift ──────────────────────────────────────────
if [ "${SKIP_MIRROR:-0}" != "1" ]; then
  step "1/4 Mirror drift check"
  SRC="app/bridge-management/webapp"
  DEST1="app-router/resources/nhvr.bridgemanagement"
  DEST2="app-router/resources/webapp"

  drift=0
  for DEST in "$DEST1" "$DEST2"; do
    if [ -d "$DEST" ]; then
      # --dry-run surfaces any files that would be transferred
      if diff_output=$(rsync -a --dry-run --delete --exclude='*.test.js' --exclude='test/' "$SRC/" "$DEST/" 2>&1) && [ -z "$diff_output" ]; then
        green "  ✓ $DEST in sync"
      else
        # rsync returns empty stdout when in sync; non-empty means drift
        if [ -n "${diff_output// }" ]; then
          red "  ✗ $DEST has drift:"
          echo "$diff_output" | head -20
          drift=1
        else
          green "  ✓ $DEST in sync"
        fi
      fi
    else
      yellow "  - $DEST missing (skipped)"
    fi
  done
  if [ $drift -eq 1 ]; then
    red "Mirror drift detected. Run: npm run sync-ui && npm run sync-ui:webapp"
    exit 1
  fi
else
  yellow "1/4 Mirror drift — SKIPPED"
fi

# ── 2. Lint ──────────────────────────────────────────────────
if [ "${SKIP_LINT:-0}" != "1" ]; then
  step "2/4 Lint"
  npm run lint --silent
  green "  ✓ lint clean"
else
  yellow "2/4 Lint — SKIPPED"
fi

# ── 3. CDS compile ───────────────────────────────────────────
if [ "${SKIP_CDS:-0}" != "1" ]; then
  step "3/4 CDS compile (schema + service)"
  npx cds compile srv/service.cds --to sql >/dev/null
  green "  ✓ cds compile ok"
else
  yellow "3/4 CDS compile — SKIPPED"
fi

# ── 4. Fast tests ────────────────────────────────────────────
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "4/4 Fast unit tests"
  if [ ! -f db.sqlite ]; then
    yellow "  db.sqlite missing — materializing"
    npx cds deploy --to sqlite:db.sqlite >/dev/null
  fi
  npm run test:unit --silent
  green "  ✓ unit tests pass"
else
  yellow "4/4 Fast tests — SKIPPED"
fi

END=$(date +%s)
green "\n✓ verify-session passed in $((END - START))s"
