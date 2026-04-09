# NHVR Bridge App — Change Report v1.1
**Date**: 2026-03-26
**Author**: NHVR Development Team
**Base version**: 1.2.1
**Sprint scope**: Schema enhancements, BHI inspection engine, freight corridor risk roll-up, healthCheck action, InspectionCreate UI, seed data

---

## STEP 1 — Schema Enhancements (`db/schema.cds`)

### 1.1 — Bridge entity extensions

Two `extend Bridge with` blocks added at the end of `db/schema.cds`:

**Load Rating Evidence Fields (denormalised summary on Bridge):**
- `ratingStandard`, `ratingVehicle`, `ratingFactor`, `ratingAssessedBy`, `ratingEngineerReg`
- `ratingAssessmentDate`, `ratingExpiry`, `ratingReportRef`, `ratingMethod_v11`

**TS01501 Asset Fields:**
- `assetStatusCode` (default `'ISOP'`), `assetStatusDate`, `serviceLifeEndDate`
- `remainingServiceLife`, `designLifeYears`, `assetCriticalityCode`
- `coordinateDatumCode` (default `'GDA2020'`), `transportModeCode` (default `'RD'`), `transportNetworkCode`
- `heritageInventoryNo`, `ddaCompliant`, `handoverDate`
- `postedLoadRigid`, `postedLoadSemi`, `grossWeightLimit`
- `verticalClearance`, `signpostedVCL`
- `screenElecRequired`, `antiThrowRequired`, `refugeCount`, `walkwayFitted`
- `nhvrRestrictionCode`, `nhvrAssessmentDate`, `nhvrPermitClass` (already existed — skipped)
- `bhiCalculationDate`, `bhiCalculationVersion`, `bhiApprovedBy`
- `culvertCellType`, `culvertPurpose`, `culvertDesignCapacity`

Note: `monitoringRequirement` already existed in an earlier extend — not duplicated.

### 1.2 — New Entities Added

| Entity | Key | Purpose |
|--------|-----|---------|
| `LoadRatingCertificate` | `cuid` | Formal load rating certificate per assessment event |
| `BridgeInspection` | `cuid` | BHI-enabled element-level inspection form |
| `BridgeRouteAssignment` | `cuid` | Bridge-to-FreightRoute assignments (top-level, avoids Composition constraint) |

**Rationale for separate entities**: The existing `LoadRating` entity serves engineering capacity records; `LoadRatingCertificate` stores the formal certificate lifecycle. `BridgeInspection` adds BHI computation not present in `InspectionRecord` or `InspectionOrder`. `BridgeRouteAssignment` uses `Association` (not `Composition`) so it is directly accessible as an OData entity set.

---

## STEP 2 — Service Layer

### 2.1 — New Projections in `srv/service.cds`

Appended inside `BridgeManagementService` block (after existing integration entities):

```
entity LoadRatingCertificates  — projection on nhvr.LoadRatingCertificate
entity BridgeInspections       — projection on nhvr.BridgeInspection
entity BridgeRouteAssignments  — projection on nhvr.BridgeRouteAssignment
action  healthCheck()          — returns { status, timestamp, version, database, uptime }
```

All projections use `@restrict` annotations matching the existing pattern (Viewer/Inspector/Operator/BridgeManager/Admin for read; BridgeManager/Admin/Inspector for write).

### 2.2 — Handlers in `srv/service.js`

Three new handler blocks appended before the closing `});`:

**`computeBHI()` helper**
- Formula: `(s×0.30 + b×0.28 + d×0.20 + br×0.12 + j×0.10) × 20`
- Returns rounded Decimal(5,1)

**`srv.before('CREATE', 'BridgeInspections')`**
- Auto-computes `bridgeHealthIndex` when element ratings are provided
- Auto-sets `followUpRequired=true`, `followUpPriority='P1'` when `defectSeverity` is `'CRITICAL'` or `'SEVERE'`

**`srv.after('CREATE', 'BridgeInspections')`**
- Updates parent `nhvr.Bridge` record: sets `bridgeHealthIndex`, `bhiCalculationDate`, `bhiCalculationVersion='v2.1'`
- Non-fatal: catches DB errors and logs; does not fail the original POST

**`srv.on('healthCheck')`**
- Tests DB with `SELECT 1 FROM DUMMY` (HANA) → fallback `SELECT 1` (SQLite)
- Returns: `{ status, timestamp, version (from package.json), database, uptime }`

**`srv.after('READ', 'FreightRoutes')`**
- For each returned route, looks up `BridgeRouteAssignment` records
- Computes `criticalBHI` (min of linked bridge BHI values), `totalBridgeCount`, `riskLevel`
- Risk thresholds: `>=70` LOW, `>=55` MEDIUM, `>=40` HIGH, `<40` CRITICAL
- Non-fatal: catches errors per route and logs

