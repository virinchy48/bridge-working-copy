// ============================================================
// RESTRICTIONS & GAZETTE — legal/operational restrictions
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge, nhvr.VehicleClass, nhvr.Route } from './core';

// ─────────────────────────────────────────────────────────────
// RESTRICTION
// ─────────────────────────────────────────────────────────────
entity Restriction : cuid, managed {
    restrictionType     : String(20) @mandatory;
    value               : Decimal(10,3) @mandatory;
    unit                : String(20) @mandatory;
    vehicleClass        : Association to VehicleClass;
    bridge              : Association to Bridge;
    route               : Association to Route;
    validFromDate       : Date;
    validToDate         : Date;
    validFromTime       : Time;
    validToTime         : Time;
    dayOfWeek           : String(50);
    direction           : String(20);
    status              : String(20) default 'ACTIVE';
    permitRequired      : Boolean default false;
    notes               : String(1000);
    conditionCode       : String(50);
    isActive            : Boolean default true;
    // ── NHVR Fields ──────────────────────────────────────────
    gazetteRef          : String(100);
    enforcementAuthority: String(100);
    nhvrPermitClass     : String(50);
    signageRequired     : Boolean default false;
    sourceRefURL        : String(500);
    nhvrRef             : String(100);
}

// ── Performance indexes ──────────────────────────────────────
annotate Restriction with @(cds.persistence.indexes: [
    { name: 'idx_restriction_bridge', columns: ['bridge_ID'] },
    { name: 'idx_restriction_status', columns: ['status'] },
    { name: 'idx_restriction_type',   columns: ['restrictionType'] }
]);

// ── All Restriction extends (consolidated to avoid unstable ordering) ──
extend Restriction with {
    // Disable lifecycle
    disabledAt            : DateTime;
    disabledBy            : String(100);
    disableReason         : String(500);
    disabledUntil         : Date;
    // Temporary restriction
    isTemporary           : Boolean default false;
    temporaryFromDate     : Date;
    temporaryToDate       : Date;
    temporaryReason       : String(500);
    temporaryApprovedBy   : String(200);
    temporaryApprovalRef  : String(100);
    // Supersession chain
    supersededBy_ID       : UUID;
    supersedes_ID         : UUID;
    // Change history
    changeHistory         : Association to many RestrictionChangeLog on changeHistory.restriction = $self;
    // Additional NHVR fields
    directionApplied      : String(20) default 'BOTH';
    exceptionsAllowed     : String(500);
    signageType           : String(200);
    vehicleClassLabel     : String(100);
    // Denormalised fields
    bridgeId            : String(20);
    bridgeName          : String(200);
    vehicleClassName    : String(100);
    maxHeightM          : Decimal(5,2);
    maxMassT            : Decimal(8,2);
    maxWidthM           : Decimal(5,2);
    restrictionOrder    : String(200);
    reviewDate          : Date;
    supersessionReason  : String(500);
    // B2 fields
    restrictionBasis    : String(500);
    liftConditions      : String(500);
    linkedDefectId      : String(30);
    linkedInspectionId  : String(30);
    approvedBy          : String(200);
    approvalDate        : Date;
    reviewDueDate       : Date;
    utilityImpacted     : String(200);
    // Gazette validation
    gazetteValidationStatus : String(20) default 'NOT_VALIDATED';
    gazetteValidationDate   : DateTime;
    // Soft-Delete & Versioning
    version    : Integer default 1;
    deletedAt  : Timestamp;
    isDeleted  : Boolean default false;
}

// ─────────────────────────────────────────────────────────────
// RESTRICTION CHANGE LOG
// ─────────────────────────────────────────────────────────────
entity RestrictionChangeLog : cuid {
    restriction : Association to Restriction @mandatory;
    changedAt   : DateTime @cds.on.insert: $now;
    changedBy   : String(100);
    changeType  : String(50);    // CREATED, DISABLED, ENABLED, TEMP_APPLIED, TEMP_EXTENDED, SUPERSEDED
    oldStatus   : String(20);
    newStatus   : String(20);
    reason      : String(500);
    notes       : String(1000);
}

// ─────────────────────────────────────────────────────────────
// GAZETTE VALIDATION
// ─────────────────────────────────────────────────────────────
entity GazetteValidation : cuid, managed {
    restriction      : Association to Restriction;
    gazetteRef       : String(100);
    validationStatus : String(20) default 'PENDING'; // VALID, INVALID, PENDING, NOT_REQUIRED
    validatedAt      : DateTime;
    validatedBy      : String(100);
    expiryDate       : Date;
    notes            : String(300);
}

// ─────────────────────────────────────────────────────────────
// GAZETTE NOTICE REGISTER
// ─────────────────────────────────────────────────────────────
entity GazetteNotice : cuid, managed {
    gazetteRef       : String(50) @mandatory;
    state            : String(10);  // NSW, VIC, QLD, SA, WA, TAS, NT, ACT, FEDERAL
    restrictionType  : String(30);  // MASS_LIMIT, HEIGHT, WIDTH, SPEED, etc.
    issuedDate       : Date;
    expiryDate       : Date;
    description      : String(500);
    isActive         : Boolean default true;
    nhvrUrl          : String(300);
}

// ─────────────────────────────────────────────────────────────
// RESTRICTION TYPE CONFIG
// Admin-configurable restriction types (replaces hardcoded enum)
// ─────────────────────────────────────────────────────────────
entity RestrictionTypeConfig : cuid, managed {
    code          : String(30)  @mandatory;  // e.g. GROSS_MASS, HEIGHT
    displayLabel  : String(200) @mandatory;  // e.g. "Gross Vehicle Mass"
    defaultUnit   : String(20);              // t, m, km/h
    valueRequired : Boolean default true;
    description   : String(500);
    sortOrder     : Integer default 0;
    active        : Boolean default true;
    isSystem      : Boolean default false;   // system types cannot be deleted
}

// ─────────────────────────────────────────────────────────────
// RESTRICTION FEED SOURCE
// ─────────────────────────────────────────────────────────────
entity RestrictionFeedSource : cuid, managed {
    sourceCode          : String(50) @mandatory;
    displayName         : String(200);
    feedUrl             : String(500);
    feedFormat           : String(20) default 'JSON';
    jurisdiction        : String(20);
    pollingIntervalMin  : Integer default 60;
    isEnabled           : Boolean default true;
    lastPollAt          : Timestamp;
    lastStatus          : String(20);
    lastErrorMessage    : String(500);
}

// ── Backlink associations on core entities ───────────────────
extend Route with {
    restrictions : Association to many Restriction on restrictions.route = $self;
}

extend VehicleClass with {
    restrictions : Association to many Restriction on restrictions.vehicleClass = $self;
}

extend Bridge with {
    restrictions : Association to many Restriction on restrictions.bridge = $self;
}
