# TEST DEBT REGISTER

**Project**: NHVR Bridge Asset & Restriction Management
**Date**: 2026-04-03
**Test Files Scanned**: 19 test files across test/, test/unit/, test/integration/, test/security/, test/supertester-v2/
**Total Test Cases**: ~1,000 (describe/it/test blocks)

---

## 1. Weak Assertions (expect(true).toBe(true) and Overly Broad Patterns)

These assertions pass unconditionally or accept any truthy value, providing no meaningful validation.

### 1.1 Unconditional Pass (expect(true).toBe(true))

| File | Line | Context |
|------|------|---------|
| test/group-isolation.test.js | 16 | `expect(true).toBe(true)` — Structural test placeholder |
| test/security/sast-scan.test.js | 344 | `expect(true).toBe(true)` — After audit ran (no assertion on result) |
| test/security/sast-scan.test.js | 347 | `expect(true).toBe(true)` — Catch block with no failure check |
| test/security/sast-scan.test.js | 368 | `expect(true).toBe(true)` — Entire test body is a pass |
| test/permit-report.test.js | 96 | `expect(true).toBe(true)` — Catch block accepts any error |
| test/supertester-v2/st-integration.test.js | 1008 | `expect(true).toBe(true)` — Placeholder assertion |

### 1.2 Inverted Logic (expect(true).toBe(false) as Failure Marker)

These are intended to force failure if reached, but should use `fail()` or `throw` instead.

| File | Line | Context |
|------|------|---------|
| test/concurrency-edge.test.js | 152 | `expect(true).toBe(false)` — Should have thrown |
| test/concurrency-edge.test.js | 170 | `expect(true).toBe(false)` — Should have thrown |
| test/group-isolation.test.js | 145 | `expect(true).toBe(false)` — Should not reach |
| test/permit-report.test.js | 197 | `expect(true).toBe(false)` — Expected error path |
| test/permit-report.test.js | 257 | `expect(true).toBe(false)` — Expected error path |

### 1.3 Overly Broad .toBeTruthy() Assertions

These accept any non-null/non-undefined value without verifying correctness. 65+ instances across the suite.

**Highest-density files:**
- `test/security/api-security.test.js` — 23 instances of `expect(err.code || err.status).toBeTruthy()`
- `test/data-consistency.test.js` — 10 instances checking attribute fields
- `test/supertester-v2/st-integration.test.js` — 18 instances checking `.ID` and field presence
- `test/analytics.test.js` — 8 instances on error and field checks

**Recommendation**: Replace `.toBeTruthy()` with specific matchers — e.g., `expect(err.code).toBe(403)`, `toBeGreaterThan(0)`, or `toEqual(expect.any(String))`.

---

## 2. Hardcoded Waits (setTimeout in Tests)

Hardcoded waits create flaky tests and slow execution. Use polling, event-driven waits, or mock timers.

| File | Line | Wait Duration | Context |
|------|------|---------------|---------|
| test/analytics.test.js | 274 | 500ms | Wait between session events |
| test/analytics.test.js | 294 | 500ms | Wait between session events |
| test/analytics.test.js | 312 | 500ms | Wait between session events |
| test/analytics.test.js | 332 | 500ms | Wait between session events |
| test/analytics.test.js | 364 | 500ms | Wait between session events |
| test/bridge-service.test.js | 559 | 200ms | Wait after bridge operation |
| test/bridge-service.test.js | 582 | 200ms | Wait after bridge operation |
| test/integration/data-quality-fields.test.js | 626 | 50ms | Wait for timestamp propagation |

**Total hardcoded waits**: 8 instances across 3 test files
**Cumulative wait time per run**: ~2,750ms minimum

**Recommendation**: Replace `await new Promise(r => setTimeout(r, N))` with deterministic assertions (retry/poll pattern or `jest.useFakeTimers()`).

---

## 3. Test Coverage Gaps

### 3.1 Service Entities with ZERO Test Coverage

The following CDS entity projections have no dedicated test cases in any test file:

