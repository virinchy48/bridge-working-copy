# NHVR Bridge Management — Security Self-Assessment
## OWASP Top 10 (2021) Static Code Analysis

> **IMPORTANT NOTICE**
> This document is a **self-assessment** based on manual static code review and automated
> analysis of the application source code. It is NOT a substitute for a formal penetration
> test. A **CREST-accredited penetration test** must be completed before this system is
> deployed with real production data or exposed to the public internet.

---

| Field | Value |
|-------|-------|
| Application | NHVR Bridge Asset & Restriction Management |
| Version | 3.2.1 |
| Assessment Date | 2026-03-30 |
| Assessor | Internal development team (self-assessment) |
| Methodology | Manual static code analysis; pattern review against OWASP Top 10 2021 |
| Scope | Backend: `srv/service.js`, `server.js`; Frontend: UI5 controllers/views; Config: `xs-security.json`, `xs-app.json`, `mta.yaml` |
| Out of Scope | Network-layer controls (SAP BTP infrastructure), HANA Cloud internals, XSUAA IdP internals |
| Next Action | Commission CREST pen test before go-live with NHVR operational data |

---

## A01 — Broken Access Control

### Finding 1: XSUAA scope-based authorization on all OData endpoints
- **Evidence**: `xs-security.json` defines 7 scopes (Admin, BridgeManager, Viewer, Uploader, Executive, Inspector, Operator). CAP `@requires` annotations in `srv/services/*.cds` domain files enforce scope checks on every entity and action.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED — Role collections map to least-privilege scope sets. Inspector and Operator roles were added in v1.3 to prevent over-privileged field staff.

### Finding 2: `me` action — user info endpoint role access
- **Evidence**: Confirmed fixed in current codebase. The `/bridge-management/me` action is protected with `@requires: 'authenticated-user'` rather than open to unauthenticated requests.
- **Risk Level**: LOW (resolved)
- **Remediation Status**: FIXED

### Finding 3: IDOR risk on bridge UUID lookups
- **Evidence**: Bridge records are accessed by CUID (UUID v4). No sequential IDs that could be enumerated. CDS `@requires` annotations prevent cross-role data reads.
- **Risk Level**: LOW
- **Remediation Status**: MITIGATED — UUID keys and XSUAA scope checks combined.

### Finding 4: RoleConfig — client-side visibility vs server-side enforcement
- **Evidence**: `RoleManager.js` drives UI visibility from `RoleConfig` data fetched from the database. Server-side `@requires` annotations independently enforce access. If RoleConfig is misconfigured, the server-side scope check remains the authoritative gate.
- **Risk Level**: LOW — defence in depth present.
- **Remediation Status**: ACCEPTABLE — documented separation of UI hint vs. server enforcement.

---

## A02 — Cryptographic Failures

### Finding 1: Data in transit — HSTS enforced
- **Evidence**: `xs-app.json` sets `Strict-Transport-Security: max-age=31536000; includeSubDomains`. All App Router routes require XSUAA authentication (implying HTTPS-only SAP BTP endpoints).
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

### Finding 2: Data at rest — HANA Cloud encryption
- **Evidence**: SAP HANA Cloud (hdi-shared plan) encrypts data at rest by default using AES-256. This is infrastructure-managed and not configurable at the application layer.
- **Risk Level**: LOW
- **Remediation Status**: DELEGATED TO SAP BTP — confirm with SAP trust centre documentation.

### Finding 3: JWT token validity — 1 hour access token, 7-day refresh
- **Evidence**: `xs-security.json`: `"token-validity": 3600`, `"refresh-token-validity": 604800`.
- **Risk Level**: MEDIUM — 7-day refresh token is broad for a critical infrastructure application.
- **Remediation Status**: OPEN — recommend reducing refresh token to 24–48 hours for production. Access token at 1 hour is acceptable.

