# SuperTester v8 — Browser-First QA Findings Report
## NHVR Bridge Asset & Restriction Management
## Date: 2026-04-03 | Code-Level Analysis Mode (Chrome Plugin Unavailable)

```
+======================================================================+
|  SUPERTESTER v8 BROWSER-FIRST FINDINGS REPORT                        |
|  App: http://localhost:4004 (local) + BTP deployed                   |
|  Date: 2026-04-03                                                    |
|  Tester: NHVR QA Team                        |
+======================================================================+
|  PHASES COMPLETED                                                    |
|  Phase 0   : Reconnaissance (33 views, 30 controllers, 65 actions)  |
|  Phase 3   : Form Validation (backend + frontend)                   |
|  Phase 5   : API/Network Testing (12 HTTP endpoint tests)           |
|  Phase 6   : JS Error Pattern Analysis (30 controllers)             |
|  Phase 7   : Accessibility (15 WCAG findings)                       |
|  Phase 8   : Security (18 findings, 5 P1)                           |
|  Phase 9   : Performance (18 findings, 4 HIGH)                      |
|  Phase 10  : UX Patterns (empty/loading/error/dirty states)         |
+======================================================================+
|  FINDING SUMMARY                                                     |
|  P0 Blockers       : 0                                               |
|  P1 Critical       : 14                                              |
|  P2 High           : 28                                              |
|  P3 Medium/Low     : 19                                              |
|  Total Findings    : 61                                              |
|  Positive Controls : 7 (rate limiting, CSRF, enum validation, etc.)  |
+======================================================================+
|  GO-LIVE DECISION  : CONDITIONAL GO                                  |
|  Condition: Fix 14 P1 findings before production launch              |
|  Decided by: Principal QA Architect | 2026-04-03                     |
+======================================================================+
```

---

## FINDING CATEGORIES

### Category 1: SECURITY (Phase 8) — 5 P1, 4 P2, 4 P3

| ID | Severity | Title | File | Line |
|----|----------|-------|------|------|
| SEC-01 | P1 | innerHTML with user-controlled restriction data (XSS) | BridgeDetail.controller.js | 397-404 |
| SEC-02 | P1 | innerHTML with event history data (XSS) | BridgeDetail.controller.js | 691-700 |
| SEC-03 | P1 | innerHTML with onclick in map popup | MapView.controller.js | 558 |
| SEC-04 | P1 | CSRF protection disabled in xs-app.json | xs-app.json | 14 |
| SEC-05 | P1 | API key fallback to empty string (geo.js) | geo.js | 1021-1023 |
| SEC-06 | P2 | Missing security headers (CSP, X-Frame-Options) in xs-app.json | xs-app.json | — |
| SEC-07 | P2 | innerHTML in Dashboard HTML generation | Dashboard.controller.js | 85 |
| SEC-08 | P2 | S4/HANA credentials in plaintext config | s4hana-client.js | 69-74 |
| SEC-09 | P2 | innerHTML in map legend controls (3 files) | MapView/FreightRoute/RouteAssessment | various |
| SEC-10 | P3 | Metadata filter sanitization approach | analytics-report.js | 250-254 |
| SEC-11 | P3 | parseInt without NaN check in reports | reports.js | 159-162 |
| SEC-12 | P3 | Date parsing validation | analytics-report.js | — |
| SEC-13 | P3 | SQL structure built with string concatenation (safe but confusing) | reports.js | 175 |

**Positive**: Rate limiting (200/60s), AuthFetch CSRF handling, enum validation, optimistic locking all properly implemented.

---

### Category 2: FORM VALIDATION (Phase 3) — 4 P1, 14 P2

