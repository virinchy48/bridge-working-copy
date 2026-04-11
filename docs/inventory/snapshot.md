# Project Inventory Snapshot

_Scan date: 2026-04-11 · branch: `claude/lookup-hardening-and-cleanup`_

## 1. TILES

| Tile ID | Title | Group | Semantic Object > Action | Route Target | File |
|---|---|---|---|---|---|
| NHVRBridgeManagement-manage | Bridge Management System (BMS) | — | NHVRBridgeManagement > manage | (implicit Home) | app/bridge-management/webapp/manifest.json |
| NHVRBridge-display | Bridge Detail | — | NHVRBridge > display | (param `bridgeId`; resolves to BridgeDetail) | app/bridge-management/webapp/manifest.json |
| NHVRDashboard-display | BMS Executive Dashboard | — | NHVRDashboard > display | (implicit Dashboard) | app/bridge-management/webapp/manifest.json |

**Flags**
- Inbound titles are hard-coded strings in manifest, **not** `{{i18n}}` keys — Fiori Launchpad language-switch will not translate.
- `{{appTitle}}` / `{{appDescription}}` i18n keys resolve OK (`i18n.properties`).
- Only 3 launchpad inbounds cover ~28 internal routes. No per-feature tile group.
- Routes with no inbound tile (25): `Reports, MassUpload, AdminConfig, DefectRegister, BridgeNew, BridgeEdit, VehicleCombinations, MassEdit, Permits, PermitDetail, RouteAssessment, FreightRoutes, FreightRouteDetail, integrationHub, InspectionCreate, InspectionCreateNew, RoutePlanner, AppAdmin, BmsTechAdmin, AnnualConditionReport, PermitRegisterReport, AnalyticsDashboard, MapView, BridgesList, RestrictionsList`.
- **Orphan controller/view**: `DataQuality.controller.js` + `DataQuality.view.xml` exist and attach to a `DataQuality` route that is **not defined** in `manifest.json` — runtime `oRouter.getRoute("DataQuality")` will return undefined.

---

## 2. FUNCTIONS & HANDLERS

### 2a. CAP actions / functions (service level, from `srv/services/*.cds`)