### Finding 4: AuditLog stores userId (email address) in plaintext
- **Evidence**: `db/schema/admin.cds`: `userId: String(100)` in `AuditLog`; `db/schema/inspection.cds`: `performedBy: String(100)` in `BridgeEventLog`; `db/schema/risk-investment.cds`: `changedBy: String(100)` in `BridgeConditionHistory`; `db/schema/restrictions.cds`: `changedBy` in `RestrictionChangeLog`.
- **Risk Level**: MEDIUM — Email addresses are personal data under Australian Privacy Act. Stored unencrypted in HANA Cloud (US-East region — see PIA for sovereignty issue).
- **Remediation Status**: OPEN — Documented in Privacy Impact Assessment. Pseudonymisation recommended for production.

---

## A03 — Injection

### Finding 1: Raw SQL usage in service.js — parameterised queries
- **Evidence**: `srv/service.js` uses raw SQL via CDS `db.run()` in `getBridge()`, `getBridgeByKey()`, `getRestriction()`, and similar helpers. All queries use `?` placeholder binding (e.g., `WHERE "ID" = ?`, `[resolvedId]`). No string concatenation into SQL.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED — parameterised binding prevents SQL injection.

### Finding 2: CSV upload — unvalidated column headers
- **Evidence**: `srv/service.js` lines 743–757: CSV headers are parsed via `lines[0].split(',').map(h => h.trim().replace(/"/g, ''))` and mapped to row objects. Column values are assigned to CDS entity fields. There is no allowlist validation of header names before field assignment.
- **Risk Level**: MEDIUM — A crafted CSV with header names matching internal CDS field names (e.g., `ID`, `createdBy`) could attempt to overwrite managed fields. CDS `managed` aspect should reject `createdBy`/`modifiedBy` overrides, but this is not explicitly tested.
- **Remediation Status**: OPEN — Recommend explicit allowlist of accepted CSV headers per upload type.

### Finding 3: OData V4 $filter injection
- **Evidence**: CAP framework handles `$filter` parsing. No custom `$filter` string construction found in service.js.
- **Risk Level**: LOW — CAP OData parser is maintained by SAP and handles injection defensively.
- **Remediation Status**: DELEGATED TO CAP FRAMEWORK

---

## A04 — Insecure Design

### Finding 1: No multi-tenancy isolation
- **Evidence**: `xs-security.json` uses `"tenant-mode": "dedicated"`. The application is single-tenant by design. All data belongs to one NHVR tenant. Tenant isolation is therefore not applicable but should be revisited if the application is commercialised as SaaS.
- **Risk Level**: N/A (single tenant)
- **Remediation Status**: DOCUMENTED

### Finding 2: Bulk CSV upload lacks file size or row count limit
- **Evidence**: The `importBridges`, `importRestrictions` actions in `srv/service.js` accept a raw `csvData` string parameter. No maximum file size or row count is enforced at the service layer.
- **Risk Level**: MEDIUM — A large CSV payload could cause memory pressure on the 512MB CAP backend instance.
- **Remediation Status**: OPEN — Recommend enforcing max 5 MB / 10,000 rows per upload.

---

## A05 — Security Misconfiguration

### Finding 1: CSP contains `unsafe-inline` and `unsafe-eval`
- **Evidence**: `xs-app.json` CSP header: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://ui5.sap.com ...`
- **Risk Level**: MEDIUM — `unsafe-inline` and `unsafe-eval` weaken XSS protection. Required by SAP UI5 1.x framework (UI5 generates inline scripts). SAP UI5 2.x removes this requirement.
- **Remediation Status**: ACCEPTED — Unavoidable with SAP UI5 1.120 framework. Documented as known gap. Mitigated partially by XSUAA authentication gate (unauthenticated users cannot reach the application to exploit XSS). Recommend evaluating SAP UI5 2.x upgrade path.

### Finding 2: CSRF protection disabled for OData route
- **Evidence**: `xs-app.json` line 14: `"csrfProtection": false` for `/bridge-management/*`.
- **Risk Level**: LOW (by design) — CAP OData V4 implements its own CSRF token mechanism (fetch-token pattern via `HEAD /bridge-management/` + `X-CSRF-Token: Fetch`). App Router CSRF would conflict with this pattern.
- **Remediation Status**: INTENTIONAL — Documented with inline comment in xs-app.json. CAP CSRF mechanism is active.

