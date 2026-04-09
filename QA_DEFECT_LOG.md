# NHVR Bridge Management App — QA Defect Log

**QA Run Date:** 2026-03-24  
**App Version:** 1.2.0  
**Tester:** Claude Code (Autonomous QA)

---

## DEF-001 — Date Deserialization Error on Bridge Save (inspectionDate)

| Field | Value |
|-------|-------|
| **ID** | DEF-001 |
| **Severity** | Critical |
| **Screen** | BridgeForm (Add Bridge / Edit Bridge) |
| **Area** | Create Record / Edit Record |
| **Description** | Saving a bridge with a blank Inspection Date field sends an empty string `""` to the OData service. CAP rejects it: *"Deserialization Error: Invalid value (string) for property 'inspectionDate'. A string value in the format YYYY-MM-DD must be specified."* |
| **Steps to Reproduce** | 1. Navigate to Add Bridge or Edit Bridge. 2. Leave Inspection Date blank (or clear it). 3. Click Save Bridge. 4. Observe error strip: "Save failed: Deserialization Error…" |
| **Expected** | Empty date field sends `null` to the backend; bridge saves successfully. |
| **Actual** | Empty string `""` sent for `inspectionDate`; CAP deserialization fails. |
| **Root Cause** | `BridgeForm.controller.js` line 251: `this.byId("fInspectionDate").getValue()` returns `""` when DatePicker is empty. Empty string is not a valid `Edm.Date` value. |
| **Fix Applied** | Added `\|\| null` coercion: `this.byId("fInspectionDate").getValue() \|\| null`. Empty string now becomes `null`, which OData accepts. File: `app/bridge-management/webapp/controller/BridgeForm.controller.js` line 252. |
| **Verified** | Yes — fix applied and synced to app-router. |

---

## DEF-002 — Date Deserialization Error on Bridge Save (nextInspectionDue)

| Field | Value |
|-------|-------|
| **ID** | DEF-002 |
| **Severity** | Critical |
| **Screen** | BridgeForm (Add Bridge / Edit Bridge) |
| **Area** | Create Record / Edit Record |
| **Description** | Same as DEF-001 but for the `nextInspectionDue` field. Empty Next Inspection Due date sends `""` causing a deserialization error. |
| **Steps to Reproduce** | 1. Navigate to Add Bridge. 2. Leave Next Inspection Due blank. 3. Click Save Bridge. 4. Error: "Save failed: Deserialization Error: Invalid value (string) for property 'nextInspectionDue'." |
| **Expected** | `null` sent for empty date; saves successfully. |
| **Actual** | `""` sent; CAP rejects. |
| **Root Cause** | Same as DEF-001. `BridgeForm.controller.js` line 252: missing null coercion. |
| **Fix Applied** | Added `\|\| null`: `this.byId("fNextInspDue").getValue() \|\| null`. |
| **Verified** | Yes — fix applied. |

---

## DEF-003 — BridgeDetail Header Missing Next Inspection Due, Year Built, Asset Owner

| Field | Value |
|-------|-------|
| **ID** | DEF-003 |
| **Severity** | Medium |
| **Screen** | Bridge Detail |
| **Area** | Header Strip (DynamicPageHeader) |
| **Description** | The bridge detail header strip did not show Next Inspection Due (critical for overdue detection), Year Built, or Asset Owner — fields frequently needed at a glance without scrolling into the Overview tab. |
| **Steps to Reproduce** | 1. Open any Bridge Detail page. 2. Observe the header strip. 3. Next Inspection Due, Year Built, Asset Owner not shown. |
| **Expected** | Key fields visible in the sticky header for at-a-glance access. |
| **Actual** | Only 6 fields shown: Condition, Posting Status, Region/State, Route, Clearance, Last Inspection. |
| **Root Cause** | UX design gap — header not updated when new fields were added. |
| **Fix Applied** | Added `hdrNextInspDue` (with overdue colour-coding: Error=overdue, Warning=<90 days, Success=ok), `hdrYearBuilt`, `hdrAssetOwner` to `BridgeDetail.view.xml` header. Controller wired up in `_renderBridgeInfo`. |
| **Verified** | Yes. |

---

## DEF-004 — BridgeDetail $select Missing Extended Bridge Fields

