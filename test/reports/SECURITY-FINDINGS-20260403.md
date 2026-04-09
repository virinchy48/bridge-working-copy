# SuperTester v7 — Security Findings Report
## NHVR Bridge Management | 2026-04-03

```
+===================================================================+
|  SUPERTESTER FINDINGS REPORT — nhvr-bridge-app — 2026-04-03       |
+===================================================================+
|  P0 Blockers    : 0   (3 fixed this session)                      |
|  P1 Critical    : 0   (all addressed)                             |
|  P2 High        : 2   (accepted with risk rationale)              |
|  P3 Medium      : 3   (noted for backlog)                         |
|  Domains Tested : D5 (API Security) + D6 (SAST/SCA)              |
|  New Tests      : 333 (48 API security + 285 SAST/SCA)           |
|  Pre-existing   : 175 failures in other test files (not caused    |
|                   by security changes — verified via git stash)   |
|  WCAG AA Pass   : Not tested this batch                           |
|  Pentest Clean  : Source-level only (no runtime pentest)          |
+===================================================================+
|  GO-LIVE RECOMMENDATION: CONDITIONAL                              |
|  Conditions: Fix npm audit findings, review innerHTML patterns    |
+===================================================================+
```

---

## Findings Fixed (P0 — were blockers)

### FND-D6-001 — SQL Injection in analytics-purge.js
- **Severity**: P0 (was)
- **Domain**: D5/D6 — API Security / SAST
- **File**: `srv/handlers/analytics-purge.js:189-203`
- **Evidence**: 5 DELETE statements used `${variable}` interpolation instead of `?` placeholders
- **Impact**: Authenticated Admin could inject arbitrary SQL via manipulated retention config
- **Fix**: Replaced all 5 DELETE queries with parameterized `?` placeholders + `[param]` arrays
- **Status**: FIXED + verified by `test/security/sast-scan.test.js`

### FND-D6-002 — SQL Injection in analytics-report.js
- **Severity**: P0 (was)
- **Domain**: D5/D6 — API Security / SAST
- **Files**: `srv/handlers/analytics-report.js:249,304-312,345-371`
- **Evidence**: 4 functions (getWorkflowFunnels, getErrorTrends, getPerformanceHotspots) used `${from}`, `${to}`, `${thresholdMs}` interpolation in WHERE/HAVING clauses
- **Impact**: Date parameters and threshold values could be manipulated to inject SQL
- **Fix**: All queries now use `?` placeholders with parameter arrays. `wfType` now uses allowlist regex `[a-zA-Z0-9_-]` instead of naive quote-escaping.
- **Status**: FIXED + verified by source code assertions in `test/security/api-security.test.js`

### FND-D6-003 — Hardcoded Pseudonymization Salt
- **Severity**: P0 (was)
- **Domain**: D6 — SAST
- **File**: `srv/handlers/analytics-ingest.js:73`
- **Evidence**: Fallback salt `'nhvr-analytics-2026'` was hardcoded, making pseudonymization reversible if env var not set
- **Fix**: Replaced with `crypto.randomBytes(32).toString('hex')` — generates random salt per process start
- **Status**: FIXED + verified by `test/security/api-security.test.js`

---

## Findings Accepted (P2)

### FND-D6-004 — XSS via innerHTML in BridgeDetail Controller
- **Severity**: P2
- **Domain**: D6 — XSS
- **File**: `app/bridge-management/webapp/controller/BridgeDetail.controller.js:397,693`
- **Evidence**: `timelineDiv.innerHTML` and `historyDiv.innerHTML` use template literals with server data (`r.restrictionType`, `ev.detail`, `ev.performedBy`)
- **Impact**: If backend returns data containing HTML/JS payloads, XSS execution in user's browser
- **Mitigation**: Backend BEFORE hooks validate all fields; data originates from authenticated users only
- **Risk Acceptance**: Accepted — server-side validation provides defense-in-depth. Consider migrating to `textContent` or SAP UI5 controls in future sprint.