| Name | Type | Entity/Event | File | Line |
|---|---|---|---|---|
| me | CDS-function | — | srv/services/reporting.cds | 62 |
| getAppConfig | CDS-function | — | srv/services/reporting.cds | 69 |
| massUploadBridges | CDS-action | — | srv/services/reporting.cds | 77 |
| massUploadRestrictions | CDS-action | — | srv/services/reporting.cds | 87 |
| massUploadRoutes | CDS-action | — | srv/services/reporting.cds | 97 |
| massUploadVehicleClasses | CDS-action | — | srv/services/reporting.cds | 108 |
| massUploadBridgeDefects | CDS-action | — | srv/services/reporting.cds | 121 |
| massUploadLookups | CDS-action | — | srv/services/reporting.cds | 132 |
| getSystemInfo | CDS-function | — | srv/services/reporting.cds | 143 |
| getMapApiConfig | CDS-function | — | srv/services/reporting.cds | 152 |
| massDownloadBridges | CDS-action | — | srv/services/reporting.cds | 166 |
| validateRestriction | CDS-action | — | srv/services/reporting.cds | 176 |
| bridgeComplianceReport | CDS-function | — | srv/services/reporting.cds | 192 |
| getDashboardKPIs | CDS-function | — | srv/services/reporting.cds | 203 |
| getConditionTrend | CDS-function | — | srv/services/reporting.cds | 206 |
| raiseDefect | CDS-action | — | srv/services/reporting.cds | 212 |
| addExternalRef | CDS-action | — | srv/services/reporting.cds | 234 |
| expireRestrictions | CDS-action | — | srv/services/reporting.cds | 249 |
| getInspectionsDue | CDS-function | — | srv/services/reporting.cds | 254 |
| getOpenDefectsSummary | CDS-function | — | srv/services/reporting.cds | 265 |
| getAssetRegister | CDS-function | — | srv/services/reporting.cds | 279 |
| getAssetSummary | CDS-function | — | srv/services/reporting.cds | 326 |
| getConditionDistribution | CDS-function | — | srv/services/reporting.cds | 339 |
| getRestrictionSummary | CDS-function | — | srv/services/reporting.cds | 352 |
| getInspectionStatusReport | CDS-function | — | srv/services/reporting.cds | 377 |
| health | CDS-function | — | srv/services/reporting.cds | 463 |
| proxyRoute | CDS-action | — | srv/services/reporting.cds | 477 |
| geocodeAddress | CDS-action | — | srv/services/reporting.cds | 489 |
| reverseGeocode | CDS-action | — | srv/services/reporting.cds | 497 |
| predictCondition | CDS-function | — | srv/services/reporting.cds | 503 |
| getNetworkKPIs | CDS-function | — | srv/services/reporting.cds | 512 |
| getInspectionComplianceKPIs | CDS-function | — | srv/services/reporting.cds | 519 |
| getDefectKPIs | CDS-function | — | srv/services/reporting.cds | 525 |
| getRestrictionKPIs | CDS-function | — | srv/services/reporting.cds | 531 |
| getTrendData | CDS-function | — | srv/services/reporting.cds | 538 |
| ingestSensorReading | CDS-action | SensorReadings | srv/services/integration.cds | 22 |
| syncBridgeToS4 | CDS-action | — | srv/services/integration.cds | 80 |
| syncBridgeFromS4 | CDS-action | — | srv/services/integration.cds | 93 |
| syncAllBridgesToS4 | CDS-action | — | srv/services/integration.cds | 105 |
| createS4MaintenanceNotification | CDS-action | — | srv/services/integration.cds | 117 |
| exportToBANC | CDS-action | — | srv/services/integration.cds | 130 |
| validateBancRecord | CDS-action | — | srv/services/integration.cds | 144 |
| syncBridgeToESRI | CDS-action | — | srv/services/integration.cds | 155 |
| syncAllBridgesToESRI | CDS-action | — | srv/services/integration.cds | 165 |
| testIntegrationConnection | CDS-action | — | srv/services/integration.cds | 177 |
| getIntegrationStatus | CDS-function | — | srv/services/integration.cds | 194 |
| saveRoleConfig | CDS-action | — | srv/services/admin.cds | 62 |
| grantJurisdictionAccess | CDS-action | — | srv/services/admin.cds | 81 |
| revokeJurisdictionAccess | CDS-action | — | srv/services/admin.cds | 84 |
| executeScheduledReport | CDS-action | — | srv/services/admin.cds | 101 |
| calculateDataQuality | CDS-action | — | srv/services/admin.cds | 110 |
| calculateAllDataQuality | CDS-action | — | srv/services/admin.cds | 113 |
| assessVehicleOnBridge | CDS-action | — | srv/services/capacity-permits.cds | 109 |
| getBridgesExceedingCapacity | CDS-function | — | srv/services/capacity-permits.cds | 159 |
| getNonCompliantBridgesOnRoutes | CDS-function | — | srv/services/capacity-permits.cds | 173 |
| getOverdueCapacityReviews | CDS-function | — | srv/services/capacity-permits.cds | 187 |
| getActivePermitsForBridge | CDS-function | — | srv/services/capacity-permits.cds | 200 |
| assessRestriction | CDS-action | — | srv/services/capacity-permits.cds | 213 |
| healthCheck | CDS-action | — | srv/services/capacity-permits.cds | 245 |
| computeRiskScore | CDS-action | — | srv/services/risk-investment.cds | 60 |
| raiseDefectFromMeasurement | CDS-action | — | srv/services/risk-investment.cds | 70 |
| assessScourRisk | CDS-action | — | srv/services/risk-investment.cds | 88 |
| computeDeteriorationProfile | CDS-action | — | srv/services/risk-investment.cds | 108 |
| getMaintenancePriorityList | CDS-function | — | srv/services/risk-investment.cds | 111 |
| changeCondition | CDS-action (bound) | Bridges | srv/services/bridges.cds | 51 |
| closeForTraffic | CDS-action (bound) | Bridges | srv/services/bridges.cds | 55 |
| reopenForTraffic | CDS-action (bound) | Bridges | srv/services/bridges.cds | 59 |
| applyTemporaryRestriction | CDS-action (bound) | Bridges | srv/services/bridges.cds | 63 |
| closeBridge | CDS-action (bound) | Bridges | srv/services/bridges.cds | 80 |
| reopenBridge | CDS-action (bound) | Bridges | srv/services/bridges.cds | 87 |
| addRestriction | CDS-action (bound) | Bridges | srv/services/bridges.cds | 94 |
| disableRestriction | CDS-action (bound) | Restrictions | srv/services/bridges.cds | 149 |
| enableRestriction | CDS-action (bound) | Restrictions | srv/services/bridges.cds | 153 |
| createTemporaryRestriction | CDS-action (bound) | Restrictions | srv/services/bridges.cds | 157 |
| extendTemporaryRestriction | CDS-action (bound) | Restrictions | srv/services/bridges.cds | 165 |
| importBridgesBatch | CDS-action | — | srv/services/bridges.cds | 183 |
| importRestrictionsBatch | CDS-action | — | srv/services/bridges.cds | 240 |
| assessCorridor | CDS-action | — | srv/services/freight.cds | 22 |
| assessFreightRouteVehicle | CDS-action | — | srv/services/freight.cds | 26 |
| findAlternativeRoutes | CDS-action | — | srv/services/freight.cds | 39 |
| assessRouteGeometry | CDS-action | — | srv/services/freight.cds | 50 |
| validateRoute | CDS-action | — | srv/services/freight.cds | 65 |
| calculateRoute | CDS-action | — | srv/services/freight.cds | 80 |
| closeDefect | CDS-action (bound) | BridgeDefects | srv/services/inspections.cds | 41 |
| classifyDefect | CDS-action | — | srv/services/inspections.cds | 56 |
| validateGazette | CDS-action | — | srv/services/restrictions.cds | 15 |
| pollRestrictionFeed | CDS-action | — | srv/services/restrictions.cds | 31 |

