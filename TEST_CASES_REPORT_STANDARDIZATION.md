# NHVR Bridge Management — Report Standardization Test Cases
**Version:** 1.3 | **Date:** 2026-03-25 | **Scope:** Phase 2 Report Standardization

---

## 1. FILTER SCENARIOS

### TC-FILT-001 — Bridges List: Single Status Filter
| Field       | Value |
|-------------|-------|
| Screen      | Bridges (BridgesList) |
| Precondition | Bridges list loaded with data |
| Steps       | 1. Set Status filter to "POSTED" → click Apply |
| Expected    | Table shows only bridges where `postingStatus = 'POSTED'`; count badge matches row count |
| Verify      | OData request contains `$filter=postingStatus eq 'POSTED'` |

### TC-FILT-002 — Bridges List: Multi-Condition AND Filter
| Field       | Value |
|-------------|-------|
| Steps       | 1. Switch filter mode to "AND"; 2. Add criteria: State = NSW, Condition Rating ≤ 4; 3. Apply |
| Expected    | Only bridges in NSW with conditionRating ≤ 4 returned |
| Verify      | OData filter: `state eq 'NSW' and conditionRating le 4` |

### TC-FILT-003 — Bridges List: Multi-Condition OR Filter
| Field       | Value |
|-------------|-------|
| Steps       | 1. Switch filter mode to "OR"; 2. Add criteria: Condition = CRITICAL, Status = CLOSED; 3. Apply |
| Expected    | Bridges matching EITHER condition returned |
| Verify      | OData filter: `condition eq 'CRITICAL' or postingStatus eq 'CLOSED'` |

### TC-FILT-004 — Bridges List: Filter Preset Save & Reload
| Field       | Value |
|-------------|-------|
| Steps       | 1. Set State = VIC; 2. Save preset as "VIC Bridges"; 3. Clear filters; 4. Load "VIC Bridges" preset |
| Expected    | State filter resets to VIC; table repopulates with VIC bridges |
| Verify      | localStorage key `nhvr_bridge_filter_presets` contains serialized VIC preset |

### TC-FILT-005 — Restrictions: Status + Type Combined Filter
| Field       | Value |
|-------------|-------|
| Screen      | Restrictions |
| Steps       | 1. Status filter = ACTIVE; 2. Restriction Type = LOAD_LIMIT; 3. Apply |
| Expected    | Table shows only ACTIVE LOAD_LIMIT restrictions |
| Verify      | OData: `status eq 'ACTIVE' and restrictionType eq 'LOAD_LIMIT'` |

### TC-FILT-006 — Defects: Severity + Status Combined Filter
| Field       | Value |
|-------------|-------|
| Screen      | Defect Register |
| Steps       | 1. Severity = CRITICAL; 2. Status = OPEN; 3. Apply |
| Expected    | Table shows only open critical defects; KPI counts update |
| Verify      | Open KPI ≥ table row count (table may be further filtered from KPI scope) |

### TC-FILT-007 — Inspections: Status Filter Updates KPI
| Field       | Value |
|-------------|-------|
| Screen      | Inspection Dashboard — All Orders tab |
| Steps       | 1. Status filter = COMPLETED; 2. Observe KPI strip |
| Expected    | Table shows only COMPLETED orders; kpiTotal = server `@odata.count`; kpiCompleted = table count |
| Verify      | No mismatch between kpiTotal and actual row count when filter = single status |

### TC-FILT-008 — Inspections Due: Days Lookahead Filter
| Field       | Value |
|-------------|-------|
| Steps       | 1. Switch to "Inspections Due" tab; 2. Set lookahead = 30 days |
| Expected    | Table repopulates with bridges due within 30 days; kpiDue updates |
| Verify      | OData function call: `getInspectionsDue(daysAhead=30)` |

### TC-FILT-009 — Permits: Status + Type Combined Filter
| Field       | Value |
|-------------|-------|
| Screen      | Vehicle Permits |
| Steps       | 1. Status = APPROVED; 2. Permit Type = ANNUAL; 3. Observe table |
| Expected    | Only annual approved permits shown |
| Note        | Filtering is client-side (search + select filters on `_allPermits` array) |