---

## STEP 3 — UI5 Frontend

### 3.1 — New Files Created

| File | Status |
|------|--------|
| `app/bridge-management/webapp/view/InspectionCreate.view.xml` | NEW |
| `app/bridge-management/webapp/controller/InspectionCreate.controller.js` | NEW |
| `app-router/resources/nhvr.bridgemanagement/view/InspectionCreate.view.xml` | NEW (mirror) |
| `app-router/resources/nhvr.bridgemanagement/controller/InspectionCreate.controller.js` | NEW (mirror) |

**InspectionCreate.view.xml** — 3-section SimpleForm:
- Section A: Structure identification (inspection type, standard, date, inspector, access method)
- Section B: Element condition ratings (SegmentedButton 1-5 for deck, superstructure, substructure, bearings, joints)
- Section C: Defects (defect code, severity, notes, cost, next due)
- Footer: Cancel / Save Draft / Submit Inspection buttons

**InspectionCreate.controller.js**:
- JSONModel `InspectionForm` with defaults (type `L1_ROUTINE`, date/rating fields)
- Route matching for both `InspectionCreate` (with `bridgeId`) and `InspectionCreateNew` (without)
- `onSubmitInspection`: POSTs to `/bridge-management/BridgeInspections`, shows returned BHI in toast
- `onSaveDraft`: local draft notice (localStorage-backed persistence is a future enhancement)

### 3.2 — MapView and FreightRoutes

Both `MapView.view.xml`, `MapView.controller.js`, `FreightRoutes.view.xml`, and `FreightRoutes.controller.js` **already existed** in the webapp. No duplicate creation needed.

Routes `MapView` and `FreightRoutes` **already existed** in `manifest.json`. No duplicate routes added.

### 3.3 — manifest.json Updates

Two new routes added:
```json
{ "pattern": "inspection/create/{bridgeId}", "name": "InspectionCreate", "target": "InspectionCreate" }
{ "pattern": "inspection/create",            "name": "InspectionCreateNew", "target": "InspectionCreate" }
```

One new target added:
```json
"InspectionCreate": { "type": "XML", "viewLevel": 2, "viewId": "InspectionCreate",
                      "viewName": "nhvr.bridgemanagement.view.InspectionCreate" }
```

### 3.4 — Home.view.xml Updates

New `NETWORK TOOLS` section added before closing `</VBox>`:
- **Bridge Map** tile → `onNavToMap` (already existed, reused)
- **Record Inspection** tile → `onNavToInspectionCreate` (new)
- **Freight Corridors** tile → `onNavToFreightRoutes` (new)

### 3.5 — Home.controller.js Updates

Two new navigation handlers added alongside existing handlers:
```javascript
onNavToInspectionCreate: function () { this._navTo("InspectionCreateNew"); },
onNavToFreightRoutes:    function () { this._navTo("FreightRoutes"); },
```

---

## STEP 4 — Seed Data CSV Files

| File | Records | Notes |
|------|---------|-------|
| `db/data/nhvr-LoadRatingCertificate.csv` | 3 | SM1600/300LA/T44 assessments on bridge IDs `...001` and `...002` |
| `db/data/nhvr-BridgeInspection.csv` | 3 | L2 Principal, L1 Routine, L4 Emergency (critical) on same bridges |
| `db/data/nhvr-BridgeRouteAssignment.csv` | 2 | Marulan Creek (seq 1, non-limiter) + Goulburn River (seq 2, limiter) on NSW-HML-001 |

All IDs use RFC 4122 v4 format. Bridge IDs and FreightRoute IDs reference actual records from existing CSV files.

---

## STEP 5 — Test Results

All tests executed against live server at `http://localhost:4004`.

### Test 5.3 — Metadata Entity Check

```
PASS — 4 new entity type names confirmed in $metadata:
  Name="BridgeInspections"
  Name="BridgeRouteAssignments"
  Name="LoadRatingCertificates"
  Name="FreightRoutes" (existing, confirmed present)

Additional:
  Name="return_BridgeManagementService_healthCheck"  ← action registered
```

### Test 5.4 — GET Endpoints

**BridgeInspections GET (top 3):** PASS
- Returns 3 seeded records with all fields correctly populated
- BHI values: 76.0 (L2 Principal), 60.0 (L1 Routine), 30.0 (L4 Emergency)
- `followUpRequired: true`, `followUpPriority: "P1"` on the emergency record

**LoadRatingCertificates GET (top 3):** PASS
- Returns 3 seeded records (SM1600, 300LA, T44)
- `isCurrentCert: true/false` correctly stored

**FreightRoutes GET (top 3):** PASS
- Returns existing FreightRoute records
- Risk roll-up handler runs (no BridgeRouteAssignments linked to these routes yet → no criticalBHI computed)