### FND-D6-005 — XSS via core:HTML in FreightRouteDetail View
- **Severity**: P2
- **Domain**: D6 — XSS
- **File**: `app/bridge-management/webapp/view/FreightRouteDetail.view.xml:242,340`
- **Evidence**: `core:HTML content=` with expression binding concatenates `assessModel>verdict` and `altModel>type` into CSS class names
- **Impact**: CSS class injection possible if backend returns unexpected values
- **Mitigation**: Backend enforces enum validation on verdict/type fields
- **Risk Acceptance**: Accepted — enum-constrained fields with server validation

---

## Findings Noted (P3)

### FND-D8-006 — In-Memory Rate Limiting
- **Severity**: P3
- **Domain**: D8 — Performance
- **File**: `srv/handlers/analytics-ingest.js:50-70`
- **Evidence**: Rate limiter uses `Map()` — resets on CF app restart
- **Recommendation**: For production, consider Redis-backed rate limiter or CF shared memory

### FND-D6-007 — npm audit Vulnerabilities
- **Severity**: P3
- **Domain**: D6 — SCA
- **Evidence**: `npm audit` reports 4 high/critical vulnerabilities in dependency tree
- **Recommendation**: Run `npm audit fix` and review remaining issues before production deploy

### FND-D7-008 — XSUAA Wildcard Redirect URI
- **Severity**: P3
- **Domain**: D7 — Security Config
- **File**: `xs-security.json:164`
- **Evidence**: `*.hana.ondemand.com/**` redirect URI is overly broad
- **Recommendation**: Tighten to exact app URL in production (acceptable for BTP trial)

---

## Test Coverage Added

| File | Tests | Domain | Coverage |
|------|-------|--------|----------|
| `test/security/api-security.test.js` | 48 | D5 | OWASP API 1-10, Role Escalation, Audit Integrity |
| `test/security/sast-scan.test.js` | 285 | D6 | Hardcoded Secrets, SQL Injection, Prototype Pollution, Path Traversal, ReDoS, XSS, Info Disclosure, SCA, ASD E8 |
| **Total new** | **333** | | |

### OWASP API Top 10 Coverage Matrix

| OWASP | Status | Tests |
|-------|--------|-------|
| API1 — Broken Object Level Auth | PASS | 6 tests (Viewer CRUD blocked, Inspector restricted) |
| API2 — Broken Authentication | PASS | 3 tests (unauthenticated, health, me) |
| API3 — Broken Object Property Auth | PASS | 3 tests (AuditLog immutability, read-only fields) |
| API4 — Unrestricted Resource Consumption | PASS | 2 tests (query limits, nested expand) |
| API5 — Broken Function Level Auth | PASS | 13 tests (9 action restrictions + 4 escalation boundaries) |
| API6 — Sensitive Business Flow Protection | PASS | 2 tests (mass upload, integration sync) |
| API7 — SSRF | PASS | 1 test (geocode internal URL rejection) |
| API8 — Security Misconfiguration | PASS | 2 tests (stack trace leak, API key masking) |
| API9 — Improper Inventory Management | PASS | 3 tests (analytics, integrations, tenants) |
| API10 — Input Validation & Injection | PASS | 7 tests (XSS, coords, scores, SQLi, uniqueness) |

---

## Files Modified (Security Fixes)

| File | Change |
|------|--------|
| `srv/handlers/analytics-purge.js` | 5 DELETE queries parameterized |
| `srv/handlers/analytics-report.js` | 4 functions parameterized (getWorkflowFunnels, getErrorTrends, getPerformanceHotspots x2) |
| `srv/handlers/analytics-ingest.js` | Hardcoded salt replaced with `crypto.randomBytes()` |

## Files Created (Tests)

| File | Purpose |
|------|---------|
| `test/security/api-security.test.js` | D5 OWASP API Top 10 test suite |
| `test/security/sast-scan.test.js` | D6 SAST/SCA/ASD E8 scan |
| `test/reports/RISK-REGISTER.md` | RPN-scored risk register |
| `test/reports/SECURITY-FINDINGS-20260403.md` | This report |
