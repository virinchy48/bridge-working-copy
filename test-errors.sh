#!/usr/bin/env bash
# ============================================================
# NHVR Test Error Report
# Usage: ./test-errors.sh [--verbose] [--file <test-file>]
# ============================================================
export PATH="/Users/siddharthaampolu/.nvm/versions/node/v20.19.6/bin:$PATH"
cd "$(dirname "$0")"

VERBOSE=false
FILE_FILTER=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v) VERBOSE=true; shift;;
    --file|-f) FILE_FILTER="$2"; shift 2;;
    *) echo "Usage: $0 [--verbose] [--file <pattern>]"; exit 1;;
  esac
done

JEST_ARGS=(--testPathPattern "test/" --no-coverage --no-color)
if [[ -n "$FILE_FILTER" ]]; then
  JEST_ARGS=(--testPathPattern "$FILE_FILTER" --no-coverage --no-color)
fi

echo "Running tests..."
RAW=$(npx jest "${JEST_ARGS[@]}" 2>&1)

# Normalize worktree paths
RAW_CLEAN=$(echo "$RAW" | sed 's|\.claude/worktrees/[^/]*/||g')

# ── Header ──
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      NHVR TEST ERROR REPORT              ║"
echo "║      $(date '+%Y-%m-%d %H:%M:%S')                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "$RAW_CLEAN" | grep "^Test Suites:"
echo "$RAW_CLEAN" | grep "^Tests:"
echo ""

# ── Failed suites ──
echo "┌──────────────────────────────────────────┐"
echo "│  FAILED TEST SUITES                      │"
echo "└──────────────────────────────────────────┘"
echo "$RAW_CLEAN" | grep "^FAIL " | sort -u | nl -ba
echo ""

# ── Error categories ──
echo "┌──────────────────────────────────────────┐"
echo "│  ERROR CATEGORIES                        │"
echo "└──────────────────────────────────────────┘"

# Count by error type using temp file to avoid subshell issues
TMPCAT=$(mktemp)
echo "$RAW_CLEAN" | grep -oE "expect\(received\)\.[a-zA-Z]+\(expected\)" >> "$TMPCAT"
echo "$RAW_CLEAN" | grep -c "TypeError:" | xargs -I{} printf "TypeError ({})\n" >> "$TMPCAT" 2>/dev/null
echo "$RAW_CLEAN" | grep -c "ASSERT_MANDATORY" | xargs -I{} printf "ASSERT_MANDATORY ({})\n" >> "$TMPCAT" 2>/dev/null
echo "$RAW_CLEAN" | grep -c "cannot be resolved" | xargs -I{} printf "Target cannot be resolved ({})\n" >> "$TMPCAT" 2>/dev/null
echo "$RAW_CLEAN" | grep -c "enforce_auth" | xargs -I{} printf "Auth rejection / missing scopes ({})\n" >> "$TMPCAT" 2>/dev/null

AUTH_COUNT=$(echo "$RAW_CLEAN" | grep -c "enforce_auth" || true)
TYPE_COUNT=$(echo "$RAW_CLEAN" | grep -c "TypeError:" || true)
ASSERT_COUNT=$(echo "$RAW_CLEAN" | grep -c "ASSERT_MANDATORY" || true)
RESOLVE_COUNT=$(echo "$RAW_CLEAN" | grep -c "cannot be resolved" || true)
EXPECT_CONTAIN=$(echo "$RAW_CLEAN" | grep -c "expect(received).toContain(expected)" || true)
EXPECT_BE=$(echo "$RAW_CLEAN" | grep -c "expect(received).toBe(expected)" || true)
EXPECT_MATCH=$(echo "$RAW_CLEAN" | grep -c "expect(received).toMatch(expected)" || true)
EXPECT_LENGTH=$(echo "$RAW_CLEAN" | grep -c "expect(received).toHaveLength(expected)" || true)

printf "  %-45s %s\n" "Auth rejection (enforce_auth)" "$AUTH_COUNT"
printf "  %-45s %s\n" "TypeError (runtime)" "$TYPE_COUNT"
printf "  %-45s %s\n" "ASSERT_MANDATORY" "$ASSERT_COUNT"
printf "  %-45s %s\n" "Target cannot be resolved" "$RESOLVE_COUNT"
printf "  %-45s %s\n" "expect().toContain() mismatch" "$EXPECT_CONTAIN"
printf "  %-45s %s\n" "expect().toBe() mismatch" "$EXPECT_BE"
printf "  %-45s %s\n" "expect().toMatch() mismatch" "$EXPECT_MATCH"
printf "  %-45s %s\n" "expect().toHaveLength() mismatch" "$EXPECT_LENGTH"
rm -f "$TMPCAT"
echo ""

# ── Per-suite grouped errors ──
echo "┌──────────────────────────────────────────┐"
echo "│  ERRORS BY TEST SUITE                    │"
echo "└──────────────────────────────────────────┘"

CURRENT_SUITE=""
echo "$RAW_CLEAN" | grep -E "^(FAIL |  ● )" | sort -u | while IFS= read -r line; do
  if echo "$line" | grep -q "^FAIL "; then
    SUITE=$(echo "$line" | sed 's/^FAIL //' | sed 's/ (.*//')
    if [[ "$SUITE" != "$CURRENT_SUITE" ]]; then
      CURRENT_SUITE="$SUITE"
      echo ""
      echo "  [$SUITE]"
    fi
  else
    TEST_NAME=$(echo "$line" | sed 's/.*● //')
    echo "    x $TEST_NAME"
  fi
done
echo ""

# ── Root cause summary ──
echo "┌──────────────────────────────────────────┐"
echo "│  ROOT CAUSE SUMMARY                      │"
echo "└──────────────────────────────────────────┘"
echo ""
echo "  1. Auth rejection (enforce_auth)"
echo "     Tests use PRIV context without proper XSUAA scopes."
echo "     Affects: bridge-service, phase11-full-qa, phase9-security-perf,"
echo "              concurrency-edge, group-isolation, supertester-v2"
echo ""
echo "  2. String assertions on service.js"
echo "     Tests check service.js for handler code that moved to srv/handlers/."
echo "     Affects: data-consistency"
echo ""
echo "  3. TypeError: .orderby is not a function"
echo "     CDS query API mismatch in reports.js."
echo "     Affects: permit-report"
echo ""
echo "  4. ASSERT_MANDATORY"
echo "     Missing required fields in permit creation."
echo "     Affects: permit-report"
echo ""
echo "  5. Operator role now recognized"
echo "     Test expected Operator to be unknown, but it's now a valid role."
echo "     Affects: phase9-role-auth"
echo ""
echo "  6. Route assessment limitingAsset"
echo "     assessFreightRouteVehicle returns RA-B001 instead of RA-B002."
echo "     Affects: route-assessment"
echo ""

# ── Verbose: full error messages ──
if $VERBOSE; then
  echo "┌──────────────────────────────────────────┐"
  echo "│  FULL ERROR OUTPUT                       │"
  echo "└──────────────────────────────────────────┘"
  echo ""
  echo "$RAW_CLEAN" | awk '
    /^FAIL /     { printing=1; print; next }
    /^PASS /     { printing=0; next }
    /^Test Suites:/ { printing=0; next }
    printing     { print }
  '
fi

echo "╔══════════════════════════════════════════╗"
echo "║  --verbose   Full stack traces           ║"
echo "║  --file X    Filter to matching tests    ║"
echo "╚══════════════════════════════════════════╝"
