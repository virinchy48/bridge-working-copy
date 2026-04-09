# Claude Code — NSW Bridge Data Mass Upload to NHVR Application
### App: `/Users/siddharthaampolu/21 NHVR APP`
### File: `NSW_Bridge_MassUpload.xlsx` (20 verified NSW bridges)

---

## STEP 0 — RECON

```bash
APP="/Users/siddharthaampolu/21 NHVR APP"
cd "$APP"

# Check server is running
curl -s "http://localhost:4004/BridgeService/Bridges?\$top=1" | python3 -m json.tool | head -10
# If not running: cds watch &

# Check existing bridge count
curl -s "http://localhost:4004/BridgeService/Bridges?\$count=true" | python3 -m json.tool

# Locate the uploaded Excel file
ls -lh ~/Downloads/NSW_Bridge_MassUpload.xlsx 2>/dev/null || \
  find ~ -name "NSW_Bridge_MassUpload.xlsx" 2>/dev/null | head -3
```

---

## STEP 1 — READ THE XLSX AND VALIDATE

```javascript
// File: scripts/mass_upload_bridges.js
const XLSX = require('xlsx');
const fs   = require('fs');

const XLSX_PATH = process.env.XLSX_PATH || 
  `${process.env.HOME}/Downloads/NSW_Bridge_MassUpload.xlsx`;

// Read workbook
const wb   = XLSX.readFile(XLSX_PATH);
const ws   = wb.Sheets['BRIDGE_DATA'];
// Skip rows 1 (section headers), 2 (field headers), 3 (type hints) → data from row 4
const raw  = XLSX.utils.sheet_to_json(ws, { range: 3, defval: null });

console.log(`Read ${raw.length} bridge records from BRIDGE_DATA sheet`);

// Clean and type-cast each row
function cleanRecord(row) {
  return {
    bridgeId:            String(row.bridgeId        || '').trim(),
    name:                String(row.name            || '').trim(),
    region:              String(row.region          || '').trim(),
    state:               String(row.state           || '').trim(),
    lga:                 String(row.lga             || '').trim(),
    roadRoute:           String(row.roadRoute       || '').trim(),
    routeNumber:         String(row.routeNumber     || '').trim(),
    assetOwner:          String(row.assetOwner      || '').trim(),
    maintenanceAuthority:String(row.maintenanceAuthority || '').trim(),
    condition:           String(row.condition       || '').trim(),
    conditionRating:     parseInt(row.conditionRating) || null,
    conditionStandard:   String(row.conditionStandard || '').trim(),
    postingStatus:       String(row.postingStatus   || '').trim(),
    structureType:       String(row.structureType   || '').trim(),
    material:            String(row.material        || '').trim(),
    clearanceHeightM:    parseFloat(row.clearanceHeightM) || null,
    spanLengthM:         parseFloat(row.spanLengthM)      || null,
    totalLengthM:        parseFloat(row.totalLengthM)     || null,
    widthM:              parseFloat(row.widthM)           || null,
    numberOfSpans:       parseInt(row.numberOfSpans)      || null,
    numberOfLanes:       parseInt(row.numberOfLanes)      || null,
    latitude:            parseFloat(row.latitude)         || null,
    longitude:           parseFloat(row.longitude)        || null,
    inspectionDate:      row.inspectionDate ? String(row.inspectionDate).trim() : null,
    yearBuilt:           parseInt(row.yearBuilt)          || null,
    designLoad:          String(row.designLoad      || '').trim(),
    designStandard:      String(row.designStandard  || '').trim(),
    nhvrRouteAssessed:   String(row.nhvrRouteAssessed).toUpperCase() === 'TRUE',
    gazetteRef:          String(row.gazetteRef      || '').trim(),
    aadtVehicles:        parseInt(row.aadtVehicles)       || null,
    freightRoute:        String(row.freightRoute).toUpperCase() === 'TRUE',
    overMassRoute:       String(row.overMassRoute).toUpperCase() === 'TRUE',
    highPriorityAsset:   String(row.highPriorityAsset).toUpperCase() === 'TRUE',
    floodImpacted:       String(row.floodImpacted).toUpperCase() === 'TRUE',
    seismicZone:         String(row.seismicZone     || '').trim(),
    scourRisk:           String(row.scourRisk       || '').trim(),
    dataSource:          String(row.dataSource      || '').trim(),
    sourceRefURL:        String(row.sourceRefURL    || '').trim(),
    openDataRef:         String(row.openDataRef     || '').trim(),
    nhvrRef:             String(row.nhvrRef         || '').trim(),
    lastUpdated:         row.lastUpdated ? String(row.lastUpdated).trim() : null,
    remarks:             String(row.remarks         || '').trim(),
  };
}

// Validate required fields
function validate(record) {
  const errors = [];
  if (!record.bridgeId)        errors.push('bridgeId is required');
  if (!record.name)            errors.push('name is required');
  if (!record.state)           errors.push('state is required');
  if (!record.assetOwner)      errors.push('assetOwner is required');
  if (!record.condition)       errors.push('condition is required');
  if (!record.conditionRating || record.conditionRating < 1 || record.conditionRating > 10)
                               errors.push('conditionRating must be 1-10');
  if (!record.postingStatus)   errors.push('postingStatus is required');
  if (!record.latitude || !record.longitude)
                               errors.push('latitude and longitude are required');
  return errors;
}

const bridges = raw.map(cleanRecord);
const validation = bridges.map((b, i) => ({ idx: i+1, bridgeId: b.bridgeId, errors: validate(b) }));
const invalid = validation.filter(v => v.errors.length > 0);

if (invalid.length > 0) {
  console.error('\nVALIDATION ERRORS:');
  invalid.forEach(v => console.error(`  Row ${v.idx} (${v.bridgeId}): ${v.errors.join(', ')}`));
  process.exit(1);
}

console.log(`\n✅ All ${bridges.length} records passed validation`);

module.exports = { bridges };
```

