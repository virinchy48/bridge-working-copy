// ============================================================
// CAPACITY, PERMITS & VEHICLES
// BridgeCapacity, VehicleType, VehiclePermit, ApprovedRoute,
// LoadRating, LoadRatingCertificate
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge, nhvr.VehicleClass } from './core';
using {
    nhvr.CapacityStatus, nhvr.VehicleCategory, nhvr.SuspensionType,
    nhvr.PermitStatus, nhvr.PermitType, nhvr.RouteStatus,
    nhvr.LoadRatingStatus
} from './types';

// ─────────────────────────────────────────────────────────────
// BRIDGE CAPACITY — AS 5100.7 engineering determination
// ─────────────────────────────────────────────────────────────
entity BridgeCapacity : cuid, managed {
    bridge                      : Association to Bridge;

    // ── Mass Limits (tonnes) ──────────────────────────────────
    grossMassLimit_t            : Decimal(8,2);
    grossCombinedLimit_t        : Decimal(8,2);
    singleAxleLimit_t           : Decimal(6,2);
    tandemAxleLimit_t           : Decimal(6,2);
    triaxleGroupLimit_t         : Decimal(6,2);
    quadAxleGroupLimit_t        : Decimal(6,2);
    steerAxleLimit_t            : Decimal(6,2);

    // ── Vertical Clearance (metres) ───────────────────────────
    minVerticalClearance_m      : Decimal(5,2);
    designVerticalClearance_m   : Decimal(5,2);
    clearanceSurveyDate         : Date;
    clearanceSurveyMethod       : String(100);
    clearanceLane1_m            : Decimal(5,2);
    clearanceLane2_m            : Decimal(5,2);
    clearanceLane3_m            : Decimal(5,2);
    clearanceLane4_m            : Decimal(5,2);

    // ── Horizontal / Carriageway Geometry ─────────────────────
    carriageway_m               : Decimal(5,2);
    leftShoulder_m              : Decimal(4,2);
    rightShoulder_m             : Decimal(4,2);
    laneWidth_m                 : Decimal(4,2);
    trafficableWidth_m          : Decimal(5,2);
    horizontalCurvatureRadius_m : Decimal(8,1);
    approachAlignmentLeft       : String(200);
    approachAlignmentRight      : String(200);

    // ── Load Rating (AS 5100.7) ───────────────────────────────
    loadRatingStandard          : String(50);
    loadRatingFactor            : Decimal(5,3);
    loadRatingMethod            : String(100);
    loadRatingEngineer          : String(200);
    loadRatingDate              : Date;
    loadRatingReportRef         : String(200);
    nextRatingDue               : Date;

    // ── Fatigue Life ──────────────────────────────────────────
    designFatigueLife_years     : Integer;
    consumedFatigueLife_pct     : Decimal(5,1);
    remainingFatigueLife_years  : Decimal(6,1);
    fatigueCriticalElement      : String(200);
    fatigueSensitive            : Boolean default false;
    heavyVehicleCountPerDay     : Integer;

    // ── Dynamic Load Allowance ────────────────────────────────
    dynamicLoadAllowance_pct    : Decimal(5,1);
    speedLimitForAssessment_kmh : Integer;
    reducedSpeedCondition_kmh   : Integer;

    // ── Scour & Environment ───────────────────────────────────
    scourCriticalDepth_m        : Decimal(6,2);
    currentScourDepth_m         : Decimal(6,2);
    scourSafetyMargin_m         : Decimal(5,2);
    floodClosureLevel_m         : Decimal(6,2);
    windClosureSpeed_kmh        : Integer;
    seismicDesignLevel          : String(20);

    // ── Capacity Status ───────────────────────────────────────
    capacityStatus              : CapacityStatus default 'NOT_RATED';
    capacityNotes               : LargeString;
    lastReviewedBy              : String(200);
    lastReviewedDate            : Date;
    nextReviewDue               : Date;
}

