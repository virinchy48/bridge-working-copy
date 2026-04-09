using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── v2 Support Entities (defined first — referenced by Bridges & Restrictions) ──

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: ['BridgeManager','Admin'] }
]
entity BridgeExternalRefs as projection on nhvr.BridgeExternalRef {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

@cds.redirection.target: true
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity RestrictionChangeLogs as projection on nhvr.RestrictionChangeLog;

// Rich event log — replaces simple BridgeConditionHistory for audit purposes
@cds.redirection.target: true
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity BridgeEventLog as projection on nhvr.BridgeEventLog {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

// ── Core Entities ──────────────────────────────────────────

// Primary projection — marked as the redirection target for nhvr.Bridge
@cds.redirection.target: true
@cds.query.limit: { max: 5000, default: 200 }
@restrict: [
    { grant: ['READ'],               to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'],    to: ['BridgeManager','Admin','Uploader'] },
    { grant: ['DELETE'],             to: ['Admin'] }
]
entity Bridges as projection on nhvr.Bridge {
    *,
    route.routeCode         as routeCode,
    route.description       as routeDescription,
    restrictions            : redirected to Restrictions,
    attributes              : redirected to BridgeAttributes,
    externalRefs            : redirected to BridgeExternalRefs
} actions {
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action changeCondition(conditionValue: String, score: Integer) returns {
        ID: UUID; bridgeId: String; name: String; condition: String; conditionScore: Integer
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action closeForTraffic() returns {
        ID: UUID; bridgeId: String; name: String; postingStatus: String
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action reopenForTraffic() returns {
        ID: UUID; bridgeId: String; name: String; postingStatus: String
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action applyTemporaryRestriction(
        restrictionType : String,
        value           : Decimal,
        unit            : String,
        vehicleClass_ID : UUID,
        validFromDate   : Date,
        validToDate     : Date,
        notes           : String,
        permitRequired  : Boolean,
        temporaryReason : String,
        approvedBy      : String
    ) returns {
        status  : String;
        message : String;
        ID      : UUID;
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action closeBridge(
        reason             : String,
        effectiveFrom      : Date,
        expectedReopenDate : Date,
        approvalRef        : String
    ) returns { status: String; message: String };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action reopenBridge(
        reason        : String,
        effectiveDate : Date,
        approvalRef   : String,
        inspectionRef : String
    ) returns { status: String; message: String };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action addRestriction(
        restrictionType  : String,
        value            : Decimal,
        unit             : String,
        vehicleClass_ID  : UUID,
        vehicleClassLabel: String,
        validFromDate    : Date,
        validToDate      : Date,
        status           : String,
        permitRequired   : Boolean,
        directionApplied : String,
        gazetteRef       : String,
        nhvrPermitClass  : String,
        exceptionsAllowed: String,
        signageRequired  : Boolean,
        signageType      : String,
        enforcementAuthority: String,
        notes            : String
    ) returns { status: String; message: String; ID: UUID };
};

@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity Routes as projection on nhvr.Route;

@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['Admin'] }
]
entity VehicleClasses as projection on nhvr.VehicleClass;

// Primary projection for nhvr.Restriction
@cds.redirection.target: true
@cds.query.limit: { max: 5000, default: 200 }
@restrict: [
    { grant: ['READ'],            to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin'] },
    { grant: ['DELETE'],          to: ['Admin'] }
]
entity Restrictions as projection on nhvr.Restriction {
    *,
    bridge.bridgeId   as bridgeId @readonly,
    bridge.name       as bridgeName @readonly,
    vehicleClass.name as vehicleClassName @readonly,
    directionApplied,
    isTemporary,
    temporaryReason,
    temporaryApprovedBy,
    temporaryApprovalRef,
    temporaryFromDate,
    temporaryToDate,
    vehicleClassLabel,
    route.routeCode   as routeCode @readonly,
    changeHistory           : redirected to RestrictionChangeLogs
} actions {
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action disableRestriction(reason: String) returns {
        status: String; message: String
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action enableRestriction(reason: String) returns {
        status: String; message: String
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action createTemporaryRestriction(
        fromDate    : Date,
        toDate      : Date,
        reason      : String
    ) returns {
        status: String; message: String; ID: UUID
    };
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action extendTemporaryRestriction(
        newToDate   : Date,
        reason      : String
    ) returns {
        status: String; message: String
    };
};

@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: ['BridgeManager','Admin','Inspector','Operator'] }
]
entity BridgeAttributes as projection on nhvr.BridgeAttribute;

// ── Batch Import Actions ──
// Upsert up to 500 bridge rows from CSV upload
// Returns: { created, updated, failed, errors: [{row, field, message}] }
@restrict: [{ to: ['BridgeManager','Admin','Uploader'] }]
action importBridgesBatch(rows: array of {
    bridgeId             : String;
    name                 : String;
    state                : String;
    routeNumber          : String;
    lga                  : String;
    region               : String;
    assetOwner           : String;
    bancId               : String;
    totalLengthM         : Decimal;
    widthM               : Decimal;
    numberOfSpans        : Integer;
    maxSpanLengthM       : Decimal;
    clearanceHeightM     : Decimal;
    numberOfLanes        : Integer;
    structureType        : String;
    material             : String;
    yearBuilt            : Integer;
    designStandard       : String;
    postingStatus        : String;
    loadRating           : Decimal;
    nhvrRouteAssessed    : Boolean;
    nhvrRouteApprovalClass: String;
    hmlApproved          : Boolean;
    bdoubleApproved      : Boolean;
    freightRoute         : Boolean;
    gazetteRef           : String;
    importanceLevel      : Integer;
    conditionRating      : Integer;
    condition            : String;
    structuralAdequacyRating: Integer;
    inspectionDate       : Date;
    nextInspectionDueDate: Date;
    highPriorityAsset    : Boolean;
    asBuiltDrawingRef    : String;
    scourDepthLastMeasuredM: Decimal;
    scourRisk            : String;
    floodImpacted        : Boolean;
    floodImmunityARI     : Integer;
    aadtVehicles         : Integer;
    heavyVehiclePct      : Decimal;
    currentReplacementCost: Decimal;
    remainingUsefulLifeYrs: Integer;
    designLife           : Integer;
    latitude             : Decimal;
    longitude            : Decimal;
    remarks              : String;
    dataSource           : String;
}) returns {
    created : Integer;
    updated : Integer;
    failed  : Integer;
    errors  : array of { row: Integer; field: String; message: String };
};

// Upsert up to 500 restriction rows from CSV upload
@restrict: [{ to: ['BridgeManager','Admin','Uploader'] }]
action importRestrictionsBatch(rows: array of {
    bridge_bridgeId  : String;
    restrictionType  : String;
    value            : Decimal;
    unit             : String;
    vehicleClass_name: String;
    status           : String;
    isTemporary      : Boolean;
    permitRequired   : Boolean;
    validFromDate    : Date;
    validToDate      : Date;
    gazetteRef       : String;
    approvedBy       : String;
    notes            : String;
}) returns {
    created : Integer;
    updated : Integer;
    failed  : Integer;
    errors  : array of { row: Integer; field: String; message: String };
};
}
