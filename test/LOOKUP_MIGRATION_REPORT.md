# Full Lookup-Driven Dropdown Migration — Report

**Goal:** Make every business-enum dropdown in the BIS app source its values
from the `Lookup` table (admin-configurable via Mass Upload), and ship a
real Excel starter template containing every current value so admins have
a working starting point.

---

## 1. Inventory — what was hardcoded vs what was already lookup-driven

A scan across all 22 view XMLs found **68 `<Select>` controls with hardcoded
`<core:Item>` children**. Most were UI-only (period selectors, base map,
audit filters, role pickers) but 17 were business enums whose values get
persisted to the database. Of those:

| Status | Count | Examples |
|---|---|---|
| Already lookup-driven (controllers wired before this change) | 11 | `Bridges.filterCondition/filterPosting/filterScour/filterRiskBand`, `Defects.statusFilter/severityFilter/categoryFilter/priorityFilter`, `Restrictions.filterStatus/filterType`, `WorkOrders.woStatusFilter/woPriorityFilter`, `Permits.permitStatusFilter/permitTypeFilter`, `InspectionDashboard.statusFilter/typeFilter` |
| **Still hardcoded — migrated this session** | **15** | Listed below |

The hardcoded items in the views for the already-lookup-driven filters
were dead code (overridden at runtime by `LookupService.populateSelect`),
just visual noise — left untouched.

---

## 2. Migrated this session (15 fields, 5 views, 4 controllers)

### Views patched

| File | Field | Before | After (Lookup category) |
|---|---|---|---|
| `view/BridgeForm.view.xml` | `fStructureType` | 9 hardcoded items | `STRUCTURE_TYPE` |
| `view/BridgeForm.view.xml` | `fDesignLoad` | 7 hardcoded items | `DESIGN_LOAD` |
| `view/BridgeForm.view.xml` | `fPostingStatus` | 6 hardcoded items (3 of them rejected by server!) | `POSTING_STATUS` |
| `view/BridgeForm.view.xml` | `fScourRisk` | 5 hardcoded items | `SCOUR_RISK` |
| `view/BridgeForm.view.xml` | `fNhvrApprovalClass` | 9 hardcoded items | `NHVR_APPROVAL_CLASS` *(NEW)* |
| `view/BridgeForm.view.xml` | `fExtSystem` | 8 hardcoded items | `EXTERNAL_SYSTEM_TYPE` *(extended)* |
| `view/InspectionCreate.view.xml` | `selInspType` | 6 hardcoded items | `INSPECTION_TYPE` *(extended)* |
| `view/InspectionCreate.view.xml` | `selStandard` | 5 hardcoded items | `INSPECTION_STANDARD` *(NEW)* |
| `view/InspectionCreate.view.xml` | `selAccess` | 5 hardcoded items | `ACCESS_METHOD` *(extended)* |
| `view/InspectionCreate.view.xml` | `selDefect` | 13 hardcoded items | `DEFECT_CLASSIFICATION` *(NEW)* |
| `view/InspectionCreate.view.xml` | `selSeverity` | 5 hardcoded items | `DEFECT_SEVERITY` *(extended)* |
| `view/FreightRoutes.view.xml` | `routeClassFilter` | 6 hardcoded items | `ROUTE_CLASS` *(NEW)* |
| `view/FreightRoutes.view.xml` | `fRouteClass` | 5 hardcoded items | `ROUTE_CLASS` |
| `view/FreightRoutes.view.xml` | `fRouteStatus` | 3 hardcoded items | `ROUTE_STATUS` *(NEW)* |
| `view/Permits.view.xml` | `permitDecision` | 4 hardcoded items | `PERMIT_DECISION` *(NEW)* |

### Controllers wired

