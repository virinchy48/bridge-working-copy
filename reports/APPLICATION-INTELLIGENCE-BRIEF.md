# APPLICATION INTELLIGENCE BRIEF
## SUPERTESTER ABSOLUTE — Session 1 Entry

| Field | Value |
|-------|-------|
| **App Name** | nhvr-bridge-app |
| **Version** | 3.0.0 (package.json) / 4.5.0 (mta.yaml) |
| **CDS Version** | @sap/cds 9.8.3 |
| **Entities** | 62 (see full list below) |
| **Service Actions** | 65 actions + 36 functions = 101 (service.cds) + 9 (analytics) = **110 total** |
| **XSUAA Scopes** | 8: Admin, BridgeManager, Viewer, Uploader, Executive, Inspector, Operator, TechAdmin |
| **External Services** | S/4HANA (OData), ESRI ArcGIS (REST), BANC (CSV export), ORS/Here (routing) |
| **AI Features** | Yes — `classifyDefect` mock AI engine (keyword matching) |
| **Existing Tests** | 24 files, 1,227 test cases (1,118 pass / 109 fail in st-integration) |
| **Test Coverage** | ~24% entity coverage (10/42+ entities), ~58% action coverage |
| **Tech Debt Signals** | 0 TODOs/FIXMEs in srv/. 1 medium innerHTML risk in MapView |
| **Missing @restrict** | 0 — all 78 entities + 110 actions have @restrict annotations |
| **Enums Defined** | 39 type enums |

### Secret Scan Result: CLEAN
No hardcoded secrets in source or git history.

### npm audit Result: 4 vulns (1 Critical handlebars, 2 High path-to-regexp/picomatch, 1 Moderate yaml)
All in `@sap/cds-dk` (devDependency — NOT shipped to production). **Acceptable.**

### Missing Test Coverage (P1 — 32 entities untested)
VehicleClass, AttributeDefinition, BridgeRiskAssessment, BridgeInvestmentPlan,
BridgeCulvertAssessment, VehicleType, ApprovedRoute, LoadRating, BamsSync,
ScourAssessment, GazetteValidation, JurisdictionAccess, SensorDevice, SensorReading,
DefectClassification, GazetteNotice, BridgeDeteriorationProfile, IntegrationConfig,
S4EquipmentMapping, LoadRatingCertificate, BridgeRouteAssignment, Lookup,
EntityAttribute, RestrictionChangeLog, BridgeEventLog, BridgeInspectionMetrics,
BridgeExternalRef, MapConfig, RoleConfig, DataQualityScore, Notification, NotificationRule

### Missing Test Coverage (25+ actions untested)
All integration handlers (S4, ESRI, BANC), calculateRoute, assessCorridor,
geocode/reverseGeocode, massDownloadBridges, computeRiskScore, createWorkOrder,
ingestSensorReading, classifyDefect, validateRestriction, executeScheduledReport

### Security Findings Summary
| ID | Sev | Finding |
|----|-----|---------|
| F-G0-001 | P2 | MapView.controller.js:560 — innerHTML with `count.toLocaleString()` (numeric only, low risk) |
| F-G0-002 | P3 | Math.random() for correlation IDs in system.js:14, geo.js:48 (non-crypto, acceptable) |