### TC-FILT-010 — Bridges: Dynamic Attribute Filter
| Field       | Value |
|-------------|-------|
| Steps       | 1. Open advanced filter; 2. Select a LOOKUP-type dynamic attribute with `filterEnabled=true`; 3. Set a value; 4. Apply |
| Expected    | Bridges filtered by the custom attribute value |
| Verify      | `_loadDynamicAttrFields()` injected the field; OData filter includes BridgeAttributes subfilter |

---

## 2. VARIANT SAVE / LOAD (Bridges Screen Only)

### TC-VAR-001 — Save New Variant
| Field       | Value |
|-------------|-------|
| Screen      | Bridges |
| Precondition | Column visibility and sort order modified via Table Settings |
| Steps       | 1. Click VariantManagement dropdown; 2. Click Save; 3. Enter name "High Risk Bridges"; 4. Confirm |
| Expected    | Variant "High Risk Bridges" appears in dropdown; state serialized to `localStorage` under key `nhvr_bridge_variants` |
| Verify      | `JSON.parse(localStorage.getItem('nhvr_bridge_variants'))` contains entry with name "High Risk Bridges" |

### TC-VAR-002 — Load Saved Variant
| Field       | Value |
|-------------|-------|
| Steps       | 1. Reload the page; 2. Open VariantManagement; 3. Select "High Risk Bridges" |
| Expected    | Column visibility and sort order restored exactly as saved |
| Verify      | `onVariantSelect` fires `_applyVariantState` with correct state object |

### TC-VAR-003 — Delete Variant
| Field       | Value |
|-------------|-------|
| Steps       | 1. Open VariantManagement; 2. Click Manage; 3. Delete "High Risk Bridges"; 4. Save |
| Expected    | Variant removed from dropdown and from localStorage |

### TC-VAR-004 — Default Variant Auto-Applies on Load
| Field       | Value |
|-------------|-------|
| Steps       | 1. Save a variant and mark as default; 2. Navigate away and return |
| Expected    | Default variant applied automatically on `onAfterRendering` |
| Verify      | `_loadVariants()` detects `defaultVariantKey` and calls `_applyVariantState` |

### TC-VAR-005 — Variant State Includes Filter + Column Visibility
| Field       | Value |
|-------------|-------|
| Steps       | 1. Set State=QLD filter; 2. Hide "Year Built" column; 3. Save as "QLD View"; 4. Reset; 5. Load "QLD View" |
| Expected    | Both filter value AND column visibility restored |

---

## 3. EXPORT VALIDATION (Excel .xlsx)

### TC-EXP-001 — Bridges Export: Format and Content
| Field       | Value |
|-------------|-------|
| Screen      | Bridges |
| Steps       | 1. Load bridge list (no filter); 2. Click Export Excel |
| Expected    | File `NHVR_Bridges_YYYY-MM-DD.xlsx` downloads; Sheet 1 has header row with columns: Bridge ID, Name, State, Region, Asset Class, Year Built, Spans, Length (m), Condition Rating, Condition, Posting Status, Mass Limit (t), Inspection Date, Custodian, Criticality |
| Verify      | Row count in Excel = `@odata.count` from server (no truncation) |

### TC-EXP-002 — Bridges Export: Filtered Data
| Field       | Value |
|-------------|-------|
| Steps       | 1. Apply State=NSW filter; 2. Export |
| Expected    | Exported rows contain only NSW bridges; row count matches filtered table |

### TC-EXP-003 — Defects Export
| Field       | Value |
|-------------|-------|
| Screen      | Defect Register |
| Steps       | 1. Load with no filter; 2. Click Export Excel |
| Expected    | File `NHVR_Defects_YYYY-MM-DD.xlsx`; columns: Defect No., Bridge ID, Bridge Name, Category, Severity, Element Group, Priority, Status, Detected Date, Est. Repair (AUD) |
| Verify      | AUD column is numeric (not text-formatted) |

### TC-EXP-004 — Restrictions Export
| Field       | Value |
|-------------|-------|
| Screen      | Restrictions |
| Steps       | 1. Load; 2. Click Export Excel (single button — confirm no duplicate buttons) |
| Expected    | File `NHVR_Restrictions_YYYY-MM-DD.xlsx`; one button visible in toolbar |

### TC-EXP-005 — Inspections Export: Context-Aware Tab
| Field       | Value |
|-------------|-------|
| Screen      | Inspection Dashboard |
| Steps       | 1. On "All Orders" tab → Export → verify InspectionOrders data; 2. Switch to "Inspections Due" tab → Export → verify due bridges data |
| Expected    | Different data sets exported per active tab; both are .xlsx |

