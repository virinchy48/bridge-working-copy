using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── Reporting Views ────────────────────────────────────────
@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity VehicleAccess as select from nhvr.Restriction {
    key ID,
    bridge.bridgeId         as bridgeId,
    bridge.name             as bridgeName,
    bridge.region,
    vehicleClass.name       as vehicleClassName,
    vehicleClass.code       as vehicleClassCode,
    restrictionType,
    value,
    unit,
    status,
    validFromDate,
    validToDate,
    permitRequired,
    route.routeCode
} where bridge.isActive = true;

@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity RouteCompliance as select from nhvr.Bridge {
    key route.routeCode,
    route.description       as routeDescription,
    route.region,
    count(ID)               as bridgeCount   : Integer,
    count(case when postingStatus = 'POSTED'   then 1 end) as postedCount   : Integer,
    count(case when postingStatus = 'CLOSED'   then 1 end) as closedCount   : Integer,
    count(case when condition     = 'CRITICAL' then 1 end) as criticalCount : Integer,
    count(case when condition     = 'POOR'     then 1 end) as poorCount     : Integer
} where isActive = true
  group by route.routeCode, route.description, route.region;

@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity ActiveRestrictions as select from nhvr.Restriction {
    key ID,
    restrictionType,
    value,
    unit,
    bridge.bridgeId         as bridgeId,
    bridge.name             as bridgeName,
    bridge.region,
    vehicleClass.name       as vehicleClassName,
    route.routeCode,
    validFromDate,
    validToDate,
    validFromTime,
    validToTime,
    dayOfWeek,
    permitRequired,
    conditionCode
} where status = 'ACTIVE' and isActive = true;

// ── Current User Info (all authenticated users) ───────────
function me() returns {
    id      : String;
    roles   : array of String;
    appMode : String;
};

// ── App Configuration (lite/full mode + feature flags) ───────
function getAppConfig() returns {
    mode         : String;   // 'full' | 'lite'
    liteFeatures : String;   // JSON array of hidden feature keys in lite mode
    version      : String;
};

// ── Mass Upload Actions (BridgeManager + Admin only) ──────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadBridges(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadRestrictions(csvData: LargeString) returns {
    status      : String;
    totalRecords: Integer;
    successCount: Integer;
    failureCount: Integer;
    errors       : LargeString;
};

// ── Mass Upload — Routes ──────────────────────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadRoutes(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

// ── Mass Upload — Vehicle Classes ─────────────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadVehicleClasses(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

// ── Mass Upload — Inspection Orders ───────────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadInspectionOrders(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

// ── Mass Upload — Bridge Defects ──────────────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadBridgeDefects(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

// ── Mass Upload — Lookups ─────────────────────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action massUploadLookups(csvData: LargeString) returns {
    status       : String;
    totalRecords : Integer;
    successCount : Integer;
    updatedCount : Integer;
    failureCount : Integer;
    errors       : LargeString;
};

// ── System Info (mode detection for demo/training) ────────
@restrict: [{ to: 'authenticated-user' }]
function getSystemInfo() returns {
    mode        : String;
    label       : String;
    version     : String;
    isTraining  : Boolean;
};

// ── Map API Config (provider + key availability) ─────────
@restrict: [{ to: 'authenticated-user' }]
function getMapApiConfig() returns {
    provider         : String;
    geocodeProvider  : String;
    routingProvider  : String;
    center           : array of Decimal;
    zoom             : Integer;
    clusterEnabled   : Boolean;
    clusterRadius    : Integer;
    googleMapsApiKey : String;
    esriApiKey       : String;
};

// ── Mass Download / CSV Export (all authenticated users) ──
@restrict: [{ to: 'authenticated-user' }]
action massDownloadBridges(
    region  : String,
    state   : String,
    routeCode: String
) returns {
    csvData     : LargeString;
    totalRecords: Integer;
};

// ── Validation Action (all authenticated users) ────────────
action validateRestriction(
    bridgeId        : String,
    vehicleClassCode: String,
    checkDate       : Date,
    checkTime       : Time,
    restrictionType : String
) returns {
    isAllowed       : Boolean;
    restrictionValue: Decimal;
    unit            : String;
    message         : String;
    permitRequired  : Boolean;
};