### Finding 3: XSUAA redirect URI uses exact production URL
- **Evidence**: `xs-security.json` `redirect-uris` lists the exact App Router URL. Previous versions used a wildcard `*.hana.ondemand.com/**`.
- **Risk Level**: LOW
- **Remediation Status**: IMPROVED in v1.3 — now uses precise URLs.

### Finding 4: Session timeout set to 15 minutes
- **Evidence**: `xs-app.json`: `"sessionTimeout": 15`.
- **Risk Level**: LOW — 15-minute idle session timeout is appropriate for a critical infrastructure application.
- **Remediation Status**: IMPLEMENTED

---

## A06 — Vulnerable and Outdated Components

### Finding 1: Dependency audit status
- **Evidence**: `package.json` pins SAP dependencies (`@sap/cds`, `@sap/approuter`, `@sap/xssec`). Node.js >= 20.0.0 required. GitHub Actions CI/CD runs with Node.js 24.
- **Risk Level**: MEDIUM — No automated `npm audit` step confirmed in `deploy-btp.yml`.
- **Remediation Status**: OPEN — Add `npm audit --audit-level=high` as a CI gate in `.github/workflows/deploy-btp.yml`. Schedule quarterly dependency review.

### Finding 2: Leaflet.js loaded from unpkg.com CDN
- **Evidence**: `xs-app.json` CSP allows `https://unpkg.com` for script-src. Leaflet and Leaflet.markercluster are loaded from unpkg.com (a public CDN).
- **Risk Level**: MEDIUM — CDN supply chain risk. If unpkg.com is compromised, malicious JS could be served.
- **Remediation Status**: OPEN — Bundle Leaflet locally or use Subresource Integrity (SRI) hashes.

---

## A07 — Identification and Authentication Failures

### Finding 1: Authentication delegated to SAP XSUAA
- **Evidence**: All routes in `xs-app.json` use `"authenticationType": "xsuaa"`. SAP XSUAA handles password policy, MFA configuration, and brute-force protection.
- **Risk Level**: LOW — Authentication is not custom-implemented; it is fully delegated to SAP's identity provider.
- **Remediation Status**: IMPLEMENTED

### Finding 2: Rate limiting on OData endpoints
- **Evidence**: `server.js` implements a sliding-window in-memory rate limiter: 200 requests per 60-second window per IP. Applied to all `/bridge-management/*` paths. Includes proper `Retry-After` and `X-RateLimit-*` response headers.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

### Finding 3: Rate limiter — IP spoofing via X-Forwarded-For
- **Evidence**: `server.js` line 18: rate limiter trusts the first value in `X-Forwarded-For`. With `app.set('trust proxy', 1)` (line 62), Express resolves `req.ip` from the first trusted proxy hop. Within SAP BTP/App Router this is the App Router's forwarded IP. If the App Router is bypassed directly, a client could forge `X-Forwarded-For`.
- **Risk Level**: LOW — The CAP backend is not directly internet-exposed; all traffic must pass through the App Router on BTP. Direct bypass is not possible in standard BTP deployment.
- **Remediation Status**: ACCEPTABLE — Architecture mitigates the risk. No public CAP backend URL should be advertised.

---

## A08 — Software and Data Integrity Failures

### Finding 1: No integrity check on CSV import data
- **Evidence**: `importBridges` action accepts raw CSV. No schema version header, checksum, or digital signature is required on uploaded files.
- **Risk Level**: LOW-MEDIUM — Insider threat vector; a malicious or malformed CSV upload by an `Uploader`-scoped user could corrupt bridge data at scale.
- **Remediation Status**: PARTIAL — `UploadLog` entity records all uploads (filename, status, error details). Audit trail exists. Recommend adding a dry-run/preview step before committing large imports.

### Finding 2: AuditLog is append-only (no delete action)
- **Evidence**: `AuditLog` entity in `db/schema/admin.cds` has no `isDeleted` field and no delete action exposed in `srv/services/admin.cds`.
- **Risk Level**: LOW — Immutable audit trail supports data integrity.
- **Remediation Status**: IMPLEMENTED

---

## A09 — Security Logging and Monitoring Failures