### 2b. Handler modules (`srv/handlers/*.js`)

| File | LOC | Registered in service.js | Notes |
|---|---|---|---|
| bridges.js | 758 | ✓ | bridge CRUD + bound actions |
| restrictions.js | 637 | ✓ | restriction lifecycle |
| inspections.js | 316 | ✓ | defects, inspections |
| upload.js | 710 | ✓ | mass-upload batch importers |
| reports.js | 1018 | ✓ | report KPIs + aggregations |
| geo.js | 1066 | ✓ | geocoding/proxy route |
| system.js | 217 | ✓ | me, getAppConfig, health, before `*` |
| attributes.js | 50 | ✓ | dynamic attribute CRUD |
| analytics-ingest.js | 28 | ✓ | event ingest |
| analytics-report.js | 550 | ✓ | KPIs / reporting |
| analytics-purge.js | 34 | ✓ | retention purge |
| data-quality.js | 139 | ✓ | quality scoring |
| routing-engine.js | 89 | ✓ | calculateRoute |
| restriction-feed.js | 51 | ✓ | feed polling |
| common.js | 213 | — (required as helpers) | shared utilities |
| _template.js | — | — | scaffolding; contains TODO markers |
| integration/handlers.js | — | ✓ (direct require) | S/4, BANC, ESRI dispatch |

### 2c. Dead-code flags

