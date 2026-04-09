#!/usr/bin/env bash
# ============================================================
# NHVR Smoke-Tester XSUAA Client — Setup Script
# ------------------------------------------------------------
# Creates a dedicated read-only XSUAA OAuth2 client for
# scheduled BTP smoke tests. Uses client-credentials flow and
# a foreign-scope-reference to the main nhvr-bridge-app Viewer
# scope, so the smoke workflow never needs human credentials.
#
# ⚠  INCOMPLETE — XSUAA trial plan blocks cross-app scope grant.
# ----------------------------------------------------------------
# Attempted in v4.7.8 and again in v4.7.9 (2026-04-06):
#
# Step 1  create.sh provisions the service and key successfully.
# Step 2  client_credentials token IS issued, BUT the JWT payload
#         only contains scope=[uaa.resource, <smoke>.SmokeTest] and
#         audience=[uaa, sb-nhvr-smoke-tester, nhvr-smoke-tester]
#         — NO reference to the main app's Viewer scope.
# Step 3  Backend therefore returns 401 to every request.
#
# Tried (all failed to inject the Viewer scope):
#   a) foreign-scope-references in smoke-tester/xs-security.json
#      pointing at "nhvr-bridge-app-592f5a7btrial-dev.Viewer".
#   b) authorities[] in smoke-tester/xs-security.json listing the
#      same fully-qualified Viewer scope.
#   c) grant-as-authority-to-apps on the main app's
#      $XSAPPNAME.Viewer scope, with value
#      "$XSAPPNAME(application,nhvr-smoke-tester)", followed by
#      a full main-app redeploy AND a manual
#      `cf update-service nhvr-xsuaa -c xs-security.json`, AND a
#      delete+recreate of the smoke-tester service.
#
# Likely root cause: BTP trial plan restricts cross-app scope
# trust in ways the docs don't clearly call out. A production /
# non-trial XSUAA plan would almost certainly honour the (c)
# path with the correct syntax.
#
# Alternative paths to explore in a dedicated session:
#   • Create a dedicated technical user in the NHVR_Viewer role
#     collection and use password-grant (current workflow does
#     this via CF_USERNAME/CF_PASSWORD — just needs a real
#     non-federated BTP test account).
#   • Request an upgraded XSUAA plan.
#   • Investigate `role-collections` auto-assignment on the
#     smoke-tester client.
#
# Until one of those lands, .github/workflows/btp-smoke-test.yml
# stays on the password-grant path via CF_USERNAME/CF_PASSWORD.
# ----------------------------------------------------------------
#
# Usage:
#   cf login -a https://api.cf.us10-001.hana.ondemand.com
#   ./infra/smoke-tester/create.sh
#
# Rerun-safe: if the service already exists it is updated in
# place; if the service-key already exists it is rotated.
# ============================================================
set -euo pipefail

SERVICE_NAME="nhvr-smoke-tester"
KEY_NAME="nhvr-smoke-tester-key"
CONFIG_FILE="$(cd "$(dirname "$0")" && pwd)/xs-security.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: config not found at $CONFIG_FILE" >&2
    exit 1
fi

if ! command -v cf >/dev/null 2>&1; then
    echo "ERROR: cf CLI not on PATH. Install CF CLI v8+ first." >&2
    exit 1
fi

if ! cf target >/dev/null 2>&1; then
    echo "ERROR: not logged in. Run: cf login -a https://api.cf.us10-001.hana.ondemand.com" >&2
    exit 1
fi

echo "→ Checking existing $SERVICE_NAME service instance…"
if cf service "$SERVICE_NAME" >/dev/null 2>&1; then
    echo "  found — updating in place"
    cf update-service "$SERVICE_NAME" -c "$CONFIG_FILE"
else
    echo "  not found — creating"
    cf create-service xsuaa application "$SERVICE_NAME" -c "$CONFIG_FILE"
fi

# Wait for service to be ready (XSUAA ops are synchronous on BTP trial but safe to retry)
for i in 1 2 3 4 5; do
    STATUS=$(cf service "$SERVICE_NAME" | awk '/status:/ {print $2}' | head -1)
    if [ "$STATUS" = "succeeded" ] || [ -z "$STATUS" ]; then
        break
    fi
    echo "  waiting for service ($i/5)… status=$STATUS"
    sleep 4
done

echo "→ Rotating service key $KEY_NAME…"
if cf service-key "$SERVICE_NAME" "$KEY_NAME" >/dev/null 2>&1; then
    cf delete-service-key "$SERVICE_NAME" "$KEY_NAME" -f
fi
cf create-service-key "$SERVICE_NAME" "$KEY_NAME"

echo
echo "✅ Smoke-tester client created. Retrieve credentials with:"
echo "   cf service-key $SERVICE_NAME $KEY_NAME"
echo
echo "The output includes:"
echo "   clientid, clientsecret, url (token endpoint base)"
echo
echo "Token request (curl):"
echo "   curl -u \"\$CLIENTID:\$CLIENTSECRET\" \\"
echo "        -d \"grant_type=client_credentials\" \\"
echo "        \"\$URL/oauth/token\""
echo
echo "Store these in GitHub Actions secrets as:"
echo "   NHVR_SMOKE_CLIENT_ID, NHVR_SMOKE_CLIENT_SECRET, NHVR_SMOKE_TOKEN_URL"
