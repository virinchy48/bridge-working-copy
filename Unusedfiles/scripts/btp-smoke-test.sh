#!/usr/bin/env bash
# ============================================================
# NHVR Bridge App — BTP Smoke Test
# ============================================================
# Fast read-only smoke test against the deployed BTP app.
# Runs a dozen assertions covering: unauthenticated challenges,
# authenticated OData reads, v4.7.5 Restrictions.nhvrRef column,
# and key entity counts.
#
# Auth: XSUAA password grant via CF_USERNAME / CF_PASSWORD.
# Works for non-federated test accounts only. Federated/MFA
# accounts will fail password grant — use a dedicated BTP
# technical user.
#
# Usage:
#     CF_USERNAME=user@example.com CF_PASSWORD=... ./scripts/btp-smoke-test.sh
#
# Optional overrides:
#     APP_ROUTER_URL  — default: https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com
#     BACKEND_URL     — default: https://592f5a7btrial-dev-nhvr-bridge-srv.cfapps.us10-001.hana.ondemand.com
#     XSUAA_URL       — default: https://592f5a7btrial.authentication.us10.hana.ondemand.com
#     XSUAA_CLIENT_ID — default: sb-nhvr-bridge-app!t612345  (override via env)
#     XSUAA_SECRET    — empty by default (password grant with a public client is attempted first)
#
# Schedule as a daily cron or GitHub Action via workflow_dispatch.
# ============================================================
set -uo pipefail

APP_ROUTER_URL="${APP_ROUTER_URL:-https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com}"
BACKEND_URL="${BACKEND_URL:-https://592f5a7btrial-dev-nhvr-bridge-srv.cfapps.us10-001.hana.ondemand.com}"
XSUAA_URL="${XSUAA_URL:-https://592f5a7btrial.authentication.us10.hana.ondemand.com}"
XSUAA_CLIENT_ID="${XSUAA_CLIENT_ID:-}"
XSUAA_SECRET="${XSUAA_SECRET:-}"

PASS=0
FAIL=0
TOTAL=0
FAILURES=""

say()  { printf '%s\n' "$*"; }
hr()   { printf -- '─%.0s' $(seq 1 60); printf '\n'; }

check() {
    local desc="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL+1))
    if [ "$actual" = "$expected" ]; then
        say "  ✅ $desc"
        PASS=$((PASS+1))
    else
        say "  ❌ $desc (expected=$expected got=$actual)"
        FAIL=$((FAIL+1))
        FAILURES="$FAILURES\n  - $desc (expected=$expected got=$actual)"
    fi
}

check_ge() {
    local desc="$1" min="$2" actual="$3"
    TOTAL=$((TOTAL+1))
    if [ "$actual" -ge "$min" ] 2>/dev/null; then
        say "  ✅ $desc (got=$actual, min=$min)"
        PASS=$((PASS+1))
    else
        say "  ❌ $desc (got=$actual, min=$min)"
        FAIL=$((FAIL+1))
        FAILURES="$FAILURES\n  - $desc (got=$actual, min=$min)"
    fi
}

say ""
say "┌────────────────────────────────────────────────────────────┐"
say "│           NHVR Bridge App — BTP Smoke Test                 │"
say "└────────────────────────────────────────────────────────────┘"
say "App Router : $APP_ROUTER_URL"
say "Backend    : $BACKEND_URL"
say "XSUAA      : $XSUAA_URL"
say "Run time   : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
say ""

# ── Section 1: Unauthenticated health + redirect -----------------
hr
say "Section 1 — Unauthenticated checks (no token)"
hr

root_code=$(curl -sI -o /dev/null -w "%{http_code}" "$APP_ROUTER_URL/")
check "App router root responds (302 expected)" "302" "$root_code"

# Use HEAD (-I) — GET returns 200 with a JS login-bootstrap HTML page,
# HEAD surfaces the underlying 401 XSUAA challenge from the app router.
idx_code=$(curl -sI -o /dev/null -w "%{http_code}" "$APP_ROUTER_URL/nhvr.bridgemanagement/index.html")
check "index.html returns 401 (XSUAA challenge)" "401" "$idx_code"

bm_code=$(curl -sI -o /dev/null -w "%{http_code}" "$APP_ROUTER_URL/bridge-management/Restrictions")
check "Restrictions OData returns 401 when unauthenticated" "401" "$bm_code"

srv_code=$(curl -sI -o /dev/null -w "%{http_code}" "$BACKEND_URL/bridge-management/")
check "Backend direct returns 401 when unauthenticated" "401" "$srv_code"

# ── Section 2: Acquire XSUAA JWT via password grant --------------
hr
say "Section 2 — XSUAA password-grant authentication"
hr