// ── Compliance Report (BridgeManager + Admin) ─────────────
@restrict: [{ to: 'authenticated-user' }]
function bridgeComplianceReport() returns array of {
    bridgeId       : String;
    bridgeName     : String;
    state          : String;
    issue          : String;
    severity       : String;
    recommendation : String;
};

// ── Dashboard Aggregation (Phase 6.1) ─────────────────────────
@restrict: [{ to: 'authenticated-user' }]
function getDashboardKPIs(jurisdiction: String) returns LargeString;

@restrict: [{ to: 'authenticated-user' }]
function getConditionTrend(periods: Integer, jurisdiction: String) returns LargeString;

// ── v2 Actions ────────────────────────────────────────────

@restrict: [{ to: 'authenticated-user' }]
action createInspectionOrder(
    bridge_ID         : UUID,
    orderNumber       : String,
    inspectionType    : String,
    plannedDate       : Date,
    inspector         : String,
    assignedInspector : String,
    inspectorOrg      : String,
    accessMethod      : String,
    ratingMethod      : String,
    priority          : String,
    notes             : String
) returns {
    status  : String;
    message : String;
    ID      : UUID;
};

@restrict: [{ to: 'authenticated-user' }]
action raiseDefect(
    bridge_ID          : UUID,
    inspectionOrder_ID : UUID,
    defectCategory     : String,
    severity           : String,
    extent             : String,
    structuralRisk     : String,
    priority           : String,
    description        : LargeString,
    elementGroup       : String,
    elementName        : String,
    location           : String,
    dimensionLength    : Decimal,
    dimensionWidth     : Decimal,
    notes              : String
) returns {
    status      : String;
    message     : String;
    ID          : UUID;
    defectNumber: String;
};

@restrict: [{ to: 'authenticated-user' }]
action addExternalRef(
    bridge_ID   : UUID,
    systemType  : String,
    externalId  : String,
    externalURL : String,
    description : String,
    isPrimary   : Boolean
) returns {
    status  : String;
    message : String;
    ID      : UUID;
};

// Auto-expire restrictions whose validToDate has passed
@restrict: [{ to: 'authenticated-user' }]
action expireRestrictions() returns { expired: Integer };

// ── v2 Analytics Functions ─────────────────────────────────

@restrict: [{ to: 'authenticated-user' }]
function getInspectionsDue(daysAhead: Integer) returns array of {
    bridgeId        : String;
    bridgeName      : String;
    region          : String;
    lastInspection  : Date;
    nextDue         : Date;
    daysOverdue     : Integer;
    inspectionType  : String;
};

@restrict: [{ to: 'authenticated-user' }]
function getOpenDefectsSummary() returns array of {
    bridgeId        : String;
    bridgeName      : String;
    region          : String;
    totalOpen       : Integer;
    criticalCount   : Integer;
    highCount       : Integer;
    oldestDefectDate: Date;
};

// ── Structural Capacity Management ────────────────────────

// Asset register summary grouped by class, state, condition
@restrict: [{ to: 'authenticated-user' }]
function getAssetRegister(
    assetClass     : String,
    state          : String,
    region         : String,
    postingStatus  : String,
    condition      : String,
    conditionMin   : Integer,
    conditionMax   : Integer,
    yearBuiltFrom  : Integer,
    yearBuiltTo    : Integer,
    isActive       : Boolean,
    pageSize       : Integer,
    pageOffset     : Integer
) returns array of {
    ID                  : UUID;
    bridgeId            : String;
    name                : String;
    assetClass          : String;
    assetSubType        : String;
    state               : String;
    region              : String;
    lga                 : String;
    roadRoute           : String;
    routeNumber         : String;
    structureType       : String;
    material            : String;
    yearBuilt           : Integer;
    condition           : String;
    conditionRating     : Integer;
    postingStatus       : String;
    operationalStatus   : String;
    criticality         : String;
    totalLengthM        : Decimal;
    spanLengthM         : Decimal;
    clearanceHeightM    : Decimal;
    numberOfSpans       : Integer;
    assetOwner          : String;
    inspectionDate      : Date;
    nextInspectionDue   : Date;
    activeRestrictions  : Integer;
    grossMassLimit_t    : Decimal;
    latitude            : Decimal;
    longitude           : Decimal;
};

