# Requirements Traceability Matrix (RTM)

**Project**: NHVR Bridge Asset & Restriction Management
**Date**: 2026-04-03
**Service**: BridgeManagementService (srv/service.cds)
**Total Entity Projections**: 82
**Total Actions/Functions**: 89

---

## Legend

| Column | Description |
|--------|-------------|
| D1 Unit | test/unit/ — handler-logic.test.js, businessLogic.test.js |
| D2 Integration | test/integration/ — field-precision.test.js, data-quality-fields.test.js |
| D5 Security | test/security/ — api-security.test.js |
| D6 SAST | test/security/ — sast-scan.test.js |
| D14 Data Quality | test/integration/ — data-quality-fields.test.js |
| Other | Root-level and supertester test files |
| GAP | No test coverage exists |

---

## Part A: Entity Projections (82 total)

### A1. Core Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 1 | Bridges | handler-logic.test.js | field-precision.test.js | api-security.test.js | sast-scan.test.js | data-quality-fields.test.js | bridge-service.test.js, phase9-time-fields.test.js, phase11-full-qa.test.js, st-integration.test.js |
| 2 | Routes | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | route-assessment.test.js |
| 3 | VehicleClasses | GAP | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 4 | Restrictions | handler-logic.test.js | field-precision.test.js | api-security.test.js | sast-scan.test.js | data-quality-fields.test.js | bridge-service.test.js, phase9-time-fields.test.js, st-integration.test.js |
| 5 | BridgeAttributes | GAP | GAP | api-security.test.js | GAP | GAP | data-consistency.test.js |
| 6 | EntityAttributes | GAP | GAP | GAP | GAP | GAP | GAP |
| 7 | AttributeDefinitions | GAP | GAP | api-security.test.js | GAP | GAP | data-consistency.test.js |
| 8 | UploadLogs | GAP | GAP | GAP | GAP | GAP | st-integration.test.js |
| 9 | AuditLogs | GAP | GAP | api-security.test.js | GAP | GAP | st-integration.test.js, phase9-security-perf.test.js |
| 10 | BridgeHistory | GAP | GAP | GAP | GAP | GAP | st-integration.test.js |

### A2. Inspection & Defect Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 11 | InspectionRecords | GAP | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js |
| 12 | InspectionOrders | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js, phase11-full-qa.test.js, st-integration.test.js |
| 13 | MeasurementDocuments | GAP | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 14 | BridgeDefects | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | phase11-full-qa.test.js, st-integration.test.js |
| 15 | BridgeExternalRefs | GAP | GAP | GAP | GAP | GAP | GAP |
| 16 | RestrictionChangeLogs | GAP | GAP | GAP | GAP | GAP | GAP |
| 17 | BridgeEventLog | GAP | GAP | GAP | GAP | GAP | GAP |

### A3. Lookup & Config Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 18 | Lookups | GAP | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 19 | RestrictionTypeConfigs | GAP | GAP | GAP | GAP | GAP | GAP |
| 20 | AttributeValidValues | GAP | GAP | GAP | GAP | GAP | GAP |
| 21 | RoleConfigs | GAP | GAP | GAP | GAP | GAP | phase9-role-auth.test.js |
| 22 | MapConfigs | GAP | GAP | GAP | GAP | GAP | GAP |

### A4. Reporting Views (Read-Only)

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 23 | VehicleAccess | GAP | GAP | GAP | GAP | GAP | GAP |
| 24 | RouteCompliance | GAP | GAP | GAP | GAP | GAP | GAP |
| 25 | ActiveRestrictions | GAP | GAP | GAP | GAP | GAP | GAP |
| 26 | BridgePortfolioReport | GAP | GAP | GAP | GAP | GAP | permit-report.test.js |
| 27 | BridgeSafetyReport | GAP | GAP | GAP | GAP | GAP | permit-report.test.js |
| 28 | BridgeInvestmentReport | GAP | GAP | GAP | GAP | GAP | permit-report.test.js |
| 29 | NHVRRouteReport | GAP | GAP | GAP | GAP | GAP | permit-report.test.js |