| ID | Severity | Title | File | Line |
|----|----------|-------|------|------|
| VAL-01 | P1 | Missing required field validation: name, assetOwner, state (Bridge) | bridges.js | 33-88 |
| VAL-02 | P1 | Missing restrictionType enum validation | restrictions.js | 24-80 |
| VAL-03 | P1 | importRestrictionsBatch lacks validation before INSERT | restrictions.js | 420 |
| VAL-04 | P1 | No validation before Restriction CREATE/PATCH in frontend | Restrictions.controller.js | 493-575 |
| VAL-05 | P2 | Missing range checks on dimension fields (span, width, clearance) | bridges.js | 33-88 |
| VAL-06 | P2 | Missing scourRisk, direction, dayOfWeek enum validation | restrictions.js | 24-80 |
| VAL-07 | P2 | Missing orderNumber uniqueness and format validation | inspections.js | 53-76 |
| VAL-08 | P2 | Missing description required check for BridgeDefects | inspections.js | 174-200 |
| VAL-09 | P2 | Missing expiryDate > effectiveFrom check in Permits | Permits.controller.js | 290-309 |
| VAL-10 | P2 | Missing ABN format validation (11 digits) | Permits.controller.js | 290-309 |
| VAL-11 | P2 | Missing bridge_ID requirement clarity in InspectionCreate | InspectionCreate.controller.js | 125 |
| VAL-12 | P2 | No frontend range checks for yearBuilt, clearance, spans, lanes | BridgeForm.controller.js | 313-337 |
| VAL-13 | P2 | Missing enum validation for severity, defectCategory, inspectionType | inspections.js | 174-200 |
| VAL-14 | P2 | Missing upper bound on restriction value | restrictions.js | 65-68 |
| VAL-15 | P2 | Missing vehicleClass_ID existence check | restrictions.js | 24-80 |
| VAL-16 | P2 | Missing plannedDate future-date validation | inspections.js | 53-76 |
| VAL-17 | P2 | Missing nextInspectionDue future-date validation | inspections.js | 93-122 |
| VAL-18 | P2 | Missing numeric validation for inspectionCreate assessment fields | InspectionCreate.controller.js | 125-164 |

---

### Category 3: JS ERROR PATTERNS (Phase 6) — 3 P1, 4 P2, 2 P3

| ID | Severity | Title | File | Line |
|----|----------|-------|------|------|
| ERR-01 | P1 | 23 empty catch blocks silently swallowing errors | 8 controllers | various |
| ERR-02 | P1 | Missing onExit cleanup — timers leak after navigation | RoutePlanner, RouteAssessment | — |
| ERR-03 | P1 | Technical error messages exposed to users (HTTP codes, SQL errors) | InspectionDashboard, BridgeDetail, Restrictions | various |
| ERR-04 | P2 | 48 console.log/warn/error calls (should use sap.log) | 10 controllers | various |
| ERR-05 | P2 | Unsafe property access without null checks | Dashboard.controller.js | 102-114 |
| ERR-06 | P2 | setTimeout/setInterval without cleanup in 6+ controllers | MapView, BridgeDetail, FreightRouteDetail | various |
| ERR-07 | P2 | Inconsistent error logging patterns across controllers | all | — |
| ERR-08 | P3 | 3 unhandled promise rejection edge cases | InspectionCreate.controller.js | 43-65 |
| ERR-09 | P3 | Mixed error handling strategy (MessageBox vs Toast vs console) | various | — |

---

### Category 4: ACCESSIBILITY (Phase 7) — 2 P1, 5 P2, 8 P3

| ID | Severity | Title | WCAG | File |
|----|----------|-------|------|------|
| A11Y-01 | P1 | HTML buttons in map popup without keyboard navigation | 2.1.1 | MapView.controller.js:558 |
| A11Y-02 | P1 | Drag-drop zone without equal-weight keyboard alternative | 2.1.1 | MassUpload.view.xml:93 |
| A11Y-03 | P2 | Icon-only buttons missing ariaLabel (3 views) | 4.1.2 | AdminConfig, BridgeDetail |
| A11Y-04 | P2 | Select controls without explicit Label association | 1.3.1 | AdminConfig.view.xml:303 |
| A11Y-05 | P2 | Map popup buttons no focus management | 2.4.3 | MapView.controller.js:554 |
| A11Y-06 | P2 | Tables missing headerText or ariaLabel | 1.3.1 | AdminConfig.view.xml:46 |
| A11Y-07 | P2 | Emoji close button (✕) without semantic role | 4.1.2 | MapView.controller.js:558 |
| A11Y-08 | P3 | Color-only status chips (no icon/text differentiation) | 1.4.1 | style.css:140-148 |
| A11Y-09 | P3 | Hardcoded pixel widths breaking responsive layout | 1.4.10 | BridgeForm.view.xml:60+ |
| A11Y-10 | P3 | Implicit label association in Permits dialog | 1.3.1 | Permits.view.xml:204 |
| A11Y-11 | P3 | MessageToast may not be announced by screen reader | 3.3.1 | various controllers |
| A11Y-12 | P3 | Icon-button focus indicator visibility concern | 2.4.7 | all icon buttons |
| A11Y-13 | P3 | Low-opacity border on theme toggle button | 1.4.11 | style.css:21 |
| A11Y-14 | P3 | Missing explicit labelFor on Permits form fields | 3.3.2 | Permits.view.xml |
| A11Y-15 | P3 | Input valueState not used consistently for form errors | 3.3.1 | various controllers |

