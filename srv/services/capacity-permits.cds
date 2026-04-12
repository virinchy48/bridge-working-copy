using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity BridgeCapacities as projection on nhvr.BridgeCapacity {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName,
    bridge.state    as bridgeState,
    bridge.postingStatus as bridgePostingStatus
};

// ── Load Ratings (AS 5100.7 per-vehicle-type assessments) ─────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity LoadRatings as projection on nhvr.LoadRating {
    key ID,
    bridge,
    bridge.bridgeId             as bridgeId,
    bridge.name                 as bridgeName,
    bridge.state                as bridgeState,
    vehicleType,
    vehicleClass,
    vehicleTypeDesc,
    ratingStandard,
    ratingFactor,
    maxGrossMass_t,
    maxAxleLoad_t,
    maxTandemAxle_t,
    maxTriaxleGroup_t,
    assessmentDate,
    assessedBy,
    assessedByFirm,
    reportRef,
    ratingMethod,
    conditionsApplied,
    status,
    nextReviewDue,
    evidenceRef,
    notes,
    createdAt,
    modifiedAt,
    createdBy,
    modifiedBy
};

// ── Vehicle Type Register ──────────────────────────────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity VehicleTypes as projection on nhvr.VehicleType;

// ── Vehicle Permits ────────────────────────────────────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'],         to: 'authenticated-user' },
    { grant: ['DELETE'],                  to: 'authenticated-user' }
]
entity VehiclePermits as projection on nhvr.VehiclePermit {
    *,
    bridge.bridgeId         as bridgeId,
    bridge.name             as bridgeName,
    bridge.state            as bridgeState,
    vehicleType.displayName as vehicleTypeName,
    vehicleType.nhvrClass   as vehicleTypeClass,
    vehicleType.maxGVM_t    as vehicleTypeMaxGVM
};

// ── Approved Routes ────────────────────────────────────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'],         to: 'authenticated-user' },
    { grant: ['DELETE'],                  to: 'authenticated-user' }
]
entity ApprovedRoutes as projection on nhvr.ApprovedRoute {
    *,
    vehicleType.displayName as vehicleTypeName,
    vehicleType.nhvrClass   as vehicleTypeClass,
    bridges: redirected to RouteBridges
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'authenticated-user' }
]
entity RouteBridges as projection on nhvr.ApprovedRouteBridge {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

// ── Assessment Engine ──────────────────────────────────────
// Runs all 8 AS 5100.7 engineering checks for a vehicle on a bridge
@restrict: [{ to: 'authenticated-user' }]
action assessVehicleOnBridge(
    bridgeId          : String,
    vehicleTypeId     : String,
    assessedGVM_t     : Decimal,
    assessedGCM_t     : Decimal,
    assessedHeight_m  : Decimal,
    assessedWidth_m   : Decimal,
    assessedLength_m  : Decimal,
    crossingSpeed_kmh : Integer
) returns {
    eligible               : Boolean;
    permitRequired         : Boolean;
    nhvrClass              : String;
    recommendedAction      : String;
    // Mass check
    massCheckPassed        : Boolean;
    massCheckRequired      : Decimal;
    massCheckAvailable     : Decimal;
    massCheckMargin        : Decimal;
    massCheckNote          : String;
    // Clearance check
    clearanceCheckPassed   : Boolean;
    clearanceCheckRequired : Decimal;
    clearanceCheckAvailable: Decimal;
    clearanceCheckMargin   : Decimal;
    clearanceCheckNote     : String;
    // Width check
    widthCheckPassed       : Boolean;
    widthCheckAvailable    : Decimal;
    widthCheckMargin       : Decimal;
    widthCheckNote         : String;
    // Length check
    lengthCheckPassed      : Boolean;
    lengthCheckNote        : String;
    // Fatigue check
    fatigueCheckPassed     : Boolean;
    fatigueCheckNote       : String;
    fatigueRemaining       : Decimal;
    // Scour check
    scourCheckPassed       : Boolean;
    scourCheckMargin       : Decimal;
    scourCheckNote         : String;
    // Summary
    conditionsList         : String;
    warningsList           : String;
};

// ── Compliance Report Functions ────────────────────────────
// Report 1: Active permits where assessed GVM > current bridge capacity
@restrict: [{ to: 'authenticated-user' }]
function getBridgesExceedingCapacity() returns array of {
    bridgeId                : String;
    bridgeName              : String;
    bridgeState             : String;
    postingStatus           : String;
    approvedGVM_t           : Decimal;
    capacityGVM_t           : Decimal;
    exceedanceAmount_t      : Decimal;
    numberOfAffectedPermits : Integer;
    riskLevel               : String;
};

// Report 2: Bridges on active approved routes whose capacity < route approved limit
@restrict: [{ to: 'authenticated-user' }]
function getNonCompliantBridgesOnRoutes() returns array of {
    routeId                 : String;
    routeName               : String;
    bridgeId                : String;
    bridgeName              : String;
    routeLimit_t            : Decimal;
    bridgeCurrentCapacity_t : Decimal;
    shortfallAmount_t       : Decimal;
    affectedVehicleClasses  : String;
    urgency                 : String;
};

// Report 3: Bridges with overdue load rating reviews
@restrict: [{ to: 'authenticated-user' }]
function getOverdueCapacityReviews(daysOverdue: Integer) returns array of {
    bridgeId        : String;
    bridgeName      : String;
    bridgeState     : String;
    lastRatingDate  : Date;
    nextRatingDue   : Date;
    daysOverdue     : Integer;
    capacityStatus  : String;
    ratedBy         : String;
};

// Fetch all active permits for a given bridge
@restrict: [{ to: 'authenticated-user' }]
function getActivePermitsForBridge(bridgeId: String) returns array of {
    permitId        : String;
    vehicleTypeName : String;
    applicantName   : String;
    assessedGVM_t   : Decimal;
    expiryDate      : Date;
    permitType      : String;
    permitStatus    : String;
    conditions      : String;
};

// ── NHVR Vehicle Access Assessment ────────────────────────
@restrict: [{ to: 'authenticated-user' }]
action assessRestriction(
    bridgeId       : String,
    vehicleClass   : String,
    grossMassT     : Decimal,
    axleLoadT      : Decimal,
    heightM        : Decimal,
    lengthM        : Decimal
) returns {
    permitted      : Boolean;
    permitRequired : Boolean;
    message        : String;
    nhvrPermitUrl  : String;
    gazetteRef     : String;
};

@restrict: [
    { grant: ['READ'],                     to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity LoadRatingCertificates as projection on nhvr.LoadRatingCertificate {
    key ID,
    bridge.ID   as bridge_ID,
    ratingStandard, ratingVehicle, ratingFactor,
    assessedBy, engineerRegNo, assessmentDate, expiryDate,
    assessmentMethod, reportReference, reportURL,
    isCurrentCert, notes, createdAt, createdBy
};

@restrict: [
    { grant: ['READ'],                     to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity BridgeRouteAssignments as projection on nhvr.BridgeRouteAssignment {
    key ID,
    bridge.ID   as bridge_ID,
    route.ID    as route_ID,
    sequenceNo, isLimiter, notes, createdAt
};

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
action healthCheck() returns {
    status    : String;
    timestamp : String;
    version   : String;
    database  : String;
    uptime    : Integer;
};
}
