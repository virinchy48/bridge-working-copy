// ============================================================
// CORE ASSET ENTITIES — Bridge, Route, VehicleClass
// Plus infrastructure extends (asset-class, HML, soft-delete)
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';

// ─────────────────────────────────────────────────────────────
// ROUTE
// ─────────────────────────────────────────────────────────────
entity Route : cuid, managed {
    routeCode   : String(20)  @mandatory;
    description : String(200) @mandatory;
    region      : String(100);
    state       : String(50);
    isActive    : Boolean default true;
    bridges     : Association to many Bridge on bridges.route = $self;
    // restrictions backlink → extend in restrictions.cds
}

// ─────────────────────────────────────────────────────────────
// VEHICLE CLASS
// ─────────────────────────────────────────────────────────────
entity VehicleClass : cuid, managed {
    name            : String(100) @mandatory;
    code            : String(20)  @mandatory;
    description     : String(500);
    maxMassKg       : Decimal(10,2);
    maxHeightM      : Decimal(5,2);
    maxWidthM       : Decimal(5,2);
    maxLengthM      : Decimal(5,2);
    isActive        : Boolean default true;
    isSystem        : Boolean default false;
    sortOrder       : Integer default 0;
    permitRequired  : Boolean default false;
    nhvrRef         : String(200);
    maxAxleLoad_t   : Decimal(8,2);
    // restrictions backlink → extend in restrictions.cds
}

// ─────────────────────────────────────────────────────────────
// BRIDGE — Core asset entity representing a physical bridge
// ─────────────────────────────────────────────────────────────
entity Bridge : cuid, managed {
    bridgeId            : String(20)  @mandatory @assert.unique;
    name                : String(200) @mandatory;
    region              : String(100);
    state               : String(50);
    structureType       : String(100);     // e.g., Beam, Box Girder, Arch
    material            : String(100);     // e.g., Concrete, Steel, Timber
    latitude            : Decimal(11,8) @assert.range: [-90, 90];
    longitude           : Decimal(11,8) @assert.range: [-180, 180];
    route               : Association to Route;
    routeKm             : Decimal(8,3);
    condition           : String(20) default 'GOOD';
    conditionScore      : Integer @assert.range: [0, 100];    // 0-100
    inspectionDate      : Date;
    yearBuilt           : Integer @assert.range: [1800, 2100];
    spanLengthM         : Decimal(8,2);
    deckWidthM          : Decimal(6,2);
    clearanceHeightM    : Decimal(5,2);
    postingStatus       : String(20) default 'UNRESTRICTED';
    isActive            : Boolean default true;
    // ── NHVR & Engineering Fields ────────────────────────────
    lga                 : String(100);
    assetOwner          : String(100);
    maintenanceAuthority: String(100);
    conditionRating     : Integer @assert.range: [1, 10];     // 1-10 (AS 5100 rating scale)
    numberOfSpans       : Integer;
    numberOfLanes       : Integer;
    totalLengthM        : Decimal(8,2);
    widthM              : Decimal(6,2);
    designLoad          : String(100);     // T44, M1600, SM1600, AUSTROADS
    nhvrRouteAssessed   : Boolean default false;
    gazetteRef          : String(100);
    freightRoute        : Boolean default false;
    overMassRoute       : Boolean default false;
    highPriorityAsset   : Boolean default false;
    floodImpacted       : Boolean default false;
    scourRisk           : String(20);      // LOW, MEDIUM, HIGH, CRITICAL
    aadtVehicles        : Integer;
    sourceRefURL        : String(500);
    nhvrRef             : String(100);
    openDataRef         : String(200);
    remarks             : LargeString;
    // ── Cross-domain backlink associations ────────────────────
    // restrictions → extend in restrictions.cds
    // attributes   → extend in attributes.cds
    // inspections  → extend in inspection.cds
}

// =============================================================
// INFRASTRUCTURE EXTENDS on Bridge
// Asset class, HML approval, version/soft-delete
// =============================================================
extend Bridge with {
    // ── Asset Class Support ──────────────────────────────────
    assetSubType        : String(100);
    operationalStatus   : String(30) default 'OPERATIONAL';
    custodian           : String(200);
    managementGroup     : String(100);
    criticality         : String(20) default 'STANDARD';
    // Culvert-specific
    barrelShape         : String(30);
    barrelCount         : Integer;
    pipeDiameter_mm     : Integer;
    pipeWidth_mm        : Integer;
    pipeHeight_mm       : Integer;
    inletType           : String(100);
    outletType          : String(100);
    headwallPresent     : Boolean default false;
    wingwallPresent     : Boolean default false;
    apronPresent        : Boolean default false;
    inletInvert_m       : Decimal(8,3);
    outletInvert_m      : Decimal(8,3);
    catchmentArea_ha    : Decimal(10,2);
    designFlood         : String(20);
    // Tunnel-specific
    tunnelLength_m      : Decimal(8,1);
    tunnelClearWidth_m  : Decimal(5,2);
    tunnelClearHeight_m : Decimal(5,2);
    ventilationType     : String(50);
    // Retaining wall
    wallHeight_m        : Decimal(6,2);
    wallLength_m        : Decimal(8,1);
    wallType            : String(50);
    // ── HML / B-Double Approval ──────────────────────────────
    hmlApproved     : Boolean default false @title: 'HML Approved';
    bdoubleApproved : Boolean default false @title: 'B-Double Approved';
    // ── Version + Soft-Delete ────────────────────────────────
    version    : Integer default 1;
    deletedAt  : Timestamp;
    isDeleted  : Boolean default false;
}

// ── Unique Constraints ───────────────────────────────────────
annotate Route with { routeCode @assert.unique; };
annotate VehicleClass with { code @assert.unique; };

// ── Performance indexes ──────────────────────────────────────
annotate Bridge with @(cds.persistence.indexes: [
    { name: 'idx_bridge_bridgeId', columns: ['bridgeId'] },
    { name: 'idx_bridge_state',    columns: ['state'] },
    { name: 'idx_bridge_condition', columns: ['condition'] },
    { name: 'idx_bridge_isActive', columns: ['isActive'] }
]);