if [ -z "${CF_USERNAME:-}" ] || [ -z "${CF_PASSWORD:-}" ]; then
    say "  ⚠  CF_USERNAME/CF_PASSWORD not set — skipping authenticated checks."
    say "  ℹ  Export them to run the full suite:"
    say "     export CF_USERNAME='user@example.com'"
    say "     export CF_PASSWORD='...'"
    skip_auth=1
else
    skip_auth=0
fi

TOKEN=""
if [ "$skip_auth" = "0" ]; then
    # Try with supplied client id/secret, then fall back to 'cf' public client.
    # The 'cf' client is the Cloud Foundry OAuth client pre-registered in XSUAA
    # on BTP trial and accepts password grant without a secret.
    for CID in "${XSUAA_CLIENT_ID}" "cf"; do
        [ -z "$CID" ] && continue
        if [ -n "$XSUAA_SECRET" ] && [ "$CID" != "cf" ]; then
            AUTH_ARG=(-u "$CID:$XSUAA_SECRET")
        else
            AUTH_ARG=(-u "$CID:")
        fi
        resp=$(curl -s "${AUTH_ARG[@]}" \
            -d "grant_type=password" \
            --data-urlencode "username=$CF_USERNAME" \
            --data-urlencode "password=$CF_PASSWORD" \
            -d "response_type=token" \
            "$XSUAA_URL/oauth/token")
        TOKEN=$(printf '%s' "$resp" | python3 -c 'import sys,json;d=json.loads(sys.stdin.read() or "{}");print(d.get("access_token",""))' 2>/dev/null)
        if [ -n "$TOKEN" ]; then
            say "  ✅ Obtained JWT via client '$CID' (len=${#TOKEN})"
            break
        else
            err=$(printf '%s' "$resp" | python3 -c 'import sys,json;d=json.loads(sys.stdin.read() or "{}");print(d.get("error",""),"-",d.get("error_description",""))' 2>/dev/null)
            say "  ⚠  Client '$CID' failed: $err"
        fi
    done
    if [ -z "$TOKEN" ]; then
        say "  ❌ Could not obtain JWT — authenticated checks will be skipped."
        FAIL=$((FAIL+1))
        TOTAL=$((TOTAL+1))
        FAILURES="$FAILURES\n  - JWT acquisition failed"
    fi
fi

# ── Section 3: Authenticated OData checks ------------------------
if [ -n "$TOKEN" ]; then
    hr
    say "Section 3 — Authenticated OData checks (JWT via backend)"
    hr

    AUTH_HDR="Authorization: Bearer $TOKEN"

    # 3.1 Root service document
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/")
    check "Backend service root returns 200" "200" "$code"

    # 3.2 Bridges count ≥ 2000
    bridge_count=$(curl -s -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/Bridges/\$count" 2>/dev/null | tr -d '[:space:]')
    bridge_count=${bridge_count:-0}
    check_ge "Bridges \$count returns ≥ 2000" 2000 "$bridge_count"

    # 3.3 Restrictions reachable
    rcode=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/Restrictions?\$top=1")
    check "Restrictions top=1 returns 200" "200" "$rcode"

    # 3.4 v4.7.5 — Restrictions expose nhvrRef via \$select
    nhvr_resp=$(curl -s -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/Restrictions?\$select=nhvrRef,restrictionType&\$top=20")
    nhvr_count=$(printf '%s' "$nhvr_resp" | python3 -c 'import sys,json;d=json.loads(sys.stdin.read() or "{}");v=d.get("value",[]);print(sum(1 for r in v if r.get("nhvrRef")))' 2>/dev/null)
    nhvr_count=${nhvr_count:-0}
    check_ge "v4.7.5: ≥1 Restriction row has nhvrRef populated" 1 "$nhvr_count"

    # 3.5 VehicleTypes present
    vt_resp=$(curl -s -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/VehicleTypes?\$top=1")
    vt_has_value=$(printf '%s' "$vt_resp" | python3 -c 'import sys,json;d=json.loads(sys.stdin.read() or "{}");print(1 if d.get("value") else 0)' 2>/dev/null)
    check "VehicleTypes entity reachable and non-empty" "1" "${vt_has_value:-0}"

    # 3.6 InspectionOrders entity
    io_code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/InspectionOrders?\$top=1")
    check "InspectionOrders top=1 returns 200" "200" "$io_code"

    # 3.7 BridgeDefects entity
    bd_code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HDR" \
        "$BACKEND_URL/bridge-management/BridgeDefects?\$top=1")
    check "BridgeDefects top=1 returns 200" "200" "$bd_code"
fi

# ── Summary ------------------------------------------------------
hr
say "Summary"
hr
say "  Passed : $PASS / $TOTAL"
say "  Failed : $FAIL / $TOTAL"
if [ "$FAIL" -gt 0 ]; then
    printf '%b' "\nFailures:$FAILURES\n"
    exit 1
fi
say ""
say "  ✅ All smoke checks passed."
exit 0
