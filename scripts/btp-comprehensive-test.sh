#!/bin/bash
# ============================================================
# NHVR Bridge App — Comprehensive Functional Test Suite
# Tests: All Personas, RBAC, CRUD, Mass Upload/Download, Reports
# ============================================================
set -uo pipefail

BASE="http://localhost:4004/bridge-management"
PASS=0
FAIL=0
TOTAL=0
FAILURES=""

# ── Helpers ──────────────────────────────────────────────────
check() {
    local desc="$1" expected="$2" actual="$3"
    TOTAL=$((TOTAL+1))
    if [ "$actual" = "$expected" ]; then
        echo "  ✅ $desc"
        PASS=$((PASS+1))
    else
        echo "  ❌ $desc (expected=$expected, got=$actual)"
        FAIL=$((FAIL+1))
        FAILURES="$FAILURES\n  - $desc"
    fi
}

check_not() {
    local desc="$1" not_expected="$2" actual="$3"
    TOTAL=$((TOTAL+1))
    if [ "$actual" != "$not_expected" ]; then
        echo "  ✅ $desc"
        PASS=$((PASS+1))
    else
        echo "  ❌ $desc (got unwanted=$actual)"
        FAIL=$((FAIL+1))
        FAILURES="$FAILURES\n  - $desc"
    fi
}

# Use -u flag for auth (more reliable than header-based)
get_code() { curl -s -o /dev/null -w "%{http_code}" -u "$2" "$1"; }
get_count() { curl -s -u "$2" "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('value',[])))" 2>/dev/null || echo "0"; }
get_json() { curl -s -u "$1" "$2"; }
post_code() { curl -s -o /dev/null -w "%{http_code}" -u "$2" -X POST -H "Content-Type: application/json" -d "$3" "$1"; }
patch_code() { curl -s -o /dev/null -w "%{http_code}" -u "$2" -X PATCH -H "Content-Type: application/json" -d "$3" "$1"; }
delete_code() { curl -s -o /dev/null -w "%{http_code}" -u "$2" -X DELETE "$1"; }
post_json() { curl -s -u "$2" -X POST -H "Content-Type: application/json" -d "$3" "$1"; }

# Persona credentials
ADMIN="admin:admin"
MANAGER="manager:manager"
VIEWER="viewer:viewer"
EXECUTIVE="executive:executive"
INSPECTOR="inspector:inspector"
OPERATOR="operator:operator"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  NHVR Bridge App — Comprehensive Functional Test        ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')                                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 1: AUTHENTICATION & PERSONA ACCESS
# ═══════════════════════════════════════════════════════════════
echo "━━━ 1. AUTHENTICATION & PERSONA ACCESS ━━━"

check "Admin can access service root" "200" "$(get_code "$BASE/" "$ADMIN")"
check "Manager can access service root" "200" "$(get_code "$BASE/" "$MANAGER")"
check "Viewer can access service root" "200" "$(get_code "$BASE/" "$VIEWER")"
check "Executive can access service root" "200" "$(get_code "$BASE/" "$EXECUTIVE")"
check "Inspector can access service root" "200" "$(get_code "$BASE/" "$INSPECTOR")"
check "Operator can access service root" "200" "$(get_code "$BASE/" "$OPERATOR")"
# Note: In dev mode with dummy auth, unauthenticated may get 200 (anonymous user)
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
echo "  ℹ️  Unauthenticated access: $UNAUTH_CODE (200 expected in dev/dummy auth mode)"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 2: RBAC — READ ACCESS (all personas)
# ═══════════════════════════════════════════════════════════════
echo "━━━ 2. RBAC — READ ACCESS ━━━"

ENTITIES="Bridges Restrictions Routes VehicleClasses InspectionOrders BridgeDefects FreightRoutes BridgeHistory Lookups AttributeDefinitions"
for entity in $ENTITIES; do
    for persona in "Admin:$ADMIN" "Manager:$MANAGER" "Viewer:$VIEWER" "Executive:$EXECUTIVE" "Inspector:$INSPECTOR"; do
        name="${persona%%:*}"
        creds="${persona#*:}"
        code=$(get_code "$BASE/$entity?\$top=1" "$creds")
        check "$name can READ $entity" "200" "$code"
    done