- `srv/handlers/_template.js` — scaffolding only, never `require`d from `service.js`. Retained intentionally as a template; move to `/docs` or `/scripts` to clarify intent.
- `app/bridge-management/webapp/controller/DataQuality.controller.js` — **dead** (no matching route; controller will fail to register pattern match).
- `app/bridge-management/webapp/view/DataQuality.view.xml` — **dead** (same reason).
- No other dead UI5 controllers or handler modules detected. All controllers map 1:1 to routes, all handlers are registered in `srv/service.js`.

---

## 3. ENTITIES & VIEWS

### 3a. Persistent entities (`db/schema/*.cds`)

| Name | Type | File | Line | Exposed |
|---|---|---|---|---|
| Lookup | entity | db/schema/attributes.cds | 13 | ✓ (admin.cds) |
| AttributeDefinition | entity | db/schema/attributes.cds | 24 | ✓ (admin.cds) |
| AttributeValidValue | entity | db/schema/attributes.cds | 44 | ✓ (admin.cds) |
| BridgeAttribute | entity | db/schema/attributes.cds | 55 | ✓ (bridges.cds) |
| EntityAttribute | entity | db/schema/attributes.cds | 65 | ✓ (admin.cds) |
| Route | entity | db/schema/core.cds | 13 | ✓ (bridges.cds) |
| VehicleClass | entity | db/schema/core.cds | 26 | ✓ (bridges.cds) |
| **Bridge** | entity | db/schema/core.cds | 46 | ✓ (bridges.cds) |
| **Restriction** | entity | db/schema/restrictions.cds | 13 | ✓ (bridges.cds) |
| RestrictionChangeLog | entity | db/schema/restrictions.cds | 102 | ✓ (bridges.cds) |
| GazetteValidation | entity | db/schema/restrictions.cds | 116 | ✓ (restrictions.cds) |
| GazetteNotice | entity | db/schema/restrictions.cds | 129 | ✓ (restrictions.cds) |
| RestrictionTypeConfig | entity | db/schema/restrictions.cds | 144 | ✓ (admin.cds) |
| RestrictionFeedSource | entity | db/schema/restrictions.cds | 158 | ✓ (restrictions.cds) |
| InspectionRecord | entity | db/schema/inspection.cds | 25 | ✓ (inspections.cds) |
| BridgeDefect | entity | db/schema/inspection.cds | 44 | ✓ (inspections.cds) |
| BridgeEventLog | entity | db/schema/inspection.cds | 91 | ✓ (bridges.cds) |
| DefectClassification | entity | db/schema/inspection.cds | 111 | ✓ (inspections.cds) |
| BridgeInspection | entity | db/schema/inspection.cds | 128 | ✓ (inspections.cds) |
| **BridgeCapacity** | entity | db/schema/capacity-permits.cds | 20 | ✓ (capacity-permits.cds) |
| VehicleType | entity | db/schema/capacity-permits.cds | 93 | ✓ (capacity-permits.cds) |
| VehiclePermit | entity | db/schema/capacity-permits.cds | 142 | ✓ (capacity-permits.cds) |
| ApprovedRoute | entity | db/schema/capacity-permits.cds | 207 | ✓ (capacity-permits.cds) |
| ApprovedRouteBridge | entity | db/schema/capacity-permits.cds | 230 | ✓ (capacity-permits.cds) |
| LoadRating | entity | db/schema/capacity-permits.cds | 240 | ✓ (capacity-permits.cds) |
| LoadRatingCertificate | entity | db/schema/capacity-permits.cds | 266 | ✓ (capacity-permits.cds) |
| BridgeInspectionMetrics | entity | db/schema/risk-investment.cds | 19 | ✓ (risk-investment.cds) |
| BridgeRiskAssessment | entity | db/schema/risk-investment.cds | 32 | ✓ (risk-investment.cds) |
| BridgeInvestmentPlan | entity | db/schema/risk-investment.cds | 54 | ✓ (risk-investment.cds) |
| BridgeCulvertAssessment | entity | db/schema/risk-investment.cds | 75 | ✓ (risk-investment.cds) |
| BridgeChangeLog | entity | db/schema/risk-investment.cds | 97 | ✓ (risk-investment.cds) |
| BridgeConditionHistory | entity | db/schema/risk-investment.cds | 111 | ✓ (inspections.cds as `BridgeHistory`) |
| BridgeDeteriorationProfile | entity | db/schema/risk-investment.cds | 124 | ✓ (risk-investment.cds) |
| ScourAssessment | entity | db/schema/risk-investment.cds | 141 | ✓ (risk-investment.cds) |
| FreightRoute | entity | db/schema/freight.cds | 14 | ✓ (freight.cds) |
| FreightRouteBridge | entity | db/schema/freight.cds | 26 | ✓ (freight.cds) |
| BridgeRouteAssignment | entity | db/schema/freight.cds | 36 | ✓ (capacity-permits.cds) |
| BridgeExternalRef | entity | db/schema/integration.cds | 18 | ✓ (bridges.cds) |
| DocumentAttachment | entity | db/schema/integration.cds | 31 | ✓ (integration.cds) |
| IntegrationConfig | entity | db/schema/integration.cds | 59 | ✓ (integration.cds) |
| IntegrationLog | entity | db/schema/integration.cds | 97 | ✓ (integration.cds) |
| S4EquipmentMapping | entity | db/schema/integration.cds | 119 | ✓ (integration.cds) |
| SensorDevice | entity | db/schema/integration.cds | 142 | ✓ (integration.cds) |
| SensorReading | entity | db/schema/integration.cds | 157 | ✓ (integration.cds) |
| RoleConfig | entity | db/schema/admin.cds | 14 | ✓ (admin.cds) |
| MapConfig | entity | db/schema/admin.cds | 34 | ✓ (admin.cds) |
| UploadLog | entity | db/schema/admin.cds | 69 | ✓ (admin.cds) |
| AuditLog | entity | db/schema/admin.cds | 82 | ✓ (admin.cds) |
| JurisdictionAccess | entity | db/schema/admin.cds | 104 | ✓ (admin.cds) |
| AssessmentThreshold | entity | db/schema/admin.cds | 115 | ✓ (admin.cds) |
| KPIThreshold | entity | db/schema/admin.cds | 127 | ✓ (admin.cds) |
| MapProviderConfig | entity | db/schema/admin.cds | 139 | ✓ (admin.cds) |
| ReportSchedule | entity | db/schema/admin.cds | 156 | ✓ (admin.cds) |
| DataQualityScore | entity | db/schema/admin.cds | 170 | ✓ (admin.cds) |
| RoutingEngineConfig | entity | db/schema/admin.cds | 184 | ✓ (freight.cds) |
| Tenant | entity | db/schema/tenancy.cds | 17 | ✓ (tenancy.cds) |