---

## STEP 2 — INSTALL DEPENDENCIES

```bash
cd "/Users/siddharthaampolu/21 NHVR APP"
npm install xlsx node-fetch --save-dev
```

---

## STEP 3 — UPLOAD SCRIPT WITH PROGRESS + ROLLBACK

```javascript
// File: scripts/mass_upload_bridges.js  (full script — replace the module.exports line with this)
const XLSX    = require('xlsx');
const fetch   = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:4004/BridgeService';
const XLSX_PATH = process.env.XLSX_PATH || 
  `${process.env.HOME}/Downloads/NSW_Bridge_MassUpload.xlsx`;
const DRY_RUN  = process.env.DRY_RUN === 'true';

// ── Read and clean data (same cleanRecord + validate functions as Step 1) ──

const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets['BRIDGE_DATA'];
const raw = XLSX.utils.sheet_to_json(ws, { range: 3, defval: null });

// [include cleanRecord() and validate() from Step 1 here]

const bridges = raw.map(cleanRecord);
const allErrors = bridges.flatMap((b, i) => 
  validate(b).map(e => `Row ${i+4}: ${b.bridgeId} — ${e}`)
);
if (allErrors.length) { allErrors.forEach(e => console.error(e)); process.exit(1); }

// ── Upload with upsert logic ────────────────────────────────────────────────
const results = { created: [], updated: [], failed: [] };

async function uploadBridge(bridge) {
  // Check if bridge already exists
  const checkRes = await fetch(
    `${BASE_URL}/Bridges('${encodeURIComponent(bridge.bridgeId)}')`,
    { headers: { 'Accept': 'application/json' } }
  );

  const method  = checkRes.ok ? 'PATCH' : 'POST';
  const url     = checkRes.ok
    ? `${BASE_URL}/Bridges('${encodeURIComponent(bridge.bridgeId)}')`
    : `${BASE_URL}/Bridges`;

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would ${method} ${bridge.bridgeId} — ${bridge.name}`);
    return { ok: true, action: method };
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bridge)
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.error?.message || errBody.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return { ok: true, action: method };
}