done
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 3: RBAC — WRITE ACCESS (restricted)
# ═══════════════════════════════════════════════════════════════
echo "━━━ 3. RBAC — WRITE ACCESS ━━━"

# Test: Viewer CANNOT create a bridge
VIEWER_CREATE=$(post_code "$BASE/Bridges" "$VIEWER" '{"bridgeId":"TEST-VIEWER-001","name":"Viewer Test Bridge","state":"NSW"}')
check "Viewer CANNOT create Bridge (expect 403)" "403" "$VIEWER_CREATE"

# Test: Admin CAN create a bridge
ADMIN_CREATE=$(post_code "$BASE/Bridges" "$ADMIN" '{"bridgeId":"TEST-ADMIN-001","name":"Admin Test Bridge","state":"NSW","assetClass":"BRIDGE","condition":"GOOD","conditionRating":7,"postingStatus":"UNRESTRICTED","operationalStatus":"OPEN"}')
check "Admin CAN create Bridge (expect 201)" "201" "$ADMIN_CREATE"

# Test: Manager CAN create a bridge
MANAGER_CREATE=$(post_code "$BASE/Bridges" "$MANAGER" '{"bridgeId":"TEST-MGR-001","name":"Manager Test Bridge","state":"VIC","assetClass":"BRIDGE","condition":"FAIR","conditionRating":5,"postingStatus":"UNRESTRICTED","operationalStatus":"OPEN"}')
check "Manager CAN create Bridge (expect 201)" "201" "$MANAGER_CREATE"

# Test: Executive CANNOT create a bridge
EXEC_CREATE=$(post_code "$BASE/Bridges" "$EXECUTIVE" '{"bridgeId":"TEST-EXEC-001","name":"Executive Test Bridge","state":"QLD"}')
check "Executive CANNOT create Bridge (expect 403)" "403" "$EXEC_CREATE"

# Test: Inspector CANNOT create a bridge
INSP_CREATE=$(post_code "$BASE/Bridges" "$INSPECTOR" '{"bridgeId":"TEST-INSP-001","name":"Inspector Test Bridge","state":"SA"}')
check "Inspector CANNOT create Bridge (expect 403)" "403" "$INSP_CREATE"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 4: CRUD — CREATE, READ, UPDATE, DELETE
# ═══════════════════════════════════════════════════════════════
echo "━━━ 4. CRUD OPERATIONS ━━━"

# READ the bridge we just created
BRIDGE_DATA=$(curl -s -u "$ADMIN" "$BASE/Bridges?\$filter=bridgeId%20eq%20'TEST-ADMIN-001'")
BRIDGE_UUID=$(echo "$BRIDGE_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['value'][0]['ID'])" 2>/dev/null || echo "NONE")
check_not "READ created bridge — got UUID" "NONE" "$BRIDGE_UUID"

# UPDATE the bridge
UPDATE_CODE=$(patch_code "$BASE/Bridges($BRIDGE_UUID)" "$ADMIN" '{"name":"Admin Test Bridge UPDATED","conditionRating":8,"condition":"VERY_GOOD"}')
check "UPDATE bridge name+condition" "200" "$UPDATE_CODE"

# Verify update
UPDATED_NAME=$(curl -s -u "$ADMIN" "$BASE/Bridges($BRIDGE_UUID)" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null)
check "Verify updated name" "Admin Test Bridge UPDATED" "$UPDATED_NAME"

# CREATE a restriction on the bridge
REST_CREATE=$(post_code "$BASE/Restrictions" "$ADMIN" "{\"bridge_ID\":\"$BRIDGE_UUID\",\"restrictionType\":\"MASS\",\"value\":42.5,\"unit\":\"t\",\"status\":\"ACTIVE\",\"direction\":\"BOTH\"}")
check "CREATE restriction on bridge" "201" "$REST_CREATE"

# CREATE an inspection order
INSP_ORDER=$(post_code "$BASE/InspectionOrders" "$ADMIN" "{\"bridge_ID\":\"$BRIDGE_UUID\",\"orderNumber\":\"INS-TEST-001\",\"inspectionType\":\"ROUTINE\",\"status\":\"PLANNED\",\"plannedDate\":\"2026-06-01\"}")
check "CREATE inspection order" "201" "$INSP_ORDER"