| File | Change |
|---|---|
| `controller/BridgeForm.controller.js` | Added 4 new `populateFormSelect` calls (`fPostingStatus`, `fScourRisk`, `fStructureType`, `fDesignLoad`, `fNhvrApprovalClass`, `fExtSystem`) inside the existing `LookupService.load().then(...)` block. Detailed comment block explains the architectural decision. |
| `controller/InspectionCreate.controller.js` | Imported `LookupService` (was missing), added 5 `populateFormSelect` calls inside `onInit`. |
| `controller/FreightRoutes.controller.js` | Added 3 new `populateFormSelect`/`populateSelect` calls (`routeClassFilter`, `fRouteClass`, `fRouteStatus`). |
| `controller/Permits.controller.js` | Added 1 new `populateFormSelect` call for `permitDecision`. |

---

## 3. Lookup table — categories before/after

| | Before | After |
|---|---|---|
| Categories | 33 | **41** |
| Total rows | ~190 | **270** |

**8 new categories seeded** via mass upload:

| Category | Rows | Used by |
|---|---|---|
| `NHVR_APPROVAL_CLASS` | 8 | BridgeForm.fNhvrApprovalClass |
| `INSPECTION_STANDARD` | 5 | InspectionCreate.selStandard |
| `DEFECT_CLASSIFICATION` | 14 | InspectionCreate.selDefect |
| `ROUTE_CLASS` | 5 | FreightRoutes.fRouteClass + filter |
| `ROUTE_STATUS` | 4 | FreightRoutes.fRouteStatus |
| `PERMIT_DECISION` | 4 | Permits.permitDecision |
| `MEASUREMENT_UNIT` | 6 | (BridgeDetail / Restrictions — Phase 3) |
| `RESTRICTION_DIRECTION` | 7 | (BridgeDetail / Restrictions — Phase 3) |
| `VEHICLE_CLASS` | 9 | (BridgeDetail.rcCondition — Phase 3) |
| `DESIGN_LOAD` | 9 | BridgeForm.fDesignLoad (seeded earlier) |

**4 existing categories extended:**

| Category | Added rows | Notes |
|---|---|---|
| `EXTERNAL_SYSTEM_TYPE` | 6 (RMS, VICROADS, MRWA, TMR, DPTI, OTHER) | Now 12 total — covers BANC + S/4HANA + state road authorities |
| `INSPECTION_TYPE` | 7 (L1_ROUTINE..CULVERT_CDC, DRIVE_BY) | UI-style codes alongside existing ROUTINE/PRINCIPAL/etc. |
| `ACCESS_METHOD` | 2 (VISUAL, UBIV) | |
| `DEFECT_SEVERITY` | 3 (NONE, MODERATE_REPAIR, SEVERE_URGENT) | |

---

## 4. Excel template — the new starter file

**Path:** `app/bridge-management/webapp/resources/templates/lookups-template.xlsx`
**Generator:** `scripts/generate-lookups-template.py` (uses `openpyxl`)
**Size:** ~19 KB · **Sheets:** 2 · **Total rows:** 271

### Sheet 1 — `Lookups`
- Frozen header row, white-on-blue
- 5 columns: `category, code, description, displayOrder, isActive`
- Cell comments on every header explaining the field's purpose, length
  limits, and upsert semantics
- Alternating row tint per category for readability
- 270 data rows (every active lookup from the live DB at generation time)

### Sheet 2 — `Categories`
- 41 rows, one per category
- Columns: `category, row_count, purpose`
- The "purpose" column is human-curated and tells the admin **which UI
  screen** the category drives, so they know what they'll affect when
  they edit a value

### How it's served
- Pre-built once via `python3 scripts/generate-lookups-template.py`
- Sits in `webapp/resources/templates/` and is served by the CDS static
  asset middleware as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Re-generate whenever the Lookup table changes meaningfully (or on
  every deploy via a `postdeploy` hook — left as future work)