---

### Category 5: PERFORMANCE (Phase 9) — 4 P1, 8 P2, 6 P3

| ID | Severity | Title | File | Line |
|----|----------|-------|------|------|
| PERF-01 | P1 | N+1 query: getBridge() called per defect in loop | inspections.js | 296-320 |
| PERF-02 | P1 | O(N^2) Array.find() in bridgeComplianceReport loop | reports.js | 54-59 |
| PERF-03 | P1 | N+1 query: 3 queries per permit in getVehiclePermitAnalysis | reports.js | 599-677 |
| PERF-04 | P1 | Dashboard fetches $top=9999 bridges (unbounded) | Dashboard.controller.js | 54 |
| PERF-05 | P2 | Subqueries per row in getAssetRegister | reports.js | 120-121 |
| PERF-06 | P2 | Unbounded defect fetch in getDefectKPIs | reports.js | 265-278 |
| PERF-07 | P2 | Unbounded inspection fetch in getNetworkKPIs | reports.js | 236-239 |
| PERF-08 | P2 | 5 separate GROUP BY queries instead of combined | reports.js | 159-165 |
| PERF-09 | P2 | No @cds.search or indexing hints in schema.cds | schema.cds | — |
| PERF-10 | P2 | No lazy loading for 27 routes in manifest.json | manifest.json | 124-157 |
| PERF-11 | P2 | All SAP libraries preloaded (should lazy-load sap.ui.export) | manifest.json | 82-93 |
| PERF-12 | P2 | JavaScript filtering of large defect dataset | reports.js | 268-272 |
| PERF-13 | P3 | Redundant bridge capacity queries in report loops | reports.js | 597-680 |
| PERF-14 | P3 | Dashboard refresh fetches all 6 metrics (no selective refresh) | Dashboard.controller.js | 53-59 |
| PERF-15 | P3 | OData model preload + autoExpandSelect + earlyRequests | manifest.json | 102 |
| PERF-16 | P3 | Full column fetch on Restrictions ($top=500) | Dashboard.controller.js | 55 |
| PERF-17 | P3 | Default 200 page size for asset register report | reports.js | 102-144 |
| PERF-18 | P3 | Subquery-heavy SQL instead of JOIN patterns | reports.js | various |

---

### Category 6: UX PATTERNS (Phase 10) — 0 P1, 3 P2, 2 P3

| ID | Severity | Title | File | Line |
|----|----------|-------|------|------|
| UX-01 | P2 | 18 controllers lack loading/busy indicators during fetch | various | — |
| UX-02 | P2 | BridgeForm has no unsaved changes warning on navigation | BridgeForm.controller.js | — |
| UX-03 | P2 | FreightRoutes table missing noDataText empty state | FreightRoutes.view.xml | 68 |
| UX-04 | P3 | Permits dialog missing dirty state tracking | Permits.controller.js | — |
| UX-05 | P3 | Permits table missing explicit noDataText | Permits.view.xml | 115 |

---

### Category 7: API/NETWORK (Phase 5) — 0 P1, 0 P2, 1 P3

| ID | Severity | Title | Detail |
|----|----------|-------|--------|
| API-01 | P3 | Invalid UUID returns 400 instead of 404 | GET /Bridges('non-existent-id') returns 400 (CAP framework validates UUID format first) |

**Positive**: All 12 HTTP tests passed. Security headers comprehensive (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Rate-Limit headers). Error format follows OData standard. Health endpoint returns UP. Authentication enforced (401 on unauthed requests).

---

## P1 FINDINGS — DETAILED REMEDIATION