// ─────────────────────────────────────────────────────────────
// VEHICLE TYPE — NHVR vehicle configuration register
// ─────────────────────────────────────────────────────────────
entity VehicleType : cuid, managed {
    vehicleTypeId               : String(30)  @mandatory;
    code                        : String(50)  @mandatory;
    displayName                 : String(200) @mandatory;
    nhvrClass                   : String(20);
    vehicleCategory             : VehicleCategory;
    description                 : String(500);

    // Mass (tonnes)
    maxGVM_t                    : Decimal(8,2);
    maxGCM_t                    : Decimal(8,2);
    steerAxleMax_t              : Decimal(6,2);
    driveAxleGroupMax_t         : Decimal(6,2);
    trailerAxleGroupMax_t       : Decimal(6,2);
    axleGroupConfig             : String(200);
    numberOfAxles               : Integer;
    axleSpacingMin_m            : Decimal(5,2);
    tyrePressureMax_kPa         : Integer;

    // Dimensions (metres)
    maxHeight_m                 : Decimal(5,2);
    maxWidth_m                  : Decimal(5,2);
    maxLength_m                 : Decimal(6,2);
    maxOverhang_m               : Decimal(5,2);
    turningRadiusMin_m          : Decimal(6,1);

    // Dynamic characteristics
    suspensionType              : SuspensionType;
    dynamicFactor               : Decimal(4,3);
    maxOperatingSpeed_kmh       : Integer;
    requiresEscort              : Boolean default false;
    escortConfig                : String(200);

    // NHVR permit context
    permitClass                 : String(100);
    permitRequired              : Boolean default false;
    nhvrRef                     : String(1000);
    hvnlSection                 : String(100);

    // Industry context
    industryUseCase             : String(500);
    commonRouteTypes            : String(200);
    active                      : Boolean default true;
    isSystem                    : Boolean default false;
}

// ─────────────────────────────────────────────────────────────
// VEHICLE PERMIT
// ─────────────────────────────────────────────────────────────
entity VehiclePermit : cuid, managed {
    permitId                    : String(30) @mandatory;
    bridge                      : Association to Bridge;
    vehicleType                 : Association to VehicleType;

    // Permit details
    permitStatus                : PermitStatus default 'DRAFT';
    permitType                  : PermitType;
    applicantName               : String(200);
    applicantABN                : String(20);
    nhvrPermitNumber            : String(100);
    issueDate                   : Date;
    expiryDate                  : Date;
    effectiveFrom               : Date;

    // Assessed vehicle configuration for this specific permit
    assessedGVM_t               : Decimal(8,2);
    assessedGCM_t               : Decimal(8,2);
    assessedHeight_m            : Decimal(5,2);
    assessedWidth_m             : Decimal(5,2);
    assessedLength_m            : Decimal(6,2);
    assessedAxleConfig          : String(200);

    // Permit conditions
    speedCondition_kmh          : Integer;
    escortRequired              : Boolean default false;
    escortConfig                : String(200);
    timeWindowAllowed           : String(200);
    singleTripOnly              : Boolean default false;
    numberOfTripsAllowed        : Integer;
    tripsUsed                   : Integer default 0;
    notifyAuthority             : String(500);
    additionalConditions        : LargeString;

    // Engineering assessment
    assessedBy                  : String(200);
    assessedDate                : Date;
    assessmentNotes             : LargeString;
    loadRatingFactorUsed        : Decimal(5,3);
    clearanceFactorUsed         : Decimal(5,2);

    // Compliance checks
    checkMassPassed             : Boolean;
    checkClearancePassed        : Boolean;
    checkWidthPassed            : Boolean;
    checkLengthPassed           : Boolean;
    checkFatiguePassed          : Boolean;
    checkScourPassed            : Boolean;
    allChecksPassed             : Boolean;

    // Audit
    approvedBy                  : String(200);
    approvedDate                : Date;
    deniedReason                : LargeString;
    gazetteRef                  : String(200);
}

// ── Version ──────────────────────────────────────────────────
extend VehiclePermit with {
    version    : Integer default 1;
}

// ─────────────────────────────────────────────────────────────
// APPROVED ROUTE — chain of bridges assessed as a corridor
// ─────────────────────────────────────────────────────────────
entity ApprovedRoute : cuid, managed {
    routeId                     : String(30) @mandatory;
    routeName                   : String(300) @mandatory;
    routeDescription            : LargeString;
    vehicleType                 : Association to VehicleType;
    routeStatus                 : RouteStatus default 'UNDER_REVIEW';
    startPoint                  : String(300);
    endPoint                    : String(300);
    totalDistanceKm             : Decimal(8,2);
    geojsonRoute                : LargeString;
    limitingBridgeId            : String(20);
    limitingConstraint          : String(500);
    routeGrossLimit_t           : Decimal(8,2);
    routeHeightLimit_m          : Decimal(5,2);
    routeWidthLimit_m           : Decimal(5,2);
    nhvrRef                     : String(1000);
    approvedBy                  : String(200);
    approvedDate                : Date;
    expiryDate                  : Date;
    active                      : Boolean default true;
    bridges                     : Composition of many ApprovedRouteBridge on bridges.route = $self;
}