// Summary counts by dimension (for KPI cards and charts)
@restrict: [{ to: 'authenticated-user' }]
function getAssetSummary(
    assetClass     : String,
    state          : String,
    region         : String
) returns array of {
    dimension       : String;   // 'assetClass'|'state'|'condition'|'postingStatus'|'criticality'
    label           : String;
    count           : Integer;
    pct             : Decimal;
};

// Condition distribution for charting
@restrict: [{ to: 'authenticated-user' }]
function getConditionDistribution(
    assetClass     : String,
    state          : String,
    region         : String
) returns array of {
    conditionRating : Integer;
    conditionLabel  : String;
    count           : Integer;
    pct             : Decimal;
};

// Restriction analytics (for restriction report tab)
@restrict: [{ to: 'authenticated-user' }]
function getRestrictionSummary(
    assetClass     : String,
    state          : String,
    region         : String,
    restrictionType: String,
    status         : String
) returns array of {
    bridgeId        : String;
    bridgeName      : String;
    assetClass      : String;
    state           : String;
    region          : String;
    restrictionType : String;
    value           : Decimal;
    unit            : String;
    status          : String;
    validFromDate   : Date;
    validToDate     : Date;
    isTemporary     : Boolean;
    gazetteRef      : String;
    activeRestrictions : Integer;
};

// Inspection status report
@restrict: [{ to: 'authenticated-user' }]
function getInspectionStatusReport(
    assetClass     : String,
    state          : String,
    region         : String,
    overdueOnly    : Boolean
) returns array of {
    bridgeId        : String;
    bridgeName      : String;
    assetClass      : String;
    state           : String;
    region          : String;
    lastInspection  : Date;
    nextDue         : Date;
    daysOverdue     : Integer;
    conditionRating : Integer;
    inspector       : String;
    status          : String;
};

entity BridgePortfolioReport as SELECT from nhvr.Bridge {
    key bridgeId, name, rmsStructureNumber, bancId, technicalObjectCode,
    region, state, lga, lgaBridgeId, roadRoute, routeNumber,
    assetOwner, maintenanceAuthority,
    condition, conditionRating, bridgeHealthIndex, postingStatus,
    structuralAdequacyRating, safetySubRating, durabilitySubRating,
    structuralDeficiencyFlag, functionallyObsoleteFlag,
    structureType, material, totalLengthM, widthM, deckAreaM2,
    numberOfSpans, numberOfLanes, yearBuilt, designLife, remainingUsefulLifeYrs,
    loadRating, vehicularGrossWeightLimitT, clearanceHeightM,
    nhvrRouteAssessed, nhvrRouteApprovalClass, pbsLevelApproved,
    freightRoute, overMassRoute, gazetteRef, nhvrRef,
    aadtVehicles, heavyVehiclePct, detourLengthKm,
    scourRisk, scourVulnerabilityRating, floodImpacted, floodImmunityARI,
    seismicZone, importanceLevel, emergencyAccessRoute, climateVulnerabilityClass,
    currentRiskScore, currentRiskBand, priorityRank,
    currentReplacementCost, writtenDownValue, deferredMaintenanceValue,
    lastPrincipalInspDate, lastRoutineInspDate, nextInspectionDueDate,
    inspectionFrequencyYrs, latitude, longitude,
    dataSource, sourceRefURL, bancURL,
    remarks
};

@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity BridgeSafetyReport as SELECT from nhvr.Bridge {
    key bridgeId, name, state, lga, postingStatus, condition, conditionRating, bridgeHealthIndex,
    structuralDeficiencyFlag, functionallyObsoleteFlag,
    currentRiskScore, currentRiskBand, priorityRank,
    loadRating, vehicularGrossWeightLimitT, clearanceHeightM,
    nhvrRouteApprovalClass, pbsLevelApproved,
    lastPrincipalInspDate, nextInspectionDueDate, inspectionFrequencyYrs,
    scourRisk, scourVulnerabilityRating, scourDepthLastMeasuredM,
    floodImpacted, emergencyAccessRoute,
    screenElectricalSafetyRequired, screenProtectionRequired
};