| Entity | Gap Type |
|--------|----------|
| BridgeExternalRefs | No CRUD tests |
| RestrictionChangeLogs | No read tests |
| BridgeEventLog | No read tests |
| EntityAttributes | No CRUD tests |
| AttributeValidValues | No CRUD tests |
| RestrictionTypeConfigs | No CRUD tests |
| VehicleAccess (view) | No read/query tests |
| RouteCompliance (view) | No read/query tests |
| ActiveRestrictions (view) | No read/query tests |
| BridgeCapacities | No CRUD tests |
| LoadRatings | No CRUD tests |
| VehicleTypes | No CRUD tests |
| VehiclePermits | No CRUD tests |
| ApprovedRoutes | No CRUD tests |
| RouteBridges | No CRUD tests |
| BridgeRiskAssessments | No CRUD tests |
| BridgeInvestmentPlans | No CRUD tests |
| BridgeCulvertAssessments | No CRUD tests |
| BridgeInspectionMetrics | No CRUD tests |
| BridgeChangeLogs | No read tests |
| MapConfigs | No CRUD tests |
| BamsSyncs | No CRUD tests |
| FreightRoutes | No CRUD tests |
| FreightRouteBridges | No CRUD tests |
| GazetteValidations | No CRUD tests |
| GazetteNotices | No read tests |
| JurisdictionAccesses | No CRUD tests |
| SensorDevices | No CRUD tests |
| SensorReadings | No CRUD tests |
| DefectClassifications | No CRUD tests |
| BridgeDeteriorationProfiles | No read tests |
| DocumentAttachments | No CRUD tests |
| IntegrationConfigs | No CRUD tests |
| IntegrationLogs | No read tests |
| S4EquipmentMappings | No CRUD tests |
| LoadRatingCertificates | No CRUD tests |
| BridgeInspections | No CRUD tests |
| BridgeRouteAssignments | No CRUD tests |
| Tenants | No CRUD tests |
| TenantFeatures | No CRUD tests |
| TenantRoleCapabilities | No CRUD tests |
| FeatureCatalog | No read tests |
| AssessmentThresholds | No CRUD tests |
| KPIThresholds | No CRUD tests |
| MapProviderConfigs | No CRUD tests |
| ReportSchedules | No CRUD tests |
| DataQualityScores | No CRUD tests |
| Notifications | No CRUD tests |
| NotificationRules | No CRUD tests |
| RoutingEngineConfigs | No CRUD tests |
| RestrictionFeedSources | No CRUD tests |
| WorkOrders | No CRUD tests |
| ScourAssessments | No CRUD tests |

### 3.2 Service Actions/Functions with ZERO Test Coverage

| Action/Function | Category |
|----------------|----------|
| massUploadRoutes | Upload action |
| massUploadVehicleClasses | Upload action |
| massUploadInspectionOrders | Upload action |
| massUploadBridgeDefects | Upload action |
| massUploadLookups | Upload action |
| getMapApiConfig | Function |
| massDownloadBridges | Export action |
| validateRestriction | Validation action |
| bridgeComplianceReport | Report function |
| getConditionTrend | Dashboard function |
| addExternalRef | Entity action |
| expireRestrictions | Maintenance action |
| getBridgesExceedingCapacity | Report function |
| getNonCompliantBridgesOnRoutes | Report function |
| getOverdueCapacityReviews | Report function |
| getActivePermitsForBridge | Report function |
| assessRestriction | Assessment action |
| getAssetRegister | Analytics function |
| getAssetSummary | Analytics function |
| getConditionDistribution | Analytics function |
| getRestrictionSummary | Analytics function |
| getInspectionStatusReport | Analytics function |
| saveRoleConfig | Config action |
| importBridgesBatch | Batch import action |
| importRestrictionsBatch | Batch import action |
| syncWithBams | Integration action |
| assessCorridor | Assessment action |
| assessFreightRouteVehicle | Assessment action |
| findAlternativeRoutes | Routing action |
| assessRouteGeometry | Assessment action |
| validateRoute | Validation action |
| createWorkOrder | Work order action |
| assessScourRisk | Assessment action |
| validateGazette | Validation action |
| predictCondition | Forecast function |
| grantJurisdictionAccess | Admin action |
| revokeJurisdictionAccess | Admin action |
| ingestSensorReading | IoT action |
| classifyDefect | AI action |
| computeDeteriorationProfile | Analytics action |
| getMaintenancePriorityList | Analytics function |
| getNetworkKPIs | Dashboard function |
| getInspectionComplianceKPIs | Dashboard function |
| getDefectKPIs | Dashboard function |
| getRestrictionKPIs | Dashboard function |
| getTrendData | Dashboard function |
| getIntegrationStatus | Integration function |
| syncBridgeToS4 | Integration action |
| syncBridgeFromS4 | Integration action |
| syncAllBridgesToS4 | Integration action |
| createS4MaintenanceNotification | Integration action |
| createS4MaintenanceOrder | Integration action |
| exportToBANC | Integration action |
| validateBancRecord | Integration action |
| syncBridgeToESRI | Integration action |
| syncAllBridgesToESRI | Integration action |
| testIntegrationConnection | Integration action |
| healthCheck | Health action |
| getCapabilityProfile | Tenant function |
| assignTenantCapabilities | Tenant action |
| executeScheduledReport | Report action |
| calculateDataQuality (single) | DQ action |
| calculateAllDataQuality | DQ action |
| generateNotifications | Notification action |
| getMyNotifications | Notification function |
| markNotificationRead | Notification action |
| dismissNotification | Notification action |
| calculateRoute | Routing action |
| pollRestrictionFeed | Feed action |
| proxyRoute | Proxy action |
| geocodeAddress | Proxy action |
| reverseGeocode | Proxy action |