### 3b. Service-layer projections & views (`srv/services/*.cds`)

| Name | Type | File | Line |
|---|---|---|---|
| VehicleAccess | view (select) | srv/services/reporting.cds | 9 |
| RouteCompliance | view (select) | srv/services/reporting.cds | 28 |
| ActiveRestrictions | view (select) | srv/services/reporting.cds | 42 |
| BridgePortfolioReport | view (select) | srv/services/reporting.cds | 396 |
| BridgeSafetyReport | view (select) | srv/services/reporting.cds | 421 |
| BridgeInvestmentReport | view (select) | srv/services/reporting.cds | 435 |
| NHVRRouteReport | view (select) | srv/services/reporting.cds | 448 |

(No `.hdbview` / `.hdbcalcview` files in repo.)

### 3c. Association map (abbreviated)

```
Bridge                       <-- [to many]       Restriction               [on .bridge]
Bridge                       <-- [to many]       BridgeDefect              [on .bridge]
Bridge                       <-- [to many]       BridgeAttribute           [on .bridge]
Bridge                       <-- [to many]       BridgeExternalRef         [on .externalRefs]
Bridge                       <-- [to many]       BridgeInspection          [on .bridge]
Bridge                       <-- [to many]       InspectionRecord          [on .inspections]
Bridge                       <-- [to many]       BridgeEventLog            [on .eventLog]
Bridge                       <-- [to many]       BridgeRiskAssessment      [on .riskAssessments]
Bridge                       <-- [to many]       BridgeInvestmentPlan      [on .investmentPlans]
Bridge                       <-- [to many]       BridgeCulvertAssessment   [on .culvertAssessments]
Bridge                       <-- [to many]       BridgeChangeLog           [on .changeLogs]
Bridge                       <-- [to one]        BridgeInspectionMetrics   [on .inspectionMetrics]
Bridge                       --> [to one]        Route                     [route]
Restriction                  --> [to one]        Bridge                    [bridge]
Restriction                  --> [to one]        VehicleClass              [vehicleClass]
Restriction                  --> [to one]        Route                     [route]
Restriction                  <-- [Composition]   RestrictionChangeLog      [changeHistory]
AttributeDefinition          <-- [Composition]   AttributeValidValue       [validValues]
AttributeDefinition          <-- [to many]       BridgeAttribute           [bridgeAttributes]
FreightRoute                 <-- [Composition]   FreightRouteBridge        [bridges]
FreightRouteBridge           --> [to one]        Bridge / FreightRoute
ApprovedRoute                <-- [Composition]   ApprovedRouteBridge       [bridges]
ApprovedRouteBridge          --> [to one]        Bridge / ApprovedRoute
SensorDevice                 <-- [Composition]   SensorReading             [readings]
BridgeCapacity               --> [to one]        Bridge
VehiclePermit                --> [to one]        Bridge / VehicleType
LoadRating                   --> [to one]        Bridge / VehicleType / VehicleClass
LoadRatingCertificate        --> [to one]        Bridge
BridgeCulvertAssessment      --> [to one]        Bridge
BridgeChangeLog              --> [to one]        Bridge
BridgeConditionHistory       --> [to one]        Bridge
BridgeDeteriorationProfile   --> [to one]        Bridge
ScourAssessment              --> [to one]        Bridge
DocumentAttachment           --> [to one]        Bridge
IntegrationLog               --> [to one]        Bridge
S4EquipmentMapping           --> [to one]        Bridge
DataQualityScore             --> [to one]        Bridge
InspectionRecord             --> [to one]        Bridge
BridgeDefect                 --> [to one]        Bridge
BridgeEventLog               --> [to one]        Bridge
BridgeInspection             --> [to one]        Bridge
DefectClassification         --> [to one]        BridgeDefect
```