### TC-EXP-006 — Permits Export
| Field       | Value |
|-------------|-------|
| Screen      | Vehicle Permits |
| Steps       | 1. Load; 2. Click Export Excel |
| Expected    | File `NHVR_VehiclePermits_YYYY-MM-DD.xlsx`; columns: Permit ID, Bridge Name, Vehicle Type, Vehicle Class, GVM (t), Permit Type, Status, All Checks, Effective From, Expiry Date, Applicant |

### TC-EXP-007 — Reports: Asset Register Export
| Field       | Value |
|-------------|-------|
| Screen      | Reports → Asset Register tab |
| Steps       | 1. Run report; 2. Click Export Excel |
| Expected    | File `NHVR_AssetRegister_YYYY-MM-DD.xlsx` with BridgeColumns format |

### TC-EXP-008 — Reports: Restriction Summary Export
| Field       | Value |
|-------------|-------|
| Steps       | 1. Navigate to Restrictions tab; 2. Run; 3. Export |
| Expected    | File `NHVR_RestrictionSummary_YYYY-MM-DD.xlsx` using RestrictionColumns |

### TC-EXP-009 — Export Error: No Data
| Field       | Value |
|-------------|-------|
| Steps       | 1. Apply a filter that returns 0 rows; 2. Click Export |
| Expected    | `MessageToast.show("No data to export")` fires; no file download triggered |

### TC-EXP-010 — Portfolio/Safety/Investment Reports Export
| Field       | Value |
|-------------|-------|
| Steps       | 1. Load each report; 2. Export |
| Expected    | Separate .xlsx files named `NHVR_BridgePortfolioReport_*.xlsx`, `NHVR_BridgeSafetyReport_*.xlsx`, `NHVR_BridgeInvestmentReport_*.xlsx` |

---

## 4. NAVIGATION — Bridge ID Click → Object Page

### TC-NAV-001 — Defects: Bridge ID Link Navigation
| Field       | Value |
|-------------|-------|
| Screen      | Defect Register |
| Steps       | 1. Load defects; 2. Click any Bridge ID link in the table |
| Expected    | Router navigates to `BridgeDetail` route with correct `bridgeId` parameter |
| Verify      | URL contains `#/BridgeDetail/<bridgeId>` or equivalent hash fragment |

### TC-NAV-002 — Inspection Orders: Bridge ID Link Navigation
| Field       | Value |
|-------------|-------|
| Screen      | Inspection Dashboard → All Orders tab |
| Steps       | 1. Click Bridge ID link in Orders table |
| Expected    | Navigates to BridgeDetail for that bridge |
| Verify      | `onBridgeIdPress` fires; `encodeURIComponent(bridgeId)` used in navTo params |

### TC-NAV-003 — Inspections Due: Bridge ID Link Navigation
| Field       | Value |
|-------------|-------|
| Screen      | Inspection Dashboard → Inspections Due tab |
| Steps       | 1. Click Bridge ID link in Due table |
| Expected    | Navigates to BridgeDetail for that bridge |

### TC-NAV-004 — Restrictions: Bridge ID Link Navigation
| Field       | Value |
|-------------|-------|
| Screen      | Restrictions |
| Steps       | 1. Click Bridge ID link |
| Expected    | Navigates to BridgeDetail; `onBridgeIdPress` resolves `bridgeId` to GUID via sub-fetch if needed |

### TC-NAV-005 — Permits: Bridge ID Link Navigation
| Field       | Value |
|-------------|-------|
| Screen      | Vehicle Permits |
| Steps       | 1. Click Bridge ID link in table |
| Expected    | Navigates to BridgeDetail |

### TC-NAV-006 — Navigation: Back to Home via Breadcrumb
| Field       | Value |
|-------------|-------|
| Steps       | 1. Open any report screen; 2. Click "Home" breadcrumb link |
| Expected    | Router navigates to Home route; Home screen loads |

### TC-NAV-007 — Inspection Order Row Press → BridgeDetail
| Field       | Value |
|-------------|-------|
| Steps       | 1. Click any row in Inspection Orders table (not the Bridge ID link specifically) |
| Expected    | `onOrderPress` fires; navigates to BridgeDetail for the order's bridge |

---

## 5. ROLE-BASED ACCESS