**BridgeRouteAssignments GET (top 5):** PASS
- Returns 2 seeded records
- `isLimiter: false/true` correctly stored
- `route_ID` and `bridge_ID` foreign keys valid

### Test 5.5 — healthCheck Action

```bash
POST /bridge-management/healthCheck
{}
```

**Result:** PASS
```json
{
  "status": "UP",
  "timestamp": "2026-03-26T11:42:43.148Z",
  "version": "1.2.1",
  "database": "HEALTHY",
  "uptime": 33
}
```

### Test 5.6 — BHI Computation (ratings 3/3/4/2/3)

```bash
POST /bridge-management/BridgeInspections
{ deckRating:3, superstructureRating:3, substructureRating:4, bearingRating:2, jointRating:3,
  defectSeverity:"MODERATE" }
```

**Expected BHI** = (3×0.30 + 4×0.28 + 3×0.20 + 2×0.12 + 3×0.10) × 20
= (0.90 + 1.12 + 0.60 + 0.24 + 0.30) × 20 = 3.16 × 20 = **63.2**

**Actual result:** `"bridgeHealthIndex": 63.2` — PASS

Bridge parent record updated: `bridgeHealthIndex: 63.2`, `bhiCalculationVersion: "v2.1"` — PASS

### Test 5.7 — CRITICAL Defect Escalation (ratings 1/1/2/1/2)

```bash
POST /bridge-management/BridgeInspections
{ deckRating:1, superstructureRating:1, substructureRating:2, bearingRating:1, jointRating:2,
  defectSeverity:"CRITICAL" }
```

**Expected BHI** = (1×0.30 + 2×0.28 + 1×0.20 + 1×0.12 + 2×0.10) × 20
= (0.30 + 0.56 + 0.20 + 0.12 + 0.20) × 20 = 1.38 × 20 = **27.6**

**Actual result:** `"bridgeHealthIndex": 27.6` — PASS
**Escalation:** `"followUpRequired": true`, `"followUpPriority": "P1"` — PASS

Bridge parent BHI updated to 27.6 — PASS

---

## Files Changed Summary

```
db/schema.cds                                               — Bridge extensions (rating + TS01501 fields)
                                                              + LoadRatingCertificate, BridgeInspection,
                                                                BridgeRouteAssignment entities
srv/service.cds                                             — LoadRatingCertificates, BridgeInspections,
                                                              BridgeRouteAssignments projections + healthCheck
srv/service.js                                              — computeBHI helper, BEFORE/AFTER CREATE handlers,
                                                              healthCheck handler, FreightRoutes AFTER READ

app/bridge-management/webapp/view/InspectionCreate.view.xml — NEW: AS 5100.7 inspection form (3 sections)
app/bridge-management/webapp/controller/InspectionCreate.controller.js — NEW: form controller + BHI display
app/bridge-management/webapp/view/Home.view.xml             — Added NETWORK TOOLS tile section
app/bridge-management/webapp/controller/Home.controller.js  — Added onNavToInspectionCreate, onNavToFreightRoutes
app/bridge-management/webapp/manifest.json                  — Added InspectionCreate + InspectionCreateNew routes/target

app-router/resources/nhvr.bridgemanagement/...              — Mirrored all webapp changes above

db/data/nhvr-LoadRatingCertificate.csv                      — NEW: 3 seed records
db/data/nhvr-BridgeInspection.csv                           — NEW: 3 seed records
db/data/nhvr-BridgeRouteAssignment.csv                      — NEW: 2 seed records
```

---

## Deployment Prerequisites (Step 6 — Skipped by design)

Before BTP deployment:
1. `npx cds build --production` — regenerate `gen/srv/` and `gen/db/`
2. Bump `version` in `mta.yaml` (e.g. `1.2.2`)
3. `mbt build -t ./` — builds new `.mtar` archive
4. `cf deploy nhvr-bridge-app_1.2.2.mtar --version-rule ALL -f`
5. Verify `cf apps` shows all 3 apps STARTED

No xs-security.json changes were made — no XSUAA redeploy required.

---

## Notes and Observations

- The existing `FreightRoutes` entity (service.cds) projects from `nhvr.FreightRoute` which has a narrow field set (`routeCode`, `name`, `state`, `routeClass`, `corridorMaxMass`, `corridorMaxHeight`, `status`). The `criticalBHI`, `totalBridgeCount`, and `riskLevel` fields computed by the AFTER READ handler are returned as transient properties. These are not stored on the entity — they are computed dynamically from `BridgeRouteAssignment` records on every READ.

- The `ratingMethod_v11` field (renaming from the spec's `ratingMethod`) avoids collision with the `ratingMethod` field on the existing `InspectionOrder` extend. Using the `_v11` suffix makes the field unique within the flattened Bridge namespace.

- Server uses SQLite in-memory in development; all tests ran against a fresh deploy with seeded CSV data.