---

## 4. Flaky Test Patterns (Time-Dependent Assertions)

### 4.1 Date.now() in Test Data Generation

Tests that embed `Date.now()` in bridge IDs or order numbers create non-deterministic test data. If tests run near midnight or within the same millisecond, collisions or ordering issues arise.

| File | Line | Pattern |
|------|------|---------|
| test/bridge-service.test.js | 75 | `BRG-${Date.now().toString().slice(-8)}` |
| test/bridge-service.test.js | 604 | `INS-TEST-${Date.now()}` |
| test/phase9-time-fields.test.js | 283-404 | 11 bridge IDs with `Date.now()` suffix |
| test/phase11-full-qa.test.js | 268-337 | 4 order numbers with `Date.now()` |

### 4.2 Today/Tomorrow Date Comparisons

Tests using `new Date()` for boundary checks can fail at midnight, across DST transitions, or in different timezones.

| File | Line | Pattern |
|------|------|---------|
| test/bridge-service.test.js | 507-508 | `today` and `future` date computed at runtime |
| test/bridge-service.test.js | 597 | `today` computed for inspection order |
| test/phase9-time-fields.test.js | 64-66 | `today()`, `daysAgo(n)`, `daysFwd(n)` helpers |

### 4.3 Hardcoded setTimeout as Timing Gate

See Section 2 above. These are inherently flaky under CI load or slow machines.

---

## 5. Recommendations

### Priority 1 (High Impact, Low Effort)
1. **Replace `expect(true).toBe(true)`** with actual assertions or remove dead test blocks (6 instances)
2. **Replace `expect(true).toBe(false)`** with `throw new Error('...')` or Jest `fail()` (5 instances)
3. **Replace `.toBeTruthy()` on error codes** with `expect(err.code).toBe(401)` or `expect(err.code).toBe(403)` (23 instances in api-security.test.js alone)

### Priority 2 (Medium Impact, Medium Effort)
4. **Eliminate hardcoded waits** — Replace 8 `setTimeout` calls with deterministic patterns
5. **Add coverage for reporting views** — VehicleAccess, RouteCompliance, ActiveRestrictions are read-only projections that need query validation
6. **Add coverage for mass upload actions** — 7 upload actions with zero tests

### Priority 3 (High Impact, High Effort)
7. **Build integration tests for all 50+ entity projections** — Only 5 of 82 entities have dedicated tests
8. **Build action tests** — 70+ actions/functions lack any test coverage
9. **Add contract tests for integration layer** — S/4HANA, BANC, ESRI sync actions are all untested
10. **Implement mutation testing** — Current `.toBeTruthy()` patterns would survive most mutations

### Metrics Summary
| Metric | Value |
|--------|-------|
| Total test files | 19 |
| Approximate test cases | ~1,000 |
| Weak assertions (unconditional pass) | 6 |
| Inverted logic patterns | 5 |
| Overly broad .toBeTruthy() | 65+ |
| Hardcoded waits | 8 |
| Entities with zero coverage | 51 of 82 (62%) |
| Actions with zero coverage | 70 of 89 (79%) |
| Estimated debt resolution effort | 40-60 hours |