### TC-ROLE-001 — Admin Role: Full Access
| Field       | Value |
|-------------|-------|
| User        | `alice` (Admin scope) |
| Steps       | 1. Log in as alice; 2. Check: New Permit, Export, Mass Edit, Admin Config tiles all visible |
| Expected    | All features enabled; no tiles hidden |
| Verify      | RoleManager.js `isAdmin()` returns true; `featureEnabled` all true in RoleConfig |

### TC-ROLE-002 — BridgeManager Role: No Admin Tile
| Field       | Value |
|-------------|-------|
| User        | `bob` (BridgeManager scope) |
| Expected    | Admin Config tile hidden; Mass Edit available; Export available |
| Verify      | `hasRole('BridgeManager')` true; `hasRole('Admin')` false |

### TC-ROLE-003 — Executive Role: Read-Only KPI Access
| Field       | Value |
|-------------|-------|
| User        | `dave` (Executive scope) |
| Expected    | Executive Dashboard visible; Bridges list visible (read-only); No Create/Edit buttons; No admin sections |
| Verify      | Buttons with `enabled="{= ${roleConfig>/canEdit} }"` are disabled |

### TC-ROLE-004 — Viewer Role: Minimal Access
| Field       | Value |
|-------------|-------|
| User        | `carol` (Viewer scope) |
| Expected    | Can view Bridges, Restrictions; Cannot create permits; Cannot export (if featureEnabled=false for Viewer) |
| Verify      | RoleManager fallback config: Viewer row has `canEdit=false`, `canCreate=false` |

### TC-ROLE-005 — Inspector Role: Inspection Features Visible
| Field       | Value |
|-------------|-------|
| User        | User with `NHVR_Inspector` role collection |
| Expected    | Inspection Dashboard and Defect Register tiles visible on Home; Permit tile hidden |
| Verify      | Home.controller.js `_setVisibility()` checks `featureEnabled` for Inspector from RoleConfig |

### TC-ROLE-006 — Operator Role: Permits Visible
| Field       | Value |
|-------------|-------|
| User        | User with `NHVR_Operator` role collection |
| Expected    | Permits tile and Route Assessment visible; no Inspection-specific features |
| Verify      | RoleManager `hasScope('Operator')` returns true |

### TC-ROLE-007 — XSUAA Token: Unauthenticated Redirect
| Field       | Value |
|-------------|-------|
| Steps       | 1. Access app URL without valid session |
| Expected    | App Router redirects to SAP IDP login page (XSUAA OAuth2 flow) |
| Verify      | HTTP 302 redirect to `accounts.sap.com/...` or equivalent XSUAA login URL |

---

## 6. KPI COUNT ACCURACY

### TC-KPI-001 — Home: Overdue Inspections KPI Matches Table
| Field       | Value |
|-------------|-------|
| Screen      | Home → "Overdue Inspections" tile |
| Steps       | 1. Note count on Home tile; 2. Navigate to Inspection Dashboard → Due tab; 3. Set lookahead to 90 days |
| Expected    | Counts are consistent (Home uses `nextInspectionDue lt today`; Due tab uses `getInspectionsDue(90)` — these are related but not identical queries, document any known delta) |

### TC-KPI-002 — Inspection Dashboard: Total = @odata.count
| Field       | Value |
|-------------|-------|
| Screen      | Inspection Dashboard → All Orders tab |
| Steps       | 1. Load with no filter; 2. Note kpiTotal; 3. Scroll to bottom of table (growing threshold) |
| Expected    | kpiTotal = server `@odata.count`; not the loaded page count |
| Verify      | Network request has `$top=9999&$count=true`; `kpiTotal` uses `j["@odata.count"]` |

### TC-KPI-003 — Executive Dashboard: Bridge KPIs Match Total
| Field       | Value |
|-------------|-------|
| Screen      | Executive Dashboard |
| Steps       | 1. Note "Total Bridges" KPI; 2. Note sum of Good+Fair+Poor+Critical counts |
| Expected    | Sum of condition counts ≤ Total (some bridges may have no condition set); Total ≈ 2,126 |
| Verify      | `$top=9999` added; client-side `bridges.length` used for total after server returns full set |

### TC-KPI-004 — Defects: KPI Open = Non-Closed Count
| Field       | Value |
|-------------|-------|
| Steps       | 1. Load defects (no filter); 2. Note kpiOpen; 3. Apply Status=OPEN filter; 4. Compare |
| Expected    | kpiOpen includes OPEN + UNDER_REPAIR + MONITORING (i.e. everything not CLOSED); may differ from OPEN-filter count alone |

