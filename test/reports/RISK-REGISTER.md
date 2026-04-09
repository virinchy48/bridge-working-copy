# NHVR Bridge Management — Risk Register
## SuperTester v7 | Security Assessment | 2026-04-03

RPN = Severity(1-10) x Likelihood(1-10) x Detection Difficulty(1-10)

| # | Risk Description | S | L | D | RPN | Domain | Status |
|---|-----------------|---|---|---|-----|--------|--------|
| 1 | SQL Injection in analytics-purge.js DELETE queries (string interpolation) | 9 | 7 | 6 | 378 | D5,D6 | **FIXED** |
| 2 | SQL Injection in analytics-report.js SELECT queries (4 functions) | 9 | 7 | 6 | 378 | D5,D6 | **FIXED** |
| 3 | Hardcoded analytics pseudonymization salt fallback | 7 | 8 | 5 | 280 | D6 | **FIXED** |
| 4 | XSS via innerHTML in BridgeDetail timeline rendering | 6 | 5 | 7 | 210 | D6 | ACCEPTED |
| 5 | XSS via core:HTML class injection in FreightRouteDetail | 5 | 4 | 7 | 140 | D6 | ACCEPTED |
| 6 | XSUAA scope escalation — 8 scopes x 89 actions matrix | 9 | 3 | 8 | 216 | D5 | TESTED |
| 7 | Multi-tenant data isolation — row-level filtering bypass | 9 | 3 | 8 | 216 | D5,D7 | TESTED |
| 8 | In-memory rate limiting resets on process restart | 5 | 6 | 4 | 120 | D8 | NOTED |
| 9 | External API SSRF via configurable routing engine URLs | 7 | 3 | 6 | 126 | D5,D7 | TESTED |
| 10 | CSV upload injection via crafted bridge/restriction data | 7 | 4 | 5 | 140 | D5 | TESTED |
| 11 | AuditLog immutability bypass (UPDATE/DELETE attempt) | 8 | 2 | 3 | 48 | D5 | TESTED |
| 12 | npm audit high/critical vulnerabilities (4 found) | 6 | 5 | 2 | 60 | D6 | NOTED |
| 13 | Token validity 3600s — acceptable for government app | 3 | 2 | 2 | 12 | D6 | PASS |
| 14 | XSUAA wildcard redirect URI in trial environment | 5 | 3 | 3 | 45 | D7 | NOTED |
| 15 | console.log absent from handlers (structured cds.log used) | 2 | 1 | 1 | 2 | D6 | PASS |

## Risk Acceptance Notes

### R4 — innerHTML in BridgeDetail (RPN 210)
- **Accepted because**: Data comes from server-side OData with CAP validation. Fields are type-constrained strings. No user-provided HTML reaches these templates without server-side processing.
- **Mitigation**: Backend BEFORE hooks validate all restriction/event fields.

### R5 — core:HTML in FreightRouteDetail (RPN 140)
- **Accepted because**: CSS class names are derived from backend enum values (verdict, type). Expression binding constrains output to known strings.
- **Mitigation**: Backend enforces enum validation on verdict/type fields.

### R8 — In-memory rate limiting (RPN 120)
- **Noted**: Rate limiting resets on CF app restart. For government-grade production, consider Redis-backed rate limiter.

### R12 — npm audit findings (RPN 60)
- **Noted**: 4 high/critical vulnerabilities reported by npm audit. Review and update affected packages before production deploy.