entity ApprovedRouteBridge : cuid {
    route                       : Association to ApprovedRoute;
    bridge                      : Association to Bridge;
    sequence                    : Integer;
    notes                       : String(500);
}

// ─────────────────────────────────────────────────────────────
// LOAD RATING — per-bridge, per-vehicle-type assessment records
// ─────────────────────────────────────────────────────────────
entity LoadRating : cuid, managed {
    bridge              : Association to Bridge @mandatory;
    vehicleType         : Association to VehicleType;
    vehicleClass        : Association to VehicleClass;
    vehicleTypeDesc     : String(200);
    ratingStandard      : String(50) @mandatory;
    ratingFactor        : Decimal(6,3);
    maxGrossMass_t      : Decimal(8,2) @mandatory;
    maxAxleLoad_t       : Decimal(6,2);
    maxTandemAxle_t     : Decimal(6,2);
    maxTriaxleGroup_t   : Decimal(6,2);
    assessmentDate      : Date @mandatory;
    assessedBy          : String(200) @mandatory;
    assessedByFirm      : String(200);
    reportRef           : String(200);
    ratingMethod        : String(100);
    conditionsApplied   : LargeString;
    status              : LoadRatingStatus default 'UNKNOWN';
    nextReviewDue       : Date;
    evidenceRef         : String(500);
    notes               : LargeString;
}

// ─────────────────────────────────────────────────────────────
// LOAD RATING CERTIFICATES
// ─────────────────────────────────────────────────────────────
entity LoadRatingCertificate : cuid {
    bridge           : Association to Bridge;
    ratingStandard   : String(20)  not null;
    ratingVehicle    : String(50);
    ratingFactor     : Decimal(5,3);
    assessedBy       : String(120) not null;
    engineerRegNo    : String(30)  not null;
    assessmentDate   : Date        not null;
    expiryDate       : Date;
    assessmentMethod : String(20);
    reportReference  : String(200);
    reportURL        : String(500);
    isCurrentCert    : Boolean default false;
    notes            : String(500);
    createdAt        : Timestamp @cds.on.insert: $now;
    createdBy        : String(100) @cds.on.insert: $user;
}

// ── Bridge extend: TS01501 / load rating denorm fields ───────
extend Bridge with {
    ratingStandard       : String(20);
    ratingVehicle        : String(50);
    ratingFactor         : Decimal(5,3);
    ratingAssessedBy     : String(120);
    ratingEngineerReg    : String(30);
    ratingAssessmentDate : Date;
    ratingExpiry         : Date;
    ratingReportRef      : String(100);
    ratingMethod_v11     : String(20);   // 'TIER1' | 'TIER2' | 'TIER3'
    // ── TS01501 Asset Fields ──────────────────────────────────
    assetStatusCode      : String(10)  default 'ISOP';
    assetStatusDate      : Date;
    serviceLifeEndDate   : Date;
    remainingServiceLife : Integer;
    designLifeYears      : Integer;
    assetCriticalityCode : Integer;
    coordinateDatumCode  : String(30)  default 'GDA2020';
    transportModeCode    : String(5)   default 'RD';
    transportNetworkCode : String(5);
    heritageInventoryNo  : String(20);
    ddaCompliant         : String(5);
    handoverDate         : Date;
    postedLoadRigid      : Decimal(5,1);
    postedLoadSemi       : Decimal(5,1);
    grossWeightLimit     : Decimal(5,1);
    verticalClearance    : Decimal(5,2);
    signpostedVCL        : Decimal(5,2);
    screenElecRequired   : Boolean;
    antiThrowRequired    : Boolean;
    refugeCount          : Integer;
    walkwayFitted        : Boolean;
    nhvrRestrictionCode  : String(20);
    nhvrAssessmentDate   : Date;
    bhiCalculationDate   : Timestamp;
    bhiCalculationVersion: String(10);
    bhiApprovedBy        : String(100);
    culvertCellType      : String(10);
    culvertPurpose       : String(10);
    culvertDesignCapacity: Decimal(8,3);
}

// ── Annotations ──────────────────────────────────────────────
annotate VehicleType with { code @assert.unique; };
annotate BridgeCapacity with { bridge @mandatory; };
annotate VehiclePermit with { bridge @mandatory; };