### A5. Structural Capacity & Vehicle Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 30 | BridgeCapacities | GAP | GAP | GAP | GAP | GAP | GAP |
| 31 | LoadRatings | GAP | GAP | GAP | GAP | GAP | GAP |
| 32 | VehicleTypes | GAP | GAP | GAP | GAP | GAP | GAP |
| 33 | VehiclePermits | GAP | GAP | GAP | GAP | GAP | GAP |
| 34 | ApprovedRoutes | GAP | GAP | GAP | GAP | GAP | GAP |
| 35 | RouteBridges | GAP | GAP | GAP | GAP | GAP | GAP |

### A6. Risk & Investment Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 36 | BridgeRiskAssessments | GAP | GAP | GAP | GAP | GAP | GAP |
| 37 | BridgeInvestmentPlans | GAP | GAP | GAP | GAP | GAP | GAP |
| 38 | BridgeCulvertAssessments | GAP | GAP | GAP | GAP | GAP | GAP |
| 39 | BridgeInspectionMetrics | GAP | GAP | GAP | GAP | GAP | GAP |
| 40 | BridgeChangeLogs | GAP | GAP | GAP | GAP | GAP | GAP |

### A7. Integration Layer Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 41 | BamsSyncs | GAP | GAP | GAP | GAP | GAP | GAP |
| 42 | FreightRoutes | GAP | GAP | GAP | GAP | GAP | GAP |
| 43 | FreightRouteBridges | GAP | GAP | GAP | GAP | GAP | GAP |
| 44 | WorkOrders | GAP | GAP | GAP | GAP | GAP | GAP |
| 45 | ScourAssessments | GAP | GAP | GAP | GAP | GAP | GAP |
| 46 | GazetteValidations | GAP | GAP | GAP | GAP | GAP | GAP |
| 47 | GazetteNotices | GAP | GAP | GAP | GAP | GAP | GAP |
| 48 | JurisdictionAccesses | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 49 | SensorDevices | GAP | GAP | GAP | GAP | GAP | GAP |
| 50 | SensorReadings | GAP | GAP | GAP | GAP | GAP | GAP |
| 51 | DefectClassifications | GAP | GAP | GAP | GAP | GAP | GAP |
| 52 | BridgeDeteriorationProfiles | GAP | GAP | GAP | GAP | GAP | GAP |
| 53 | DocumentAttachments | GAP | GAP | GAP | GAP | GAP | GAP |
| 54 | IntegrationConfigs | GAP | GAP | GAP | GAP | GAP | GAP |
| 55 | IntegrationLogs | GAP | GAP | GAP | GAP | GAP | GAP |
| 56 | S4EquipmentMappings | GAP | GAP | GAP | GAP | GAP | GAP |
| 57 | LoadRatingCertificates | GAP | GAP | GAP | GAP | GAP | GAP |
| 58 | BridgeInspections | GAP | GAP | GAP | GAP | GAP | GAP |
| 59 | BridgeRouteAssignments | GAP | GAP | GAP | GAP | GAP | GAP |

### A8. Multi-Tenant Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 60 | Tenants | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 61 | TenantFeatures | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 62 | TenantRoleCapabilities | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 63 | FeatureCatalog | GAP | GAP | GAP | GAP | GAP | GAP |

### A9. Admin Config Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 64 | AssessmentThresholds | GAP | GAP | GAP | GAP | GAP | GAP |
| 65 | KPIThresholds | GAP | GAP | GAP | GAP | GAP | GAP |
| 66 | MapProviderConfigs | GAP | GAP | GAP | GAP | GAP | GAP |
| 67 | ReportSchedules | GAP | GAP | GAP | GAP | GAP | GAP |

### A10. Data Quality & Notification Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 68 | DataQualityScores | GAP | GAP | GAP | GAP | data-quality-fields.test.js | GAP |
| 69 | Notifications | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 70 | NotificationRules | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |

### A11. Routing & Feed Entities

| # | Requirement (Entity) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 71 | RoutingEngineConfigs | GAP | GAP | GAP | GAP | GAP | GAP |
| 72 | RestrictionFeedSources | GAP | GAP | GAP | GAP | GAP | GAP |

---

## Part B: Actions (54 total)

### B1. Bridge Bound Actions

| # | Requirement (Action) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 1 | Bridges.changeCondition | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js, st-integration.test.js |
| 2 | Bridges.closeForTraffic | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js |
| 3 | Bridges.reopenForTraffic | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js |
| 4 | Bridges.applyTemporaryRestriction | GAP | GAP | api-security.test.js | GAP | GAP | phase9-time-fields.test.js |
| 5 | Bridges.closeBridge | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 6 | Bridges.reopenBridge | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 7 | Bridges.addRestriction | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | bridge-service.test.js, st-integration.test.js |

### B2. Restriction Bound Actions

| # | Requirement (Action) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 8 | Restrictions.disableRestriction | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 9 | Restrictions.enableRestriction | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 10 | Restrictions.createTemporaryRestriction | GAP | GAP | api-security.test.js | GAP | GAP | phase9-time-fields.test.js |
| 11 | Restrictions.extendTemporaryRestriction | GAP | GAP | api-security.test.js | GAP | GAP | phase9-time-fields.test.js |

### B3. Inspection Bound Actions

| # | Requirement (Action) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 12 | InspectionOrders.startInspection | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | phase11-full-qa.test.js, st-integration.test.js |
| 13 | InspectionOrders.completeInspection | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | phase11-full-qa.test.js, st-integration.test.js |
| 14 | BridgeDefects.closeDefect | handler-logic.test.js | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |

### B4. Unbound Actions (Global)