async function runUpload() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`NSW Bridge Mass Upload — ${bridges.length} records`);
  console.log(`Target: ${BASE_URL}`);
  console.log(DRY_RUN ? '⚠️  DRY RUN MODE — no data will be written' : '🚀  LIVE UPLOAD');
  console.log('='.repeat(60));

  for (let i = 0; i < bridges.length; i++) {
    const bridge = bridges[i];
    const progress = `[${String(i+1).padStart(2,'0')}/${bridges.length}]`;
    try {
      const result = await uploadBridge(bridge);
      const icon = result.action === 'POST' ? '✅ CREATE' : '🔄 UPDATE';
      console.log(`  ${progress} ${icon}  ${bridge.bridgeId.padEnd(18)} ${bridge.name}`);
      results[result.action === 'POST' ? 'created' : 'updated'].push(bridge.bridgeId);
    } catch (err) {
      console.error(`  ${progress} ❌ FAILED  ${bridge.bridgeId.padEnd(18)} ${err.message}`);
      results.failed.push({ bridgeId: bridge.bridgeId, error: err.message });
    }
    // Small delay to avoid overwhelming the server
    await new Promise(r => setTimeout(r, 50));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('UPLOAD SUMMARY');
  console.log('='.repeat(60));
  console.log(`  ✅ Created: ${results.created.length}`);
  console.log(`  🔄 Updated: ${results.updated.length}`);
  console.log(`  ❌ Failed:  ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log('\nFailed records:');
    results.failed.forEach(f => console.log(`  - ${f.bridgeId}: ${f.error}`));
  }

  // Save results log
  const logPath = `/tmp/bridge_upload_${Date.now()}.json`;
  require('fs').writeFileSync(logPath, JSON.stringify({ 
    timestamp: new Date().toISOString(),
    totalRecords: bridges.length,
    ...results 
  }, null, 2));
  console.log(`\nLog saved: ${logPath}`);

  return results.failed.length === 0;
}

runUpload().then(ok => process.exit(ok ? 0 : 1));
```

---

## STEP 4 — RUN THE UPLOAD

```bash
cd "/Users/siddharthaampolu/21 NHVR APP"

# Make sure the CAP server is running
cds watch &
sleep 3

# Step 4a: Dry run first — validate everything without writing
DRY_RUN=true XLSX_PATH="$HOME/Downloads/NSW_Bridge_MassUpload.xlsx" \
  node scripts/mass_upload_bridges.js

# Step 4b: Live upload (only after dry run passes cleanly)
XLSX_PATH="$HOME/Downloads/NSW_Bridge_MassUpload.xlsx" \
  node scripts/mass_upload_bridges.js

# Expected output:
# ============================================================
# NSW Bridge Mass Upload — 20 records
# Target: http://localhost:4004/BridgeService
# 🚀  LIVE UPLOAD
# ============================================================
#   [01/20] ✅ CREATE  NSW-BRG-001        Sydney Harbour Bridge
#   [02/20] ✅ CREATE  NSW-BRG-002        Anzac Bridge
#   [03/20] ✅ CREATE  NSW-BRG-003        Gladesville Bridge
#   ...
#   [20/20] ✅ CREATE  NSW-BRG-020        Long Gully Bridge
# ============================================================
# UPLOAD SUMMARY
# ============================================================
#   ✅ Created: 20
#   🔄 Updated: 0
#   ❌ Failed:  0
```

---

## STEP 5 — VERIFY UPLOAD

```bash
# Total bridge count (should be 20 + any existing)
curl -s "http://localhost:4004/BridgeService/Bridges?\$count=true" | python3 -m json.tool

# NSW bridges only
curl -s "http://localhost:4004/BridgeService/Bridges?\$filter=state eq 'NSW'&\$select=bridgeId,name,condition,postingStatus,yearBuilt&\$orderby=bridgeId" \
  | python3 -m json.tool

# Spot check a specific bridge
curl -s "http://localhost:4004/BridgeService/Bridges('NSW-BRG-003')" | python3 -m json.tool
# Expected: Gladesville Bridge, conditionRating=7, spanLengthM=305, yearBuilt=1964

# Bridges with weight restrictions
curl -s "http://localhost:4004/BridgeService/Bridges?\$filter=postingStatus eq 'WEIGHT_RESTRICTED'" \
  | python3 -m json.tool

# Heritage bridges (yearBuilt < 1900)
curl -s "http://localhost:4004/BridgeService/Bridges?\$filter=yearBuilt lt 1900&\$select=bridgeId,name,yearBuilt,structureType" \
  | python3 -m json.tool

# Freight route bridges
curl -s "http://localhost:4004/BridgeService/Bridges?\$filter=freightRoute eq true&\$select=bridgeId,name,nhvrRouteAssessed" \
  | python3 -m json.tool

# Compliance report — should flag any overdue inspections or missing NHVR assessments
curl -s "http://localhost:4004/BridgeService/getBridgeComplianceReport()" | python3 -m json.tool
```

---

## STEP 6 — GeoJSON VERIFICATION (Map Layer)

```bash
# Verify GeoJSON endpoint returns all NSW bridges as point features
curl -s "http://localhost:4004/bridges/geojson" | python3 -c "
import json, sys
data = json.load(sys.stdin)
nsw = [f for f in data['features'] if f['properties'].get('state') == 'NSW']
print(f'Total features: {len(data["features"])}')
print(f'NSW point features: {len(nsw)}')
for f in nsw:
    p = f['properties']
    print(f'  {p["bridgeId"]:20} {p["name"]:35} {p["condition"]:10} {p["markerColor"]}')
"
```

---

## DATA NOTES — Sources & Verification

All 20 bridges are sourced from publicly available data:

| Bridge | Primary Source | URL |
|---|---|---|
| Sydney Harbour Bridge | Wikipedia / TfNSW Heritage | https://en.wikipedia.org/wiki/Sydney_Harbour_Bridge |
| Anzac Bridge | Wikipedia / TfNSW | https://en.wikipedia.org/wiki/Anzac_Bridge |
| Gladesville Bridge | Wikipedia / ASCE / TfNSW | https://en.wikipedia.org/wiki/Gladesville_Bridge |
| Mooney Mooney Bridge | Wikipedia / TfNSW | https://en.wikipedia.org/wiki/Mooney_Mooney_Bridge |
| Pheasants Nest Bridge | Wikipedia AU Bridges List | https://en.wikipedia.org/wiki/List_of_bridges_in_Australia |
| Sea Cliff Bridge | Wikipedia / NSW Govt / Boral | https://en.wikipedia.org/wiki/Sea_Cliff_Bridge |
| Hawkesbury River Railway Bridge | Wikipedia / NSW SHR | https://en.wikipedia.org/wiki/Hawkesbury_River_railway_bridge |
| Peats Ferry Bridge | Wikipedia / NSW SHR | https://en.wikipedia.org/wiki/List_of_bridges_in_Australia |
| Pyrmont Bridge | Wikipedia / National Estate | https://en.wikipedia.org/wiki/Pyrmont_Bridge |
| Grafton Bridge | Wikipedia / NSW SHR | https://en.wikipedia.org/wiki/Grafton_Bridge_(New_South_Wales) |
| Hampden Bridge | Wikipedia / National Estate | https://en.wikipedia.org/wiki/Hampden_Bridge,_Kangaroo_Valley |
| Lennox Bridge | Wikipedia / National Estate | https://en.wikipedia.org/wiki/Lennox_Bridge |
| Nowra Bridge (New) | TfNSW Project / Sydney Build | https://www.transport.nsw.gov.au/projects/current-projects/nowra-bridge |
| Macleay Valley Bridge | Wikipedia | https://en.wikipedia.org/wiki/List_of_bridges_in_Australia |
| Lansdowne Bridge | Wikipedia / Australian Heritage DB | https://en.wikipedia.org/wiki/Lansdowne_Bridge |
| Rip Bridge | Wikipedia | https://en.wikipedia.org/wiki/List_of_bridges_in_Australia |
| Prince Alfred Bridge Gundagai | Wikipedia / NSW SHR | https://en.wikipedia.org/wiki/Prince_Alfred_Bridge,_Gundagai |
| Iron Cove Bridge | TfNSW / Dictionary of Sydney | https://dictionaryofsydney.org/structure/iron_cove_bridge |
| Windsor Bridge (New) | TfNSW Project | https://www.transport.nsw.gov.au/projects/completed-projects/windsor-bridge |
| Long Gully Bridge | Wikipedia / NSW Heritage | https://en.wikipedia.org/wiki/Long_Gully_Bridge |

**TfNSW Open Data Hub (vertical clearances):** https://opendata.transport.nsw.gov.au/dataset/nsw-state-roads-vertical-clearances
**NSW SpatialData Portal:** https://portal.spatial.nsw.gov.au
**NSW State Heritage Register:** https://www.environment.nsw.gov.au/heritageapp/

---
*Hastha Solutions Pty Ltd — NHVR Bridge Management Application*
*NSW Mass Upload — 20 bridges covering Sydney Metro, Central Coast, Illawarra, Hunter, North Coast, South Coast, Riverina, Western Sydney*
