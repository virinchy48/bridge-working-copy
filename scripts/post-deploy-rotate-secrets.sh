#!/usr/bin/env bash
# ============================================================
# Post-Deploy XSUAA Secret Rotation
# ============================================================
# Run after every `cf deploy` to rotate the XSUAA client secret
# in GitHub Actions secrets. The deploy rebinds nhvr-xsuaa to
# nhvr-bridge-srv, which rotates the clientsecret. Without this,
# the scheduled BTP Smoke Test workflow fails with:
#   "4/5 — Could not obtain JWT — invalid_client - Bad credentials"
#
# Usage:
#   ./scripts/post-deploy-rotate-secrets.sh
#
# Prerequisites:
#   - cf CLI authenticated (cf target shows correct org/space)
#   - gh CLI authenticated (gh auth status)
#   - jq installed (brew install jq)
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

APP_NAME="nhvr-bridge-srv"

echo "── Extracting XSUAA credentials from ${APP_NAME} ──"

# Extract VCAP_SERVICES JSON from cf env output
VCAP_JSON=$(cf env "$APP_NAME" 2>/dev/null | python3 -c '
import sys, re, json
t = sys.stdin.read()
m = re.search(r"VCAP_SERVICES:\s*(\{.*?\})\s*\n\s*\n", t, re.DOTALL)
if not m:
    print("ERROR", file=sys.stderr)
    sys.exit(1)
print(json.dumps(json.loads(m.group(1))["xsuaa"][0]["credentials"]))
')

if [ $? -ne 0 ] || [ -z "$VCAP_JSON" ]; then
    echo -e "${RED}Failed to extract VCAP_SERVICES from ${APP_NAME}${NC}"
    echo "Ensure you are logged in: cf target"
    exit 1
fi

CLIENT_ID=$(echo "$VCAP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['clientid'])")
CLIENT_SECRET=$(echo "$VCAP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['clientsecret'])")

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo -e "${RED}Failed to parse clientid/clientsecret${NC}"
    exit 1
fi

echo -e "  clientid:     ${CLIENT_ID:0:20}..."
echo -e "  clientsecret: ${CLIENT_SECRET:0:8}... (length=${#CLIENT_SECRET})"

echo ""
echo "── Pushing to GitHub Actions secrets ──"

echo "$CLIENT_ID" | gh secret set XSUAA_CLIENT_ID 2>/dev/null
echo -e "  ${GREEN}✓ XSUAA_CLIENT_ID set${NC}"

echo "$CLIENT_SECRET" | gh secret set XSUAA_SECRET 2>/dev/null
echo -e "  ${GREEN}✓ XSUAA_SECRET set${NC}"

echo ""
echo "── Triggering BTP Smoke Test workflow ──"
RUN_URL=$(gh workflow run "BTP Smoke Test" 2>&1)
echo -e "  ${GREEN}✓ Workflow triggered${NC}"
echo "  $RUN_URL"

echo ""
echo -e "${GREEN}Done.${NC} Monitor smoke test: gh run list --workflow='BTP Smoke Test' --limit 1"