# CREATE a defect
DEFECT_CREATE=$(post_code "$BASE/BridgeDefects" "$ADMIN" "{\"bridge_ID\":\"$BRIDGE_UUID\",\"defectNumber\":\"D-TEST-001\",\"defectCategory\":\"CRACK\",\"severity\":\"HIGH\",\"status\":\"OPEN\",\"description\":\"Test crack defect\",\"detectedDate\":\"2026-04-01\",\"detectedBy\":\"Test Inspector\"}")
check "CREATE bridge defect" "201" "$DEFECT_CREATE"

# DELETE bridge (Admin only)
DEL_CODE=$(delete_code "$BASE/Bridges($BRIDGE_UUID)" "$ADMIN")
check "DELETE bridge (Admin)" "204" "$DEL_CODE"

# Cleanup manager test bridge
MGR_BRIDGE=$(curl -s -u "$ADMIN" "$BASE/Bridges?\$filter=bridgeId%20eq%20'TEST-MGR-001'" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['value'][0]['ID'])" 2>/dev/null || echo "NONE")
if [ "$MGR_BRIDGE" != "NONE" ]; then
    delete_code "$BASE/Bridges($MGR_BRIDGE)" "$ADMIN" > /dev/null
fi
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 5: BRIDGE ACTIONS (close, reopen, change condition)
# ═══════════════════════════════════════════════════════════════
echo "━━━ 5. BRIDGE ACTIONS ━━━"

# Get a real bridge to test actions
REAL_BRIDGE=$(curl -s -u "$ADMIN" "$BASE/Bridges?\$top=1&\$select=ID,bridgeId,condition,postingStatus" | python3 -c "import sys,json; d=json.load(sys.stdin); b=d['value'][0]; print(b['ID'])" 2>/dev/null)

# Change condition
CC_CODE=$(post_code "$BASE/Bridges($REAL_BRIDGE)/BridgeManagementService.changeCondition" "$ADMIN" '{"conditionValue":"GOOD","score":70}')
check "changeCondition action" "200" "$CC_CODE"

# Viewer cannot change condition
VC_CODE=$(post_code "$BASE/Bridges($REAL_BRIDGE)/BridgeManagementService.changeCondition" "$VIEWER" '{"conditionValue":"POOR","score":30}')
check "Viewer CANNOT changeCondition (expect 403)" "403" "$VC_CODE"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 6: REPORTS — ALL 15 ENDPOINTS
# ═══════════════════════════════════════════════════════════════
echo "━━━ 6. REPORTS — ALL 15 ENDPOINTS ━━━"

# Function-based reports
check "Asset Register" "200" "$(get_code "$BASE/getAssetRegister(assetClass=null,state=null,region=null,postingStatus=null,condition=null,conditionMin=null,conditionMax=null,yearBuiltFrom=null,yearBuiltTo=null,isActive=null,pageSize=5,pageOffset=0)" "$ADMIN")"
AR_COUNT=$(get_count "$BASE/getAssetRegister(assetClass=null,state=null,region=null,postingStatus=null,condition=null,conditionMin=null,conditionMax=null,yearBuiltFrom=null,yearBuiltTo=null,isActive=null,pageSize=200,pageOffset=0)" "$ADMIN")
echo "    → Asset Register returned $AR_COUNT rows"

check "Asset Summary" "200" "$(get_code "$BASE/getAssetSummary(assetClass=null,state=null,region=null)" "$ADMIN")"
check "Condition Distribution" "200" "$(get_code "$BASE/getConditionDistribution(assetClass=null,state=null,region=null)" "$ADMIN")"
check "Restriction Summary" "200" "$(get_code "$BASE/getRestrictionSummary(assetClass=null,state=null,region=null,restrictionType=null,status='ACTIVE')" "$ADMIN")"
check "Inspection Status Report" "200" "$(get_code "$BASE/getInspectionStatusReport(assetClass=null,state=null,region=null,overdueOnly=false)" "$ADMIN")"
check "Bridges Exceeding Capacity" "200" "$(get_code "$BASE/getBridgesExceedingCapacity()" "$ADMIN")"
check "Overdue Capacity Reviews" "200" "$(get_code "$BASE/getOverdueCapacityReviews(daysOverdue=0)" "$ADMIN")"