| # | Requirement (Action) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|---------------------|---------|----------------|-------------|---------|-------------------|-------|
| 15 | reviewInspection | GAP | GAP | GAP | GAP | GAP | phase11-full-qa.test.js |
| 16 | massUploadBridges | GAP | GAP | api-security.test.js | GAP | GAP | st-integration.test.js |
| 17 | massUploadRestrictions | GAP | GAP | api-security.test.js | GAP | GAP | GAP |
| 18 | massUploadRoutes | GAP | GAP | GAP | GAP | GAP | GAP |
| 19 | massUploadVehicleClasses | GAP | GAP | GAP | GAP | GAP | GAP |
| 20 | massUploadInspectionOrders | GAP | GAP | GAP | GAP | GAP | GAP |
| 21 | massUploadBridgeDefects | GAP | GAP | GAP | GAP | GAP | GAP |
| 22 | massUploadLookups | GAP | GAP | GAP | GAP | GAP | GAP |
| 23 | massDownloadBridges | GAP | GAP | GAP | GAP | GAP | GAP |
| 24 | validateRestriction | GAP | GAP | GAP | GAP | GAP | GAP |
| 25 | createInspectionOrder | handler-logic.test.js | GAP | GAP | GAP | GAP | bridge-service.test.js, st-integration.test.js |
| 26 | raiseDefect | handler-logic.test.js | GAP | GAP | GAP | GAP | st-integration.test.js |
| 27 | addExternalRef | GAP | GAP | GAP | GAP | GAP | GAP |
| 28 | expireRestrictions | GAP | GAP | GAP | GAP | GAP | GAP |
| 29 | computeRiskScore | GAP | GAP | GAP | GAP | GAP | st-integration.test.js |
| 30 | raiseDefectFromMeasurement | GAP | GAP | GAP | GAP | GAP | st-integration.test.js |
| 31 | assessVehicleOnBridge | GAP | GAP | GAP | GAP | GAP | route-assessment.test.js |
| 32 | assessRestriction | GAP | GAP | GAP | GAP | GAP | GAP |
| 33 | saveRoleConfig | GAP | GAP | GAP | GAP | GAP | GAP |
| 34 | importBridgesBatch | GAP | GAP | GAP | GAP | GAP | GAP |
| 35 | importRestrictionsBatch | GAP | GAP | GAP | GAP | GAP | GAP |
| 36 | syncWithBams | GAP | GAP | GAP | GAP | GAP | GAP |
| 37 | assessCorridor | GAP | GAP | GAP | GAP | GAP | GAP |
| 38 | assessFreightRouteVehicle | GAP | GAP | GAP | GAP | GAP | GAP |
| 39 | findAlternativeRoutes | GAP | GAP | GAP | GAP | GAP | GAP |
| 40 | assessRouteGeometry | GAP | GAP | GAP | GAP | GAP | GAP |
| 41 | validateRoute | GAP | GAP | GAP | GAP | GAP | GAP |
| 42 | createWorkOrder | GAP | GAP | GAP | GAP | GAP | GAP |
| 43 | assessScourRisk | GAP | GAP | GAP | GAP | GAP | GAP |
| 44 | validateGazette | GAP | GAP | GAP | GAP | GAP | GAP |
| 45 | grantJurisdictionAccess | GAP | GAP | GAP | GAP | GAP | GAP |
| 46 | revokeJurisdictionAccess | GAP | GAP | GAP | GAP | GAP | GAP |
| 47 | ingestSensorReading | GAP | GAP | GAP | GAP | GAP | GAP |
| 48 | classifyDefect | GAP | GAP | GAP | GAP | GAP | GAP |
| 49 | computeDeteriorationProfile | GAP | GAP | GAP | GAP | GAP | GAP |
| 50 | syncBridgeToS4 | GAP | GAP | GAP | GAP | GAP | GAP |
| 51 | syncBridgeFromS4 | GAP | GAP | GAP | GAP | GAP | GAP |
| 52 | syncAllBridgesToS4 | GAP | GAP | GAP | GAP | GAP | GAP |
| 53 | createS4MaintenanceNotification | GAP | GAP | GAP | GAP | GAP | GAP |
| 54 | createS4MaintenanceOrder | GAP | GAP | GAP | GAP | GAP | GAP |
| 55 | exportToBANC | GAP | GAP | GAP | GAP | GAP | GAP |
| 56 | validateBancRecord | GAP | GAP | GAP | GAP | GAP | GAP |
| 57 | syncBridgeToESRI | GAP | GAP | GAP | GAP | GAP | GAP |
| 58 | syncAllBridgesToESRI | GAP | GAP | GAP | GAP | GAP | GAP |
| 59 | testIntegrationConnection | GAP | GAP | GAP | GAP | GAP | GAP |
| 60 | healthCheck | GAP | GAP | GAP | GAP | GAP | GAP |
| 61 | assignTenantCapabilities | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 62 | executeScheduledReport | GAP | GAP | GAP | GAP | GAP | GAP |
| 63 | calculateDataQuality | GAP | GAP | GAP | GAP | data-quality-fields.test.js | GAP |
| 64 | calculateAllDataQuality | GAP | GAP | GAP | GAP | GAP | GAP |
| 65 | generateNotifications | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |
| 66 | getMyNotifications | GAP | GAP | GAP | GAP | GAP | GAP |
| 67 | markNotificationRead | GAP | GAP | GAP | GAP | GAP | GAP |
| 68 | dismissNotification | GAP | GAP | GAP | GAP | GAP | GAP |
| 69 | calculateRoute | GAP | GAP | GAP | GAP | GAP | GAP |
| 70 | pollRestrictionFeed | GAP | GAP | GAP | GAP | GAP | GAP |
| 71 | proxyRoute | GAP | GAP | GAP | GAP | GAP | GAP |
| 72 | geocodeAddress | GAP | GAP | GAP | GAP | GAP | GAP |
| 73 | reverseGeocode | GAP | GAP | GAP | GAP | GAP | GAP |

---

## Part C: Functions (17 total)