### 3d. Flags

- **Entities with > 30 fields (review for split / projection):** `Bridge` (~90 after `extend`), `Restriction` (~38 after `extend`), `BridgeCapacity` (~40).
- **No unexposed persistent entities.** Every `db/schema` entity is surfaced via at least one projection in `srv/services/`.
- **Denormalised fields** on `Restriction` (bridge name, vehicle class label, etc.) duplicate source-of-truth data — candidates for computed view projections.

---

## 4. CONFIG & SECURITY

### 4a. MTA

| Module / Resource | Type | Requires | Provides |
|---|---|---|---|
| nhvr-bridge-app-cds-build | custom (pre-build) | — | — |
| nhvr-bridge-srv | nodejs (CAP backend, 512M) | nhvr-db, nhvr-xsuaa, nhvr-logging | srv-api |
| nhvr-bridge-db-deployer | hdb (256M) | nhvr-db | — |
| nhvr-bridge-app-router | approuter.nodejs (256M) | nhvr-xsuaa, nhvr-destination, srv-api | — |
| nhvr-bridge-management-ui | html5 (static) | — | — |
| nhvr-db | resource: com.sap.xs.hdi-container (hana / hdi-shared) | — | — |
| nhvr-xsuaa | resource: xsuaa / application (xs-security.json) | — | — |
| nhvr-destination | resource: destination / lite | — | — |
| nhvr-logging | resource: application-logs / lite | — | — |