# Entity-based reports
check "RouteCompliance" "200" "$(get_code "$BASE/RouteCompliance" "$ADMIN")"
check "BridgeDefects" "200" "$(get_code "$BASE/BridgeDefects?\$top=5&\$orderby=severity,detectedDate%20desc" "$ADMIN")"
check "Restrictions" "200" "$(get_code "$BASE/Restrictions?\$top=5" "$ADMIN")"
check "VehicleAccess" "200" "$(get_code "$BASE/VehicleAccess?\$top=5" "$ADMIN")"
check "FreightRoutes" "200" "$(get_code "$BASE/FreightRoutes?\$top=5" "$ADMIN")"
check "BridgeHistory" "200" "$(get_code "$BASE/BridgeHistory?\$top=5&\$orderby=changedAt%20desc" "$ADMIN")"

# KPI functions
check "Network KPIs" "200" "$(get_code "$BASE/getNetworkKPIs()" "$ADMIN")"
check "Inspection Compliance KPIs" "200" "$(get_code "$BASE/getInspectionComplianceKPIs()" "$ADMIN")"
check "Defect KPIs" "200" "$(get_code "$BASE/getDefectKPIs()" "$ADMIN")"
check "Restriction KPIs" "200" "$(get_code "$BASE/getRestrictionKPIs()" "$ADMIN")"

# Reports accessible by Viewer
check "Viewer can access Asset Register" "200" "$(get_code "$BASE/getAssetRegister(assetClass=null,state=null,region=null,postingStatus=null,condition=null,conditionMin=null,conditionMax=null,yearBuiltFrom=null,yearBuiltTo=null,isActive=null,pageSize=5,pageOffset=0)" "$VIEWER")"
check "Viewer can access RouteCompliance" "200" "$(get_code "$BASE/RouteCompliance" "$VIEWER")"

# Reports with state filter
check "Asset Register filtered by NSW" "200" "$(get_code "$BASE/getAssetRegister(assetClass=null,state='NSW',region=null,postingStatus=null,condition=null,conditionMin=null,conditionMax=null,yearBuiltFrom=null,yearBuiltTo=null,isActive=null,pageSize=5,pageOffset=0)" "$ADMIN")"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 7: MASS UPLOAD (CSV)
# ═══════════════════════════════════════════════════════════════
echo "━━━ 7. MASS UPLOAD ━━━"

CSV_DATA="bridgeId,name,state,condition,conditionRating,postingStatus\nMASS-001,Mass Upload Bridge 1,NSW,GOOD,7,UNRESTRICTED\nMASS-002,Mass Upload Bridge 2,VIC,FAIR,5,POSTED\nMASS-003,Mass Upload Bridge 3,QLD,POOR,3,CLOSED"

UPLOAD_RESULT=$(post_json "$BASE/massUploadBridges" "$ADMIN" "{\"csvData\":\"$CSV_DATA\"}")
UPLOAD_SUCCESS=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('successCount',d.get('inserted',d.get('created',0))))" 2>/dev/null || echo "0")
check_not "Mass upload bridges — inserted rows" "0" "$UPLOAD_SUCCESS"
echo "    → Inserted: $UPLOAD_SUCCESS bridges"

# Verify uploaded bridges exist
M1_CODE=$(get_code "$BASE/Bridges?\$filter=bridgeId%20eq%20'MASS-001'" "$ADMIN")
check "Verify MASS-001 exists" "200" "$M1_CODE"
M1_COUNT=$(get_count "$BASE/Bridges?\$filter=bridgeId%20eq%20'MASS-001'" "$ADMIN")
check "MASS-001 found in DB" "1" "$M1_COUNT"