---

## 7. LAYOUT & UX CONSISTENCY

### TC-UX-001 — All Report Screens Use DynamicPage
| Field       | Value |
|-------------|-------|
| Screens     | Bridges, Restrictions, Defects, Inspections, Permits, Reports |
| Steps       | Load each screen |
| Expected    | All use `sap.f.DynamicPage`; breadcrumbs present; title uses H1; Export + Refresh in `f:actions` |

### TC-UX-002 — Permits Screen: DynamicPage Layout
| Field       | Value |
|-------------|-------|
| Steps       | Load Permits screen |
| Expected    | No legacy `sap.m.Page` wrapper; DynamicPage header shows "Vehicle Permits" title + breadcrumb "Home > Vehicle Permits"; KPI tiles in content area |

### TC-UX-003 — Column Personalization via p13n Engine (Bridges)
| Field       | Value |
|-------------|-------|
| Steps       | 1. Click "Table Settings" button; 2. Toggle column visibility; 3. Apply |
| Expected    | p13n dialog opens; columns toggle correctly; no old CheckBox dialog appears |

### TC-UX-004 — Excel Export Button Label
| Field       | Value |
|-------------|-------|
| Screens     | All report screens |
| Expected    | Export button text = "Export Excel"; icon = `sap-icon://excel-attachment`; file extension `.xlsx` |

### TC-UX-005 — No Duplicate Buttons
| Field       | Value |
|-------------|-------|
| Screen      | Restrictions |
| Expected    | Exactly one Export button in `f:actions`; no "Export CSV" + "Export Excel" duplication |

---

## 8. REGRESSION: EXISTING FEATURES

### TC-REG-001 — Bridge Detail: Inspection Tab Still Works
| Field       | Value |
|-------------|-------|
| Steps       | 1. Open any BridgeDetail; 2. Click Inspections tab |
| Expected    | Inspection records load; no JavaScript errors |

### TC-REG-002 — Mass Upload: CSV Import Unaffected
| Field       | Value |
|-------------|-------|
| Steps       | 1. Navigate to Mass Upload; 2. Upload a valid CSV |
| Expected    | Upload succeeds; no regression from ExcelExport changes |

### TC-REG-003 — Admin Config: Lookups Tab
| Field       | Value |
|-------------|-------|
| Steps       | 1. Open Admin Config; 2. Navigate to Lookups tab; 3. Add/edit a lookup |
| Expected    | CRUD operations function; no side effects from controller changes |

### TC-REG-004 — Dynamic Attributes on BridgeForm
| Field       | Value |
|-------------|-------|
| Steps       | 1. Edit a bridge; 2. Scroll to Section 9 — Custom Attributes; 3. Fill a value; 4. Save |
| Expected    | Custom attribute saved and reloaded correctly |

---

## TEST SUMMARY TABLE

| Category         | Total TCs | Priority |
|-----------------|-----------|----------|
| Filter Scenarios | 10        | High     |
| Variant Mgmt     | 5         | High     |
| Export Validation| 10        | High     |
| Navigation       | 7         | High     |
| Role-Based Access| 7         | Medium   |
| KPI Accuracy     | 4         | Critical |
| UX Consistency   | 5         | Medium   |
| Regression       | 4         | High     |
| **TOTAL**        | **52**    | —        |

---

## KNOWN LIMITATIONS / TEST NOTES

1. **VariantManagement** uses `localStorage` — clear localStorage between test runs to avoid state bleed.
2. **p13n Engine** (`sap.m.p13n.Engine`) requires UI5 ≥ 1.96 at minimum; the app is at 1.120+ so should be fine, but verify in browser console.
3. **Role tests** require the BTP XSUAA service; local mock users (`alice`, `bob`, `carol`, `dave`) can be used for dev-env testing only.
4. **KPI-001** — Home "Overdue Inspections" uses `nextInspectionDue lt <today>` OData filter (field corrected from wrong `dueDate`); Due tab uses `getInspectionsDue(daysAhead=90)` CAP action which may use different logic. Document the delta.
5. **Export column definitions** for Reports portfolio/safety/investment reports reuse `BridgeColumns` — if those server views return different fields, update `ExcelExport.js` with dedicated column sets.