### How the Download Template button picks it up
- `MassUpload.controller.js` `onDownloadTemplate()` checks
  `this._uploadType === "lookups"` and routes to `_downloadLookupsXlsxTemplate()`,
  which fetches the static xlsx and triggers a browser download
- For all other upload types (bridges, restrictions, etc.) the original
  CSV-stub behaviour is unchanged
- On error a `MessageBox.error` tells the user to run the regenerator
  script — no silent failures

---

## 5. Live verification (in the actual Chrome tab on `localhost:4044`)

### BridgeForm dropdowns — all 6 lookup-driven, all match Lookup table

| Dropdown | Items | Notes |
|---|---|---|
| `fPostingStatus` | 5 (`""`, UNRESTRICTED, POSTED, REDUCED, CLOSED) | **No more HEIGHT_RESTRICTED**; matches server allow-list exactly |
| `fScourRisk` | 6 (incl. UNKNOWN) | |
| `fStructureType` | 9 — including user-uploaded `ABC` | **Custom uploaded value visible** — proves the migration |
| `fDesignLoad` | 10 (T44, L44, M1600, S1600, SM1600, HLP320, HLP400, HISTORIC, OTHER) | All seeded via mass upload |
| `fNhvrApprovalClass` | 9 (CLASS1–CLASS4, HML, B_DOUBLE, B_TRIPLE, NONE) | **NEW** category |
| `fExtSystem` | 12 — old (S4_HANA/ESRI/BANC/GAZETTE/WEATHER) + new (RMS/VICROADS/MRWA/TMR/DPTI/OTHER) | Existing category extended; both old + new visible |

### InspectionCreate dropdowns — all 5 lookup-driven

| Dropdown | Items |
|---|---|
| `selInspType` | 14 (existing 6 + 7 newly-seeded UI-style codes) |
| `selStandard` | 6 (5 standards + blank) |
| `selAccess` | 9 (existing 6 + 2 newly-seeded + blank) |
| `selDefect` | 15 (NONE + D1–D13 + blank) |
| `selSeverity` | 8 (5 newly-seeded + blank) |

### Excel template download

| Check | Result |
|---|---|
| HTTP status of static xlsx URL | 200 OK |
| Content-Type | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ✓ |
| File size | 19,477 bytes |
| Magic bytes | `PK` (valid xlsx zip) ✓ |
| Mass Upload UI button (`onDownloadTemplate()` for lookups) | Triggers blob download with `download="lookups-template.xlsx"`, success toast |
| Sheets in xlsx | `Lookups` (271 rows × 5 cols) + `Categories` (42 rows × 3 cols) |

### End-to-end save with new lookup-only values

Saved a bridge `BRG-NSWGEN-BMF1CG4` ("Phase-2 Lookup Test Bridge") through
the actual `onSave()` controller path with all 6 BridgeForm dropdowns set
to **values that did not exist in the old hardcoded lists**:

| Field | Value | Source |
|---|---|---|
| `postingStatus` | `REDUCED` | Was missing from old hardcoded list |
| `structureType` | `ABC` | User-uploaded custom value |
| `designLoad` | `HLP400` | Newly-seeded category |
| `scourRisk` | `UNKNOWN` | |
| `nhvrRouteApprovalClass` | `CLASS3` | Newly-seeded NHVR_APPROVAL_CLASS |
| `extSystem` | `VICROADS` | Newly-seeded extension to EXTERNAL_SYSTEM_TYPE |

DB query confirms all 6 values persisted. **No "Save failed" error.**

---

## 6. Architectural decision recorded

> Every dropdown that emits a value persisted to the database now sources
> its options from the `Lookup` OData entity at runtime via
> `LookupService.populateFormSelect(...)`. To add or rename a value, the
> admin uploads a CSV via **Mass Upload → Lookup Values** — no code change.

The single source of truth is the `nhvr.Lookup` table, exposed at
`/bridge-management/Lookups`, populated by `srv/handlers/upload.js`'s
hardened `massUploadLookups` action (added in this conversation), and
audited per-row via `nhvr.AuditLog` (also from this conversation).