| # | Requirement (Function) | D1 Unit | D2 Integration | D5 Security | D6 SAST | D14 Data Quality | Other |
|---|------------------------|---------|----------------|-------------|---------|-------------------|-------|
| 1 | me() | GAP | GAP | api-security.test.js | GAP | GAP | phase9-role-auth.test.js |
| 2 | getAppConfig() | GAP | GAP | GAP | GAP | GAP | GAP |
| 3 | getSystemInfo() | GAP | GAP | GAP | GAP | GAP | GAP |
| 4 | getMapApiConfig() | GAP | GAP | GAP | GAP | GAP | GAP |
| 5 | bridgeComplianceReport() | GAP | GAP | GAP | GAP | GAP | GAP |
| 6 | getDashboardKPIs() | businessLogic.test.js | GAP | GAP | GAP | GAP | analytics.test.js |
| 7 | getConditionTrend() | GAP | GAP | GAP | GAP | GAP | GAP |
| 8 | getInspectionsDue() | GAP | GAP | GAP | GAP | GAP | analytics.test.js |
| 9 | getOpenDefectsSummary() | GAP | GAP | GAP | GAP | GAP | analytics.test.js |
| 10 | getBridgesExceedingCapacity() | GAP | GAP | GAP | GAP | GAP | GAP |
| 11 | getNonCompliantBridgesOnRoutes() | GAP | GAP | GAP | GAP | GAP | GAP |
| 12 | getOverdueCapacityReviews() | GAP | GAP | GAP | GAP | GAP | GAP |
| 13 | getActivePermitsForBridge() | GAP | GAP | GAP | GAP | GAP | GAP |
| 14 | health() | GAP | GAP | GAP | GAP | GAP | GAP |
| 15 | getAssetRegister() | GAP | GAP | GAP | GAP | GAP | GAP |
| 16 | getAssetSummary() | GAP | GAP | GAP | GAP | GAP | GAP |
| 17 | getConditionDistribution() | GAP | GAP | GAP | GAP | GAP | GAP |
| 18 | getRestrictionSummary() | GAP | GAP | GAP | GAP | GAP | GAP |
| 19 | getInspectionStatusReport() | GAP | GAP | GAP | GAP | GAP | GAP |
| 20 | predictCondition() | GAP | GAP | GAP | GAP | GAP | GAP |
| 21 | getMaintenancePriorityList() | GAP | GAP | GAP | GAP | GAP | GAP |
| 22 | getNetworkKPIs() | GAP | GAP | GAP | GAP | GAP | GAP |
| 23 | getInspectionComplianceKPIs() | GAP | GAP | GAP | GAP | GAP | GAP |
| 24 | getDefectKPIs() | GAP | GAP | GAP | GAP | GAP | GAP |
| 25 | getRestrictionKPIs() | GAP | GAP | GAP | GAP | GAP | GAP |
| 26 | getTrendData() | GAP | GAP | GAP | GAP | GAP | GAP |
| 27 | getIntegrationStatus() | GAP | GAP | GAP | GAP | GAP | GAP |
| 28 | getCapabilityProfile() | GAP | GAP | GAP | GAP | GAP | group-isolation.test.js |

---

## Coverage Summary

### By Domain

| Domain | Entities Covered | Entities Total | Actions Covered | Actions Total | Functions Covered | Functions Total |
|--------|-----------------|----------------|-----------------|---------------|-------------------|-----------------|
| Core (Bridges, Restrictions, Routes) | 5/5 | 100% | 11/11 | 100% | 2/2 | 100% |
| Inspection & Defects | 4/7 | 57% | 4/4 | 100% | 2/2 | 100% |
| Lookup & Config | 3/5 | 60% | 1/1 | 100% | 0/0 | - |
| Reporting Views | 4/7 | 57% | 0/0 | - | 0/7 | 0% |
| Structural Capacity & Vehicle | 0/6 | 0% | 1/1 | 100% | 0/3 | 0% |
| Risk & Investment | 0/5 | 0% | 2/2 | 100% | 0/0 | - |
| Integration Layer | 1/19 | 5% | 0/14 | 0% | 0/1 | 0% |
| Multi-Tenant | 3/4 | 75% | 1/1 | 100% | 1/1 | 100% |
| Admin Config | 0/4 | 0% | 0/1 | 0% | 0/0 | - |
| Data Quality & Notifications | 2/3 | 67% | 2/5 | 40% | 0/1 | 0% |
| Routing & Feeds | 0/2 | 0% | 0/2 | 0% | 0/0 | - |
| Mass Upload/Download | 1/1 | 100% | 2/9 | 22% | 0/0 | - |
| Proxy/External | 0/0 | - | 0/3 | 0% | 0/0 | - |
| Dashboard/Analytics | 0/0 | - | 0/0 | - | 1/8 | 13% |