### 4b. XSUAA

| Scope | Role Template(s) | Role Collection(s) |
|---|---|---|
| `$XSAPPNAME.Admin` | Admin | NHVR_Admin |
| `$XSAPPNAME.BridgeManager` | Admin, BridgeManager | NHVR_BridgeManager |
| `$XSAPPNAME.Viewer` | Admin, BridgeManager, Viewer | NHVR_Viewer |

All three scopes are referenced through `@restrict` / `@requires` in `srv/services/*.cds`. **No orphaned scope.**

**Flags**
- `.cdsrc.json` mocked users grant roles **not in `xs-security.json`**: `Executive`, `Inspector`, `Operator`. Dev-only mocks, but any `@requires: ['Inspector']` added later will silently fail in production. Either add the scopes + templates, or drop the dev users.
- `$XSAPPNAME.Viewer` is `grant-as-authority-to-apps` to `nhvr-smoke-tester` — ensure this app actually exists in the landscape; delete the grant otherwise.

### 4c. Packages

| Package | File | Bucket |
|---|---|---|
| @cap-js/hana | package.json | dep |
| @sap/audit-logging | package.json | dep |
| @sap/cds | package.json | dep |
| @sap/hana-client | package.json | dep |
| @sap/xssec | package.json | dep |
| express | package.json | dep |
| hdb | package.json | dep |
| passport | package.json | dep |
| @cap-js/cds-test | package.json | devDep |
| @cap-js/sqlite | package.json | devDep |
| @sap/cds-dk | package.json | devDep |
| @sap/cds-fiori | package.json | devDep |
| @sap/cds-lsp | package.json | devDep |
| @stryker-mutator/core | package.json | devDep |
| @stryker-mutator/jest-runner | package.json | devDep |
| eslint | package.json | devDep |
| fast-check | package.json | devDep |
| jest | package.json | devDep |
| sqlite3 | package.json | devDep |
| supertest | package.json | devDep |
| @sap/approuter | app-router/package.json | dep |
| (none) | app/bridge-management/package.json | — |

**Flags**
- No dev packages leaking into `dependencies`. ✓
- No duplicate package entries across `package.json` files. ✓
- `passport` is in `dependencies` but no `require('passport')` in this repo — verify whether `@sap/xssec` brings it in transitively, else drop.

### 4d. Env & CDS config

**`.env` / `.env.*` files** — none tracked in repo (git-ignored by convention).

**`default-env.json.example` keys** (values redacted):
```
VCAP_SERVICES.hana[0].credentials.schema
VCAP_SERVICES.hana[0].credentials.user
VCAP_SERVICES.hana[0].credentials.password
VCAP_SERVICES.hana[0].credentials.host
VCAP_SERVICES.hana[0].credentials.port
VCAP_SERVICES.hana[0].credentials.url
VCAP_SERVICES.hana[0].credentials.certificate
```

**`cds.requires` entries** (from `.cdsrc.json`):
```
requires.db                      : hana-cloud (default)
requires.db   [development]      : sqlite (db.sqlite)
requires.auth                    : xsuaa (default)
requires.auth [development]      : mocked (admin / manager / viewer / executive / inspector / operator / anonymous)
requires.auth [test]             : dummy
[supertester].requires.db        : sqlite (db-supertester.sqlite)
[supertester].requires.auth      : dummy
[demo].requires.db               : sqlite (db-demo.sqlite)
[demo].requires.auth             : mocked (trainer / learner / viewer / anonymous)
[local-hana].requires.db         : hana-cloud
[local-hana].requires.auth       : mocked
```

---

## 5. TEST COVERAGE

