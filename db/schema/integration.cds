// ============================================================
// INTEGRATION LAYER — external refs, documents, sensors, sync
// S/4HANA, BANC, ESRI, IoT
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';
using {
    nhvr.ExternalSystemType,
    nhvr.SensorType, nhvr.AlertLevel
} from './types';

// ─────────────────────────────────────────────────────────────
// BRIDGE EXTERNAL REFERENCE
// ─────────────────────────────────────────────────────────────
entity BridgeExternalRef : cuid, managed {
    bridge      : Association to Bridge @mandatory;
    systemType  : ExternalSystemType @mandatory;
    externalId  : String(200) @mandatory;
    externalURL : String(500);
    description : String(500);
    isPrimary   : Boolean default false;
    isActive    : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT ATTACHMENT
// ─────────────────────────────────────────────────────────────
entity DocumentAttachment : cuid, managed {
    bridge          : Association to Bridge;
    documentType    : String(30) not null;
    title           : String(200) not null;
    description     : String(500);
    fileName        : String(200);
    mimeType        : String(100);
    fileSize_kb     : Integer;
    storageRef      : String(500);
    externalUrl     : String(500);
    uploadedBy      : String(100);
    documentDate    : Date;
    version         : String(20) default '1.0';
    isActive        : Boolean default true;
    s4DmsObjectKey  : String(100);
    s4DmsDocType    : String(10);
}

// ── GPS fields extend ────────────────────────────────────────
extend DocumentAttachment with {
    gpsLatitude    : Decimal(11,8);
    gpsLongitude   : Decimal(11,8);
    capturedAt     : Timestamp;
}

// ─────────────────────────────────────────────────────────────
// INTEGRATION CONFIG
// ─────────────────────────────────────────────────────────────
entity IntegrationConfig : cuid, managed {
    systemCode          : String(20) not null;
    systemName          : String(100);
    description         : String(300);
    baseUrl             : String(500);
    authType            : String(20) default 'NONE';
    username            : String(100);
    oauthClientId       : String(200);
    oauthScope          : String(200);
    oauthTokenEndpoint  : String(300);
    additionalConfig    : LargeString;
    isActive            : Boolean default false;
    lastTestedAt        : Timestamp;
    lastTestStatus      : String(20) default 'UNTESTED';
    lastTestMessage     : String(500);
    // ── S/4HANA specific ──────────────────────────────────────
    s4SystemId          : String(10);
    s4Client            : String(3);
    s4PlantCode         : String(4);
    s4AssetClass        : String(8);
    s4EquipClass        : String(18);
    s4EquipCategory     : String(1) default 'M';
    s4MaintenancePlant  : String(4);
    // ── ESRI specific ─────────────────────────────────────────
    esriPortalUrl       : String(500);
    esriFeatureServiceUrl: String(500);
    esriLayerId         : Integer default 0;
    esriSpatialRef      : Integer default 4326;
    // ── BANC specific ─────────────────────────────────────────
    bancStateCode       : String(3);
    bancFormatVersion   : String(10) default '3.0';
    bancSubmissionUrl   : String(500);
    bancAgencyCode      : String(20);
}

// ─────────────────────────────────────────────────────────────
// INTEGRATION LOG
// ─────────────────────────────────────────────────────────────
entity IntegrationLog : cuid {
    systemCode          : String(20);
    operationType       : String(30);
    entityType          : String(30);
    entityId            : String(100);
    externalId          : String(100);
    status              : String(20);
    recordsProcessed    : Integer default 0;
    recordsSuccess      : Integer default 0;
    recordsFailed       : Integer default 0;
    startedAt           : Timestamp;
    completedAt         : Timestamp;
    durationMs          : Integer;
    triggeredBy         : String(100);
    errorMessage        : LargeString;
    requestSummary      : LargeString;
    responseSummary     : LargeString;
}

// ─────────────────────────────────────────────────────────────
// S/4HANA EQUIPMENT MAPPING
// ─────────────────────────────────────────────────────────────
entity S4EquipmentMapping : cuid, managed {
    bridge              : Association to Bridge;
    equipmentNumber     : String(18);
    functionalLocation  : String(30);
    equipmentClass      : String(18) default 'BRIDGE_INFRA';
    assetNumber         : String(12);
    assetSubNumber      : String(4) default '0000';
    companyCode         : String(4);
    maintenancePlant    : String(4);
    costCenter          : String(10);
    wbsElement          : String(24);
    workCenter          : String(8);
    lastSyncAt          : Timestamp;
    lastSyncStatus      : String(20) default 'PENDING';
    lastSyncMessage     : String(500);
    syncDirection       : String(10) default 'BOTH';
    lastCharSnapshot    : LargeString;
    conflictFields      : LargeString;
}

// ─────────────────────────────────────────────────────────────
// IoT SENSOR DEVICES & READINGS
// ─────────────────────────────────────────────────────────────
entity SensorDevice : cuid, managed {
    bridge        : Association to Bridge;
    deviceId      : String(50) @mandatory;
    sensorType    : SensorType;
    location      : String(200);
    manufacturer  : String(100);
    installDate   : Date;
    lastReading   : DateTime;
    lastValue     : Decimal(12,4);
    unit          : String(20);
    alertLevel    : AlertLevel default 'NORMAL';
    isActive      : Boolean default true;
    readings      : Composition of many SensorReading on readings.device = $self;
}

entity SensorReading : cuid {
    device        : Association to SensorDevice;
    bridge        : Association to Bridge;
    readingAt     : DateTime;
    value         : Decimal(12,4);
    unit          : String(20);
    alertLevel    : AlertLevel default 'NORMAL';
    rawPayload    : String(500);
}

// ── Bridge extend: external refs + asset fields ──────────────
extend Bridge with {
    // External system cross-references
    bancId                : String(100);
    bancURL               : String(500);
    primaryExternalSystem : ExternalSystemType;
    primaryExternalId     : String(200);
    primaryExternalURL    : String(500);
    externalRefs          : Association to many BridgeExternalRef on externalRefs.bridge = $self;
    // Rich event log (BridgeEventLog lives in inspection.cds but assoc registered here)
    // eventLog backlink → registered in inspection.cds extend
    // Missing asset fields
    roadRoute             : String(100);
    routeNumber           : String(20);
    designStandard        : String(100);
    conditionStandard     : String(100);
    seismicZone           : String(20);
    nextInspectionDue     : Date;
    dataSource            : String(500);
    geometry              : LargeString;       // GeoJSON LineString/Polygon for bridge deck geometry
    // ── Missing Cross-Reference Fields ───────────────────────
    assetClass          : String(50) default 'BRIDGE'; // BRIDGE|CULVERT|RETAINING_WALL|TUNNEL|FERRY|FORD
    nhvrAssetId         : String(50);
    bridgeName2         : String(200);
    waterway            : String(200);
    spanConfig          : String(200);
    deckType            : String(100);
    bearingType         : String(100);
    foundationType      : String(100);
    substructureType    : String(100);
    trafficDirectionality: String(20);
    laneConfig          : String(200);
    hasFootpath         : Boolean default false;
    hasCycleway         : Boolean default false;
    hasRailing          : Boolean default false;
    railingType         : String(100);
    hasMedian           : Boolean default false;
    underClearance_m    : Decimal(5,2);
    overallHeightFromFoundation_m: Decimal(6,2);
    skew_deg            : Decimal(5,1);
    verticalAlignment   : String(50);
    postcodeLocality    : String(20);
    councilArea         : String(200);
    roadHierarchy       : String(50);
    speedLimit_kmh      : Integer;
    // ── Risk & Resilience ────────────────────────────────────
    seismicRisk         : String(20);
    tsunamiRisk         : Boolean default false;
    bushfireRisk        : String(20);
    climateZone         : String(50);
    // ── Financial ────────────────────────────────────────────
    replacementValueAUD : Decimal(15,2);
    insuranceValue      : Decimal(15,2);
    annualMaintenanceCost: Decimal(12,2);
    lastMajorRehab      : Integer;
    nextMajorRehab      : Integer;
    // ── BNAC Integration (April 2026) ────────────────────────
    bnacObjectId        : String(100)  @title: 'BNAC Object ID';
    bnacURL             : String(2000) @title: 'BNAC Asset URL' @Core.Computed;
}

// ── BNAC Environment URL Configuration ──────────────────────
// One row per environment (DEV/TEST/PREPROD/PROD).
// Maintained by BMS Admins via the BNAC Configuration admin screen.
entity BnacEnvironmentConfig {
    key environment : String(10);  // DEV, TEST, PREPROD, PROD
        baseURL     : String(500)  @title: 'BNAC Base URL';
        description : String(200)  @title: 'Description';
        isActive    : Boolean default true @title: 'Active';
        createdAt   : DateTime;
        createdBy   : String(100);
        modifiedAt  : DateTime;
        modifiedBy  : String(100);
}

// Audit log for BNAC Object ID mass-load operations
entity BnacMassLoadLog : cuid {
    loadedAt     : DateTime;
    loadedBy     : String(100);
    fileName     : String(255) @title: 'Source File';
    totalRows    : Integer     @title: 'Total Rows';
    successCount : Integer     @title: 'Succeeded';
    failCount    : Integer     @title: 'Failed';
    errors       : LargeString @title: 'Error Detail (JSON)';
}