Three layers of safety prevent the previous "dropdown shows a value the
server rejects" failure mode that started this thread:

1. **The dropdown can never offer a value that doesn't exist in the
   `Lookup` table.** UI populated from the same source the admin edits.
2. **The mass upload itself is validated** — header whitelist, length
   enforcement, normalisation, per-row rejection with row numbers.
3. **The server's enum guards still exist** as a final safety net (e.g.
   `srv/handlers/bridges.js:67` still hard-rejects bad `postingStatus`),
   so even if the Lookup table is corrupted, bad data can't reach the
   database.

---

## 7. Phase 3 (out of scope for this turn — left for follow-up)

The following 5 BridgeDetail dialog selects have hardcoded items but
operate on transient form state in modal dialogs (not on the BridgeForm
itself), so they don't crash save and were left for a follow-up turn:

- `BridgeDetail.bdRestUnit` / `editRestUnit` / `glEditRestUnit` → `MEASUREMENT_UNIT`
- `BridgeDetail.bdRestStatus` / `editRestStatus` → `RESTRICTION_DIRECTION`
- `BridgeDetail.rcCondition` → `VEHICLE_CLASS`

The Lookup categories for all 3 are **already seeded** (`MEASUREMENT_UNIT`
6 rows, `RESTRICTION_DIRECTION` 7 rows, `VEHICLE_CLASS` 9 rows), so the
remaining work is purely view + controller wiring — about 30 lines total.

---

## 8. Files changed this session

```
app/bridge-management/webapp/view/BridgeForm.view.xml
app/bridge-management/webapp/view/InspectionCreate.view.xml
app/bridge-management/webapp/view/FreightRoutes.view.xml
app/bridge-management/webapp/view/Permits.view.xml
app/bridge-management/webapp/controller/BridgeForm.controller.js
app/bridge-management/webapp/controller/InspectionCreate.controller.js
app/bridge-management/webapp/controller/FreightRoutes.controller.js
app/bridge-management/webapp/controller/Permits.controller.js
app/bridge-management/webapp/controller/MassUpload.controller.js
app/bridge-management/webapp/resources/templates/lookups-template.xlsx  (NEW)
scripts/generate-lookups-template.py                                    (NEW)
test/fixtures/lookups-phase2-seed.csv                                   (NEW)
test/LOOKUP_MIGRATION_REPORT.md                                         (NEW — this file)
```

---

## 9. How to verify yourself

```bash
# Open the app
open http://localhost:4044/bridge-management/webapp/index.html
# Login: admin / admin
```

1. **Mass Upload → Lookup Values → "Download Template CSV"** — you'll
   get `lookups-template.xlsx` (note the .xlsx extension), open in
   Excel, you should see 270 rows on the `Lookups` sheet and 41 on the
   `Categories` sheet.

2. **Bridges → Add Bridge** — the Posting Status dropdown should show
   only **5 values** (UNRESTRICTED, POSTED, REDUCED, CLOSED, blank).
   The Structure Type dropdown should include any custom values you've
   uploaded (e.g. `ABC Bridge`). Try saving with `REDUCED`, `ABC`, and
   `HLP400` — the save should succeed.

3. **Mass Upload → Lookup Values** — upload a tiny CSV adding a row to
   any category (e.g. `STRUCTURE_TYPE,MY_NEW_TYPE,My New Bridge Type,99,true`).
   Refresh the Bridges → Add Bridge page. The new value appears in the
   Structure Type dropdown immediately. **No code change required.**

4. **Inspection Create** (`#/inspection/create`) — Inspection Type,
   Standard, Access Method, Defect Code (D1–D13), and Defect Severity
   should all be lookup-driven now.

---

*Generated 2026-04-11 as part of the BIS app lookup-architecture
hardening pass. All changes scoped to this project folder.*