@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity BridgeInvestmentReport as SELECT from nhvr.Bridge {
    key bridgeId, name, state, region, lga,
    structureType, material, yearBuilt, designLife, remainingUsefulLifeYrs,
    conditionRating, bridgeHealthIndex, postingStatus,
    structuralDeficiencyFlag, functionallyObsoleteFlag,
    currentRiskScore, currentRiskBand, priorityRank,
    currentReplacementCost, writtenDownValue, deferredMaintenanceValue,
    aadtVehicles, detourLengthKm,
    lastPrincipalInspDate, nextInspectionDueDate
};

@readonly
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity NHVRRouteReport as SELECT from nhvr.Bridge {
    key bridgeId, name, state, lga, roadRoute, routeNumber, gazetteRef, nhvrRef,
    nhvrRouteAssessed, nhvrRouteApprovalClass, pbsLevelApproved,
    freightRoute, overMassRoute, postingStatus,
    loadRating, vehicularGrossWeightLimitT, clearanceHeightM,
    aadtVehicles, heavyVehiclePct,
    structuralDeficiencyFlag, currentRiskScore, currentRiskBand
};

// ── Health Check Endpoint ─────────────────────────────────
/**
 * Health check function — returns service status.
 * Used by load balancers, CI/CD pipelines, and SAP Cloud ALM.
 * No authentication required for shallow health checks.
 */
function health() returns {
    status  : String;
    version : String;
    db      : String;
    timestamp : String;
};

// ── External API Proxy Actions (SAP BTP Destination pattern) ──
/**
 * Proxy for OpenRouteService HGV routing.
 * Moves API key server-side — eliminates client-side exposure.
 * In production: API key loaded from BTP Destination service additional header.
 */
@restrict: [{ grant: ['*'], to: 'authenticated-user' }]
action proxyRoute(
    startLon : Decimal(10,6),
    startLat : Decimal(10,6),
    endLon   : Decimal(10,6),
    endLat   : Decimal(10,6)
) returns LargeString;

/**
 * Proxy for Nominatim geocoding.
 * Removes direct browser→external dependency for CSP compliance.
 */
@restrict: [{ grant: ['*'], to: 'authenticated-user' }]
action geocodeAddress(
    address : String
) returns LargeString;

/**
 * Reverse geocode coordinates to address.
 */
@restrict: [{ grant: ['*'], to: 'authenticated-user' }]
action reverseGeocode(
    lat : Decimal(9,6),
    lon : Decimal(9,6)
) returns LargeString;

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function predictCondition(bridgeId: UUID, yearsAhead: Integer) returns array of {
    year           : Integer;
    predictedScore : Decimal;
    predictedRating: Integer;
    confidence     : String;
};


@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function getNetworkKPIs() returns {
    totalBridges: Integer; openBridges: Integer; restrictedBridges: Integer;
    closedBridges: Integer; avgConditionScore: Decimal; criticalCount: Integer;
    overdueInspections: Integer; activeRestrictions: Integer;
};

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function getInspectionComplianceKPIs() returns {
    totalDue: Integer; completedOnTime: Integer; overdue: Integer;
    complianceRate: Decimal; avgDaysSinceInspection: Integer;
};

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function getDefectKPIs() returns {
    totalOpen: Integer; criticalOpen: Integer; highOpen: Integer;
    avgDaysOpen: Integer; closedThisMonth: Integer;
};

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function getRestrictionKPIs() returns {
    totalActive: Integer; expiringIn30Days: Integer; temporaryActive: Integer;
    gazetteValid: Integer; gazetteInvalid: Integer;
};

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
type TrendPoint { period: String; value: Decimal; }
function getTrendData(metric: String, periods: Integer) returns array of TrendPoint;
}