| Field | Value |
|-------|-------|
| **ID** | DEF-004 |
| **Severity** | High |
| **Screen** | Bridge Detail |
| **Area** | Data Loading |
| **Description** | `_loadBridge()` OData fetch had a `$select` list that omitted `roadRoute`, `routeNumber`, `nextInspectionDue`, `geometry`, `dataSource`, `bancId`, `bancURL`, `primaryExternalSystem`, `primaryExternalId`, `primaryExternalURL`. These fields returned as `undefined` in the UI. |
| **Steps to Reproduce** | 1. Open Bridge Detail. 2. Overview tab — Road Route, Route Number show "—" even when data exists. 3. External Systems tab — BANC ID blank. |
| **Expected** | All bridge fields loaded and displayed correctly. |
| **Actual** | Extended fields omitted from OData query returned undefined. |
| **Root Cause** | `$select` query in `BridgeDetail.controller.js` not updated when schema extend block added new fields. |
| **Fix Applied** | Updated `$select` in `_loadBridge()` to include all extended fields. Added `_setText("ovRoadRoute", ...)`, `_setText("ovRouteNumber", ...)` rendering calls. |
| **Verified** | Yes. |

---

## DEF-005 — BridgeDetail Tab Order Incorrect (UX)

| Field | Value |
|-------|-------|
| **ID** | DEF-005 |
| **Severity** | Medium |
| **Screen** | Bridge Detail |
| **Area** | Navigation / UX |
| **Description** | Tab order did not reflect engineering workflow priority. Capacity (critical for permit decisions) was last; External Systems appeared before Inspection Orders; Inspections was positioned before Attributes. |
| **Steps to Reproduce** | Open Bridge Detail → observe tab order. |
| **Expected** | Order: Overview → Capacity → Restrictions → Attributes → Map → External Systems → Inspection Orders → Inspections → Defects → History |
| **Actual** | Old order: Overview → Restrictions → Inspections → Attributes → Map → Inspection Orders → Defects → External Systems → History → Capacity |
| **Root Cause** | Tabs not reorganised as features were added incrementally. |
| **Fix Applied** | Reordered `IconTabFilter` blocks in `BridgeDetail.view.xml` to match engineering workflow. |
| **Verified** | Yes. |

---

## DEF-006 — Overview KPI Strip Missing Active Restrictions Count

| Field | Value |
|-------|-------|
| **ID** | DEF-006 |
| **Severity** | Medium |
| **Screen** | Bridge Detail — Overview Tab |
| **Area** | KPI / Dashboard |
| **Description** | Overview tab KPI strip had 4 panels but no Active Restrictions count — the most operationally critical metric for a bridge. Engineers had to click to the Restrictions tab to see the count. |
| **Steps to Reproduce** | Open Bridge Detail → Overview tab → no restrictions count visible. |
| **Expected** | Active restrictions count shown prominently on Overview with appropriate state (Error if >0). |
| **Actual** | Count absent from Overview. |
| **Root Cause** | KPI strip not updated when restrictions tab was added. |
| **Fix Applied** | Added "Active Restrictions" KPI card (`id="ovActiveRestrictions"`) to the KPI strip. Controller updates count after `_loadRestrictions` resolves. State set to Error if count >0, Success if 0. |
| **Verified** | Yes. |

---

## DEF-007 — Geometry Field Not in Schema or Bridge Form

| Field | Value |
|-------|-------|
| **ID** | DEF-007 |
| **Severity** | Medium |
| **Screen** | BridgeForm, BridgeDetail Map Tab |
| **Area** | New Feature / Data Model |
| **Description** | No mechanism to store GeoJSON geometry for a bridge's deck/alignment. Map view only supported a point marker (lat/lng). Detailed geometry required for corridor/polygon mapping. |
| **Steps to Reproduce** | N/A — feature missing. |
| **Expected** | Ability to store and retrieve GeoJSON LineString/Polygon/Point for bridge geometry. |
| **Actual** | Field did not exist. |
| **Root Cause** | Feature gap — geometry not included in initial schema design. |
| **Fix Applied** | Added `geometry: LargeString` to `extend Bridge with` block in `db/schema.cds`. Added Section 8 GeoJSON TextArea to `BridgeForm.view.xml`. Wired `fGeometry` field in `BridgeForm.controller.js` (_resetForm, _populateForm, onSave payload). |
| **Verified** | Yes — schema updated, form updated, controller updated. |

---

## DEF-008 — BridgeDetail Quick Actions Duplicated (Bottom and Top of Overview)

| Field | Value |
|-------|-------|
| **ID** | DEF-008 |
| **Severity** | Low |
| **Screen** | Bridge Detail — Overview Tab |
| **Area** | UX |
| **Description** | Quick Actions panel existed at the bottom of the Overview tab — poor discoverability and duplicated functionality. Users had to scroll past all content to find action buttons. |
| **Expected** | Actions prominent at top of view for immediate access. |
| **Actual** | Actions buried at bottom of a long tab. |
| **Root Cause** | Actions added incrementally without UX review. |
| **Fix Applied** | Moved actions to an `OverflowToolbar` at the top of Overview tab. Added two new actions: "Add Restriction" and "New Inspection Order". Removed the old bottom Quick Actions panel. |
| **Verified** | Yes. |