# Viewer CANNOT mass upload
VIEWER_UPLOAD=$(post_code "$BASE/massUploadBridges" "$VIEWER" "{\"csvData\":\"bridgeId,name,state\nTEST-V,Viewer Upload,NSW\"}")
check "Viewer CANNOT mass upload (expect 403)" "403" "$VIEWER_UPLOAD"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 8: MASS DOWNLOAD
# ═══════════════════════════════════════════════════════════════
echo "━━━ 8. MASS DOWNLOAD ━━━"

DL_RESULT=$(post_json "$BASE/massDownloadBridges" "$ADMIN" '{"region":null,"state":null,"routeCode":null}')
DL_ROWS=$(echo "$DL_RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
csv = d.get('csvData','')
if csv:
    lines = csv.strip().split('\n')
    print(len(lines)-1)
else:
    v = d.get('value','')
    if isinstance(v,str):
        lines = v.strip().split('\n')
        print(len(lines)-1)
    elif isinstance(v,list):
        print(len(v))
    else:
        print(0)
" 2>/dev/null || echo "0")
check_not "Mass download bridges — got rows" "0" "$DL_ROWS"
echo "    → Downloaded: $DL_ROWS bridges"

# Viewer download test
VIEWER_DL=$(post_code "$BASE/massDownloadBridges" "$VIEWER" '{"region":null,"state":null,"routeCode":null}')
echo "    → Viewer download status: $VIEWER_DL"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 9: ENTITY DATA COUNTS
# ═══════════════════════════════════════════════════════════════
echo "━━━ 9. DATA INVENTORY ━━━"

for entity in Bridges Restrictions Routes VehicleClasses InspectionOrders BridgeDefects FreightRoutes BridgeHistory Lookups AttributeDefinitions RoleConfigs AuditLogs; do
    COUNT=$(get_count "$BASE/$entity?\$top=9999" "$ADMIN")
    printf "    %-25s %s records\n" "$entity" "$COUNT"
done
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 10: SYSTEM & UTILITY ENDPOINTS
# ═══════════════════════════════════════════════════════════════
echo "━━━ 10. SYSTEM ENDPOINTS ━━━"

check "health()" "200" "$(get_code "$BASE/health()" "$ADMIN")"
check "getSystemInfo()" "200" "$(get_code "$BASE/getSystemInfo()" "$ADMIN")"
check "getAppConfig()" "200" "$(get_code "$BASE/getAppConfig()" "$ADMIN")"
check "me()" "200" "$(get_code "$BASE/me()" "$ADMIN")"

# Check me() returns correct user
ME_USER=$(curl -s -u "$ADMIN" "$BASE/me()" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
check "me() returns admin user" "admin" "$ME_USER"

ME_VIEWER=$(curl -s -u "$VIEWER" "$BASE/me()" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
check "me() returns viewer user" "viewer" "$ME_VIEWER"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION 11: CLEANUP TEST DATA
# ═══════════════════════════════════════════════════════════════
echo "━━━ 11. CLEANUP ━━━"

for bid in MASS-001 MASS-002 MASS-003 TEST-ADMIN-001 TEST-MGR-001; do
    UUID=$(curl -s -u "$ADMIN" "$BASE/Bridges?\$filter=bridgeId%20eq%20'$bid'" | python3 -c "import sys,json; v=json.load(sys.stdin)['value']; print(v[0]['ID'] if v else 'NONE')" 2>/dev/null || echo "NONE")
    if [ "$UUID" != "NONE" ]; then
        delete_code "$BASE/Bridges($UUID)" "$ADMIN" > /dev/null
        echo "  🗑️  Deleted $bid"
    fi
done
echo ""

# ═══════════════════════════════════════════════════════════════
# RESULTS SUMMARY
# ═══════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  TEST RESULTS SUMMARY                                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  Total:  %-3s tests                                      ║\n" "$TOTAL"
printf "║  Passed: %-3s ✅                                         ║\n" "$PASS"
printf "║  Failed: %-3s ❌                                         ║\n" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
    echo "║                                                          ║"
    echo "║  🎉 ALL TESTS PASSED                                    ║"
else
    echo "║                                                          ║"
    echo "║  ⚠️  FAILURES:                                          ║"
    echo -e "$FAILURES"
fi
echo "╚══════════════════════════════════════════════════════════╝"

exit $FAIL
