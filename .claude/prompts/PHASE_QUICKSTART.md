# Phase Quick-Start — Copy-Paste Templates

## How to Use
1. Start a **fresh Claude Code session** per phase
2. Copy the template for your target phase below
3. Paste it as your first message
4. Claude will read only the relevant section, preserving tokens

---

## Phase 1.1 — CSRF + Auth Hardening
```
Implement NHVR Phase 1.1 — CSRF + Auth Hardening.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY the "EXECUTION PROTOCOL" section and "Phase 1.1" section.
Read CLAUDE.md for project rules.
Read `.nhvr-implementation-tracker.json` for current status.

Key deliverables:
1. Create util/AuthFetch.js with CSRF token management
2. Replace raw fetch() in all 14 controllers with authFetch()
3. Fix CapabilityManager fail-open vulnerability
4. Remove localStorage jurisdiction override from RoleManager
5. Tighten xs-security.json (token validity, redirect URIs)

Rules: Read before edit. Mirror sync. npm test must pass. Commit as "feat(phase-1.1): CSRF token + auth hardening".
```

## Phase 1.2 — Input Sanitization
```
Implement NHVR Phase 1.2 — Input Sanitization.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 1.2".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.

Key deliverables:
1. CSV formula sanitization in CsvExport.js and AlvToolbarMixin.js
2. Replace SQL string concatenation in reports.js with CDS query builder
3. Fix OData filter injection in VehicleCombinations.controller.js
4. XSS escaping in MassUpload error display
5. File upload validation (size, MIME, headers)

Rules: Read before edit. Mirror sync. npm test must pass. Commit as "feat(phase-1.2): input sanitization".
```

## Phase 1.3 — Schema Integrity
```
Implement NHVR Phase 1.3 — Schema Integrity Hardening.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 1.3".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.

Key deliverables:
1. Add CDS enum types (BridgeCondition, PostingStatus, AustralianState, etc.)
2. Add version field to Bridge, Restriction, VehiclePermit
3. Add soft-delete (deletedAt, isDeleted) to Bridge, Restriction
4. Add @mandatory to child entity FKs
5. Add @assert.unique to Route.routeCode, VehicleType.code, etc.
6. Update service.cds projections for new fields
7. Verify CSV seed data still loads

Rules: Read before edit. `npx cds build --production` must succeed. npm test must pass. Commit as "feat(phase-1.3): schema integrity hardening".
```

## Phase 1.4 — Backend Auth Gaps
```
Implement NHVR Phase 1.4 — Backend Authorization Gaps.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 1.4".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.

Key deliverables:
1. Add @requires annotations for all 8 unprotected geo/assessment actions
2. Add role check to addRestriction in bridges.js
3. Add role checks to 4 inspection handlers
4. Add input validation to ingestSensorReading

Rules: Read before edit. Mirror sync. npm test must pass. Commit as "feat(phase-1.4): backend auth gap closure".
```

## Phase 3.1 — Map Provider Abstraction
```
Implement NHVR Phase 3.1 — Map Provider Abstraction Layer.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 3.1".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.

Key deliverables:
1. Create util/MapProviderFactory.js (factory pattern)
2. Create util/providers/MapProviderInterface.js (abstract interface)
3. Create util/providers/LeafletProvider.js (extract from MapView, RouteAssessment, FreightRouteDetail)
4. Create util/providers/MapLibreProvider.js (extract from RoutePlanner)
5. All 4 map views work unchanged through the factory

CRITICAL: Do NOT break existing map functionality. Extract existing code into providers, then wire views through factory.

Rules: Read before edit. Mirror sync. npm test must pass. Commit as "feat(phase-3.1): map provider abstraction layer".
```

## Phase 3.2 — Google Maps + Esri Integration
```
Implement NHVR Phase 3.2 — Google Maps + Esri ArcGIS Integration.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 3.2".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.
Phase 3.1 must be complete first.

Key deliverables:
1. Create util/providers/GoogleMapsProvider.js (dynamic API load, all interface methods)
2. Create util/providers/EsriProvider.js (ArcGIS JS SDK 4.x, all interface methods)
3. API key management via backend action (NOT localStorage)
4. Fallback chain: Google → Esri → OSM Leaflet
5. All 4 map views can use any provider

Rules: Read before edit. Mirror sync. npm test must pass. Commit as "feat(phase-3.2): Google Maps + Esri integration".
```

## Phase 7.1 — CI/CD Hardening
```
Implement NHVR Phase 7.1 — CI/CD Hardening.

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY "EXECUTION PROTOCOL" + "Phase 7.1".
Read CLAUDE.md. Read `.nhvr-implementation-tracker.json`.

Key deliverables:
1. Remove continue-on-error: true from test job
2. Remove continue-on-error: true from CodeQL job
3. Add deployment gate requiring test success
4. Add rollback step on health check failure
5. Pin Node to 20.11.0

Rules: Read before edit. Commit as "feat(phase-7.1): CI/CD hardening — tests block deploy".
```

---

## Recommended Execution Order (parallel tracks)

### Track A (Security-first — start here)
```
1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 2.4
```

### Track B (Mapping — can run parallel with Track A)
```
3.1 → 3.2 → 3.3 → 3.4
```

### Track C (After Track A completes)
```
4.1 → 4.2 → 4.3 → 4.4
5.1 → 5.2 → 5.3 → 5.4
```

### Track D (After Track C completes)
```
6.1 → 6.2 → 6.3 → 6.4
7.1 → 7.2 → 7.3 → 7.4 (7.1 can start immediately)
8.1 → 8.2 → 8.3 → 8.4
```
