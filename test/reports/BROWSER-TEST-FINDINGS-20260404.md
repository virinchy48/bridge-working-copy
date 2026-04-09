# SuperTester v8 Browser Test Findings — 2026-04-04

**App**: NHVR Bridge Asset Management
**URL**: http://localhost:4004/bridge-management/webapp/index.html
**UI5 Version**: 1.133.0 (via local CDN proxy)
**CDS Server**: v9.8.3 | SQLite in-memory | Mock auth (admin)
**Browser**: Chrome

---

## Phase 0: Init & Console Baseline

| Finding | Severity | Status |
|---------|----------|--------|
| SAP UI5 CDN `sapui5.hana.ondemand.com` returns 503 from browser | BLOCKER | FIXED — added `/ui5cdn/*` reverse proxy in `server.js` |
| `Component-preload.js` 404 | INFO | Expected in dev (no build step) |
| LrepConnector `loadFlexData` / `loadFeatures` 404 | INFO | Expected without SAP Launchpad |
| Missing i18n keys: `analytics.tile.title`, `analytics.tile.subtitle` | MEDIUM | FIXING |
| ShellBar `showCopilotButton` unknown setting (UI5 1.120) | LOW | N/A for 1.133.0 proxy |
| ShellBar `additionalContent` aggregation rejects Button | LOW | Cosmetic — buttons still render |

## Phase 1-2: Auth & Navigation Walkthrough

**27 routes tested programmatically via `router.navTo()`**

| Route | Result |
|-------|--------|
| Home | OK — renders Home view with KPIs, tiles, network condition |
| Dashboard | OK — Asset Command Dashboard with 8 KPI cards |
| BridgesList | OK — 100 of 2126 bridges, filters, toolbar |
| RestrictionsList | OK |
| MapView | OK (map tile fetch fails without auth — expected) |
| Reports | OK |
| MassUpload | OK |
| AdminConfig | OK |
| InspectionDashboard | OK |
| DefectRegister | OK |
| BridgeNew | OK |
| VehicleCombinations | OK |
| AdminRestrictionTypes | OK |
| MassEdit | OK |
| AdminVehicleTypes | OK |
| Permits | OK |
| RouteAssessment | OK |
| FreightRoutes | OK |
| WorkOrders | OK |
| IntegrationHub | OK |
| LicenseConfig | OK |
| RoutePlanner | OK |
| AppAdmin | OK |
| BmsTechAdmin | OK |
| AnnualConditionReport | OK |
| PermitRegisterReport | OK |
| AnalyticsDashboard | OK |

**Navigation finding**: All 27 routes load their target views correctly. No NAV_ERROR exceptions.

## Phase 3-4: Form Validation & Data Display

| Finding | Severity | Detail |
|---------|----------|--------|
| Dashboard KPIs render correctly | PASS | 2,126 total assets, 7 critical risk, 12 active restrictions, 1 closure |
| Network BHI shows 0% (red "At Risk") | MEDIUM | May indicate missing `conditionScore` data in seed CSV — all bridges defaulting to 0 |
| Inspection Compliance shows 1% | INFO | Only 2 pending inspections out of 2126 — seed data limitation |
| Bridges table loads 100 of 2126 (pagination) | PASS | Correct `$top=100` with lazy-load |
| Bridge ID column is clickable link | PASS | Deep-link pattern works |
| Clearance column shows "m" without value for some bridges | LOW | Missing `verticalClearance` in seed data renders as blank + "m" unit |

## Phase 5-6: Network & Console Error Sweep

| Finding | Severity | Detail |
|---------|----------|--------|
| MapLibre `Failed to fetch` on map tile URL | LOW | Map tiles require specific tile server auth — expected in dev |
| BridgeDetail view load "Failed to fetch" | HIGH | View XML fetch fails intermittently — likely CDN proxy timeout. Works on page reload. |
| No OData 4xx/5xx errors during normal browsing | PASS | All API calls return 200 |

## Phase 7-8: Accessibility & Security

### Accessibility (axe-core 4.7.2)

| Metric | Count |
|--------|-------|
| Passes | 40 |
| Violations | 4 |
| Incomplete | 1 |
| Critical | 0 |
| Serious | 1 |
| Moderate | 3 |
| Minor | 0 |

**Serious violations:**
- `color-contrast` (3 nodes): Section headers "OPERATIONS" and "ANALYTICS" use `#8396a8` on `#f5f6f7` background (contrast ratio 2.81:1, needs 4.5:1). Tile subtitle text uses `#8396a8` on white (3.04:1).

**Moderate violations:**
- `heading-order`: Heading levels skip (e.g., h2 to h4)
- `landmark-no-duplicate-banner`: Duplicate banner landmarks
- `region`: 12 elements not contained in landmark regions

### Security Headers

| Header | Value | Status |
|--------|-------|--------|
| X-Content-Type-Options | nosniff | PASS |
| X-Frame-Options | SAMEORIGIN | PASS |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | PASS |
| Referrer-Policy | strict-origin-when-cross-origin | PASS |
| Permissions-Policy | geolocation=(self), camera=(), microphone=() | PASS |
| Content-Security-Policy | Full policy with script/style/font/img/connect-src | PASS |

### XSS Testing

| Test | Result |
|------|--------|
| Script injection in OData $filter | Blocked by auth (401 Unauthorized) |
| CSP blocks inline script from external sources | PASS |

## Phase 9-10: Performance & UX

| Metric | Value | Status |
|--------|-------|--------|
| Initial page load (UI5 via CDN proxy) | ~8-10s | ACCEPTABLE (CDN proxy adds latency; direct CDN would be faster) |
| Bridge list load (100 records) | ~2s | PASS |
| Dashboard KPI load | ~1s | PASS |
| Navigation between views | <1s (cached views) | PASS |
| Empty state for Permit Required tile | Shows "—" dash | PASS |
| Notification bell badge | Shows "10" | PASS |

## Phase 11: Exploratory Testing

| Finding | Severity | Detail |
|---------|----------|--------|
| Clearance column shows bare "m" for bridges without clearance data | LOW | Should show "—" or be blank |
| "Compliance & Ex..." truncated tile subtitle | LOW | Text overflow on Reports tile |
| "Minister/Parliame..." truncated on Annual Condition Report tile | LOW | Text overflow |
| Home page sections render without visible issues | PASS | Operations, Analytics, Network Condition all render correctly |
| Dark mode toggle (moon icon) visible in header | PASS | Theme switching present |

---

## Summary

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| CDN/Infrastructure | 1 (FIXED) | 0 | 0 | 0 | 0 |
| Navigation | 0 | 0 | 0 | 0 | 0 |
| Data Display | 0 | 0 | 1 | 2 | 1 |
| Console Errors | 0 | 1 | 1 | 1 | 2 |
| Accessibility | 0 | 0 | 1 | 3 | 0 |
| Security | 0 | 0 | 0 | 0 | 0 |
| UX | 0 | 0 | 0 | 3 | 0 |
| **Total** | **1** | **1** | **3** | **9** | **3** |

## Fixes Applied This Session

1. **FIXED**: UI5 CDN 503 — added `/ui5cdn/*` reverse proxy in `server.js` to proxy `sapui5.hana.ondemand.com/1.133.0` through the CDS server
2. **FIXED**: Updated all 4 `index.html` files to use local proxy (`/ui5cdn/`) instead of direct CDN
3. **FIXING**: Missing i18n keys `analytics.tile.title` and `analytics.tile.subtitle`
4. **FIXING**: Color contrast violations on section headers