### Finding 1: Correlation ID on all requests
- **Evidence**: `srv/service.js` lines 16–23: `getCorrelationId()` reads `x-correlation-id`, `x-request-id`, or `x-vcap-request-id` from request headers, falling back to a generated ID. All service-level log lines include `[correlationId]`.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

### Finding 2: Error stack traces suppressed in production
- **Evidence**: `srv/service.js` line 47: `stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined`. Stack traces are omitted from logs in production environment.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

### Finding 3: SAP BTP Application Logging Service
- **Evidence**: `mta.yaml` binds `nhvr-logging` (Application Logging Service) to the CAP backend. Log streams are available via SAP BTP cockpit.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

### Finding 4: No alerting / SIEM integration
- **Evidence**: No webhook, SIEM connector, or alerting rule is configured for anomalous patterns (e.g., repeated 403s, mass-delete events, high 429 rate).
- **Risk Level**: MEDIUM — Without active monitoring, a low-and-slow attack or insider exfiltration may go undetected.
- **Remediation Status**: OPEN — Recommend configuring BTP log alerts or forwarding to a SIEM (e.g., Splunk, Microsoft Sentinel) before production deployment.

---

## A10 — Server-Side Request Forgery (SSRF)

### Finding 1: External HTTP calls from CAP backend
- **Evidence**: `server.js` line 10 hoists `const https = require('https')`. Review of `srv/service.js` shows outbound HTTP calls to route planning APIs (OpenRouteService, OSRM) via the `https` module. URLs are constructed from configuration, not from user-supplied input.
- **Risk Level**: LOW — URL destinations appear to be hardcoded configuration values, not user-controlled.
- **Remediation Status**: ACCEPTABLE — Confirm in formal review that no OData request parameter is ever interpolated into an outbound URL.

### Finding 2: CSP `connect-src` limits frontend outbound calls
- **Evidence**: CSP `connect-src` allows only: `'self'`, `https://api.openrouteservice.org`, `https://nominatim.openstreetmap.org`, `https://router.project-osrm.org`. This restricts browser-side SSRF-like cross-origin fetch to known external services.
- **Risk Level**: LOW
- **Remediation Status**: IMPLEMENTED

---

## Summary Risk Register

| # | Finding | Risk | Status |
|---|---------|------|--------|
| 1 | CSP unsafe-inline / unsafe-eval (UI5 framework requirement) | MEDIUM | Accepted (UI5 1.x constraint) |
| 2 | JWT refresh token validity — 7 days | MEDIUM | Open |
| 3 | User email addresses stored unencrypted in AuditLog/BridgeEventLog | MEDIUM | Open — see PIA |
| 4 | CSV upload — no header allowlist; no size/row limit | MEDIUM | Open |
| 5 | No automated npm audit in CI/CD pipeline | MEDIUM | Open |
| 6 | Leaflet loaded from unpkg.com CDN (no SRI) | MEDIUM | Open |
| 7 | No SIEM/alerting integration | MEDIUM | Open |
| 8 | CSRF disabled for OData route | LOW | Intentional (CAP pattern) |
| 9 | Rate limiter X-Forwarded-For trust | LOW | Acceptable (BTP architecture) |
| 10 | AuditLog is append-only | LOW | Implemented (positive control) |

---

## Recommended Actions Before Production Go-Live

1. Commission a CREST-accredited penetration test against the BTP-deployed application.
2. Reduce XSUAA refresh token validity to 24–48 hours.
3. Add `npm audit --audit-level=high` gate to `.github/workflows/deploy-btp.yml`.
4. Bundle Leaflet and Leaflet.markercluster locally; remove unpkg.com from CSP.
5. Implement CSV upload header allowlist and enforce 5 MB / 10,000 row cap.
6. Integrate BTP Application Logging with a SIEM or configure email alerts on error patterns.
7. Evaluate pseudonymisation of `userId`/`performedBy`/`changedBy` fields in AuditLog for HANA Cloud production.
8. Evaluate SAP UI5 2.x migration to eliminate `unsafe-inline` / `unsafe-eval` from CSP.

---

*Document prepared by: NHVR Bridge App Development Team*
*Review cycle: Quarterly, or after any significant code change*
*Next scheduled review: 2026-06-30*