### Overall

| Metric | Covered | Total | Coverage % |
|--------|---------|-------|------------|
| Entity Projections | 23 | 72 | 32% |
| Actions | 24 | 73 | 33% |
| Functions | 6 | 28 | 21% |
| **Combined** | **53** | **173** | **31%** |

### Critical Gaps (Zero Coverage Across ALL Test Types)

**Entities (49 with zero coverage):**
EntityAttributes, BridgeExternalRefs, RestrictionChangeLogs, BridgeEventLog, RestrictionTypeConfigs, AttributeValidValues, MapConfigs, VehicleAccess, RouteCompliance, ActiveRestrictions, BridgeCapacities, LoadRatings, VehicleTypes, VehiclePermits, ApprovedRoutes, RouteBridges, BridgeRiskAssessments, BridgeInvestmentPlans, BridgeCulvertAssessments, BridgeInspectionMetrics, BridgeChangeLogs, BamsSyncs, FreightRoutes, FreightRouteBridges, WorkOrders, ScourAssessments, GazetteValidations, GazetteNotices, SensorDevices, SensorReadings, DefectClassifications, BridgeDeteriorationProfiles, DocumentAttachments, IntegrationConfigs, IntegrationLogs, S4EquipmentMappings, LoadRatingCertificates, BridgeInspections, BridgeRouteAssignments, FeatureCatalog, AssessmentThresholds, KPIThresholds, MapProviderConfigs, ReportSchedules, RoutingEngineConfigs, RestrictionFeedSources

**Actions (49 with zero coverage):**
massUploadRoutes, massUploadVehicleClasses, massUploadInspectionOrders, massUploadBridgeDefects, massUploadLookups, massDownloadBridges, validateRestriction, addExternalRef, expireRestrictions, assessRestriction, saveRoleConfig, importBridgesBatch, importRestrictionsBatch, syncWithBams, assessCorridor, assessFreightRouteVehicle, findAlternativeRoutes, assessRouteGeometry, validateRoute, createWorkOrder, assessScourRisk, validateGazette, grantJurisdictionAccess, revokeJurisdictionAccess, ingestSensorReading, classifyDefect, computeDeteriorationProfile, syncBridgeToS4, syncBridgeFromS4, syncAllBridgesToS4, createS4MaintenanceNotification, createS4MaintenanceOrder, exportToBANC, validateBancRecord, syncBridgeToESRI, syncAllBridgesToESRI, testIntegrationConnection, healthCheck, executeScheduledReport, calculateAllDataQuality, getMyNotifications, markNotificationRead, dismissNotification, calculateRoute, pollRestrictionFeed, proxyRoute, geocodeAddress, reverseGeocode

**Functions (22 with zero coverage):**
getAppConfig, getSystemInfo, getMapApiConfig, bridgeComplianceReport, getConditionTrend, getBridgesExceedingCapacity, getNonCompliantBridgesOnRoutes, getOverdueCapacityReviews, getActivePermitsForBridge, health, getAssetRegister, getAssetSummary, getConditionDistribution, getRestrictionSummary, getInspectionStatusReport, predictCondition, getMaintenancePriorityList, getNetworkKPIs, getInspectionComplianceKPIs, getDefectKPIs, getRestrictionKPIs, getTrendData, getIntegrationStatus