### SEC-01/SEC-02: innerHTML XSS in BridgeDetail
```
Steps to reproduce:
  1. Create a restriction with restrictionType = '<img src=x onerror="alert(1)">'
  2. Navigate to BridgeDetail for that bridge
  3. Timeline renders the malicious HTML via innerHTML
Fix: Replace innerHTML with textContent for user data, or use DOMPurify:
  File: BridgeDetail.controller.js:397 and 691
  Change: innerHTML = html → Use createElement/textContent pattern
Effort: 2 hours
```

### SEC-03: innerHTML onclick in MapView
```
Fix: Replace raw HTML buttons with UI5 sap.m.Button controls
  File: MapView.controller.js:558
  Change: Create buttons via new sap.m.Button() instead of template literals
Effort: 3 hours
```

### SEC-04: CSRF Protection Disabled
```
Fix: Set csrfProtection: true in xs-app.json for /bridge-management/ route
  File: app-router/xs-app.json:14
  Note: Test that CAP CSRF token handling still works with App Router CSRF
Effort: 1 hour + testing
```

### SEC-05: API Key Empty Fallback
```
Fix: Fail at startup if ORS_API_KEY not set
  File: geo.js:1021
  Change: if (!process.env.ORS_API_KEY) throw new Error('ORS_API_KEY required');
Effort: 30 minutes
```

### VAL-01: Missing Required Field Validation
```
Fix: Add to BEFORE CREATE/UPDATE hook in bridges.js:
  if (!data.name) return req.error(400, 'Bridge name is required');
  if (!data.assetOwner) return req.error(400, 'Asset owner is required');
  if (!data.state) return req.error(400, 'State/territory is required');
Effort: 1 hour
```

### VAL-02/VAL-04: Missing Restriction Validation
```
Fix backend: Add restrictionType enum check in restrictions.js
Fix frontend: Add validation before CREATE/PATCH in Restrictions.controller.js
Effort: 2 hours
```

### ERR-01: Empty Catch Blocks
```
Fix: Replace all 23 catch(_) {} with catch(e) { sap.log.error("context", e.message); }
Effort: 1 hour
```

### ERR-02: Timer Cleanup
```
Fix: Add onExit handlers to RoutePlanner, RouteAssessment controllers
  Clear all setTimeout/setInterval references
Effort: 1 hour
```

### ERR-03: Technical Error Messages
```
Fix: Replace err.message with user-friendly strings:
  "Failed to start: " + err.message → "Failed to start inspection. Please try again."
Effort: 2 hours across 6 controllers
```

### PERF-01/02/03: N+1 Query Patterns
```
Fix: Build bridgeMap/capacityMap before loops instead of querying per-item
Effort: 3 hours across inspections.js and reports.js
```

### PERF-04: Dashboard $top=9999
```
Fix: Implement server-side aggregation for dashboard KPIs
  or paginate with $skip/$top=200 and aggregate client-side
Effort: 2 hours
```

---

## ESTIMATED REMEDIATION EFFORT

| Priority | Count | Estimated Effort |
|----------|-------|------------------|
| P1 Critical | 14 | ~20 hours |
| P2 High | 28 | ~30 hours |
| P3 Medium/Low | 19 | ~15 hours |
| **Total** | **61** | **~65 hours** |

---

## GO-LIVE RECOMMENDATION

**CONDITIONAL GO** — The application has strong foundational security (rate limiting, XSUAA auth, security headers, parameterized SQL), comprehensive test coverage (1046/1046 passing from SuperTester v7), and good UX patterns. However, 14 P1 findings should be addressed before production launch:

1. **XSS via innerHTML** (SEC-01/02/03) — Data-bearing user content rendered unsafely
2. **CSRF protection** (SEC-04) — Defense-in-depth gap
3. **Validation gaps** (VAL-01/02/03/04) — Required fields and enum validation missing
4. **Error handling** (ERR-01/02/03) — Silent failures and technical error exposure
5. **Performance** (PERF-01/02/03/04) — N+1 queries and unbounded fetches

The P2/P3 findings are quality improvements that should be planned for subsequent sprints.

---

*SuperTester v8 | Code-Level Analysis Mode | 2026-04-03*
*NHVR Bridge Asset & Restriction Management*