| Test File | Type | Covers |
|---|---|---|
| test/unit/bridge-logic.test.js | unit | Bridge computed fields (condition, risk score, RUL) |
| test/unit/common-helpers.test.js | unit | srv/handlers/common.js helpers |
| test/unit/bridgeform-dynattr.test.js | unit | UI5 `BridgeForm` dynamic attributes wiring |
| test/unit/mass-upload-wiring.test.js | unit | Mass-upload controller wiring |
| test/unit/lookup-upload.test.js | unit | Lookup CSV import handler |
| test/unit/massupload-result-rendering.test.js | unit | Mass-upload result table rendering |

**Flags**
- No `test/integration/`, `test/e2e/`, `test/security/`, `test/performance/`, `test/uat/` folders exist — the corresponding npm scripts will silently pass (`--passWithNoTests`).
- **Entities with zero test coverage (55 of 57):** every entity except `Bridge` and `Lookup`.
- **Handler modules with zero test coverage (13 of 14):** `bridges`, `restrictions`, `inspections`, `upload` (only indirectly via mass-upload wiring), `reports`, `geo`, `system`, `attributes`, `analytics-ingest`, `analytics-report`, `analytics-purge`, `data-quality`, `routing-engine`, `restriction-feed`.
- CAP actions (`raiseDefect`, `closeDefect`, `addRestriction`, `importBridgesBatch`, `classifyDefect`, `computeRiskScore`, `calculateRoute`, mass upload variants, S/4-ESRI-BANC integration actions) have zero end-to-end coverage.

---

## 6. CLEANUP BACKLOG (Top 10, Risk DESC)

| # | Area | Item | Issue | Risk | Effort |
|---|---|---|---|---|---|
| 1 | UI5 / routing | `DataQuality.controller.js` + `view/DataQuality.view.xml` | Controller binds to `DataQuality` route that does not exist in `manifest.json`; `oRouter.getRoute("DataQuality")` returns `undefined`, pattern-matched init throws on nav. Remove both files or add the route. | HIGH | S |
| 2 | Security | Mocked dev users grant `Executive`, `Inspector`, `Operator` roles | These role names have no matching scope in `xs-security.json`; any future `@requires: ['Inspector']` passes locally and 403s in prod. | HIGH | S |
| 3 | Tests | Zero integration / e2e / security / perf coverage | `npm test:integration/security/uat/performance` all no-op (`--passWithNoTests`); service handlers, bound actions, and RBAC enforcement are untested. | HIGH | L |
| 4 | Launchpad | Inbound tile titles hard-coded | `NHVRBridgeManagement-manage`, `NHVRBridge-display`, `NHVRDashboard-display` use literal strings; no i18n key. Locale switch in FLP will not translate. | MED | S |
| 5 | Launchpad | Only 3 inbound tiles for ~28 routes | Users cannot land directly on Reports, Permits, FreightRoutes, MassUpload, IntegrationHub, AppAdmin, etc. Either add inbounds or document the intentional subset. | MED | M |
| 6 | Data model | `Bridge` entity (~90 fields) | Hard to maintain, OData payload heavy; split into core + extension composition (`BridgeAsset`, `BridgeCapacityExt`, `BridgeGeoExt`). | MED | L |
| 7 | Data model | `Restriction` denormalised fields | `bridgeName`, `vehicleClassName`, mass/height duplicates drift from source; replace with computed projection. | MED | M |
| 8 | Config | `.cdsrc.json` contains 3 near-identical mock user blocks (`development`, `demo`, `local-hana`) | Duplication / drift risk; extract shared users and override per-profile. | LOW | S |
| 9 | Packages | `passport` in `dependencies` with no `require` in repo | Likely transitive-only need; verify and drop. | LOW | S |
| 10 | Handlers | `srv/handlers/_template.js` contains TODO markers and is not registered | Scaffolding file; move to `docs/templates/` or delete to avoid confusion. | LOW | S |
