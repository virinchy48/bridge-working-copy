// ============================================================
// ADMIN & CONFIGURATION — system settings, audit, notifications
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';

// ─────────────────────────────────────────────────────────────
// ROLE CONFIGURATION
// Admin-configurable UI tab and feature visibility per role
// ─────────────────────────────────────────────────────────────
entity RoleConfig : managed {
    key ID         : String(100) @mandatory;  // Human-readable key e.g. 'rc-admin-addbridge'
    role           : String(50)  @mandatory;  // ADMIN | BRIDGE_MANAGER | READ_ONLY — must match util/model/RoleManager.js
    featureKey     : String(100) @mandatory;  // tab key or feature key (e.g. 'bridges', 'restrictions-tab')
    featureType    : String(20)  @mandatory;  // TAB | ACTION | MENU | FIELD | SECTION
    label          : String(200);
    visible        : Boolean default true;     // show/hide the feature in the UI
    editable       : Boolean default true;     // allow editing (false = read-only for this role)
    featureEnabled : Boolean default true;     // toggle entire feature on/off without redeploy
    sortOrder      : Integer default 0;
    // Field-level overrides (populated for featureType = FIELD)
    fieldName      : String(100);             // CDS field name this config applies to
    fieldVisible   : Boolean default true;    // show field in forms/tables for this role
    fieldEditable  : Boolean default true;    // allow editing this field for this role
    fieldRequired  : Boolean default false;   // make field mandatory for this role
}

// ─────────────────────────────────────────────────────────────
// MAP CONFIGURATION
// ─────────────────────────────────────────────────────────────
entity MapConfig : cuid, managed {
    configKey           : String(50)   @mandatory;  // 'DEFAULT' (primary)
    displayName         : String(100);
    isActive            : Boolean default true;
    // ── Default viewport ──────────────────────────────────────
    defaultCenter_lat   : Decimal(11,8) default -27.0;
    defaultCenter_lng   : Decimal(11,8) default 133.0;
    defaultZoom         : Integer default 5;
    minZoom             : Integer default 3;
    maxZoom             : Integer default 19;
    // ── Coordinate reference system ───────────────────────────
    projection          : String(30)   default 'EPSG:4326';
    projectionNote      : String(200);
    // ── Base map ──────────────────────────────────────────────
    defaultBaseMap      : String(20)   default 'osm';
    // ── Marker clustering ─────────────────────────────────────
    clusteringEnabled   : Boolean default true;
    clusterRadius       : Integer default 60;
    maxZoomBeforeCluster: Integer default 15;
    // ── Custom base maps (JSON array) ─────────────────────────
    customBaseMaps      : LargeString;
    // ── Reference/overlay layers (JSON array) ─────────────────
    referenceLayers     : LargeString;
    // ── ESRI integration (JSON object) ────────────────────────
    esriConfig          : LargeString;
    // ── Draw tool config (JSON object) ────────────────────────
    drawConfig          : LargeString;
    // ── CSV/GeoJSON export column list (JSON array) ───────────
    exportColumns       : LargeString;
    notes               : String(500);
}

// ─────────────────────────────────────────────────────────────
// UPLOAD LOG
// ─────────────────────────────────────────────────────────────
entity UploadLog : cuid, managed {
    fileName        : String(255);
    uploadType      : String(50);
    totalRecords    : Integer;
    successCount    : Integer;
    failureCount    : Integer;
    status          : String(20);
    errorDetails    : LargeString;
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────
entity AuditLog : cuid {
    timestamp   : DateTime   @cds.on.insert: $now;
    userId      : String(100);
    userRole    : String(100);
    action      : String(20);
    entity      : String(100);
    entityId    : String(100);
    entityName  : String(300);
    changes     : LargeString;
    description : String(500);
}

// ── Performance indexes ──────────────────────────────────────
annotate AuditLog with @(cds.persistence.indexes: [
    { name: 'idx_auditlog_timestamp', columns: ['timestamp'] },
    { name: 'idx_auditlog_entity',    columns: ['entity', 'entityId'] },
    { name: 'idx_auditlog_userId',    columns: ['userId'] }
]);

// ─────────────────────────────────────────────────────────────
// JURISDICTION ACCESS — multi-jurisdiction RBAC
// ─────────────────────────────────────────────────────────────
entity JurisdictionAccess : cuid, managed {
    userRef       : String(100);   // user ID / email
    jurisdiction  : String(10);    // NSW, VIC, QLD, WA, SA, TAS, ACT, NT, ALL
    accessLevel   : String(20);    // READ, WRITE, ADMIN
    grantedBy     : String(100);
    expiresAt     : DateTime;
}

// ─────────────────────────────────────────────────────────────
// ASSESSMENT THRESHOLDS (Admin-Configurable)
// ─────────────────────────────────────────────────────────────
entity AssessmentThreshold : cuid, managed {
    thresholdKey    : String(50) @mandatory @assert.unique;
    value           : Decimal(10,3) @mandatory;
    unit            : String(10);
    description     : String(200);
    jurisdiction    : String(3);   // NULL = global default, or state code (NSW, VIC, etc.)
    isActive        : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// KPI THRESHOLDS
// ─────────────────────────────────────────────────────────────
entity KPIThreshold : cuid, managed {
    kpiKey        : String(50) @mandatory @assert.unique;
    warningValue  : Decimal(10,3);
    criticalValue : Decimal(10,3);
    unit          : String(10);
    description   : String(200);
    isActive      : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// MAP PROVIDER CONFIG
// ─────────────────────────────────────────────────────────────
entity MapProviderConfig : cuid, managed {
    mapProvider         : String(20) default 'osm-leaflet';  // google | esri | osm-leaflet | osm-maplibre
    geocodeProvider     : String(20) default 'nominatim';    // google | esri | nominatim
    routingProvider     : String(20) default 'osrm';         // google | esri | ors | osrm | valhalla
    defaultCenter_lat   : Decimal(11,8) default -25.0;
    defaultCenter_lng   : Decimal(11,8) default 134.0;
    defaultZoom         : Integer default 4;
    clusterEnabled      : Boolean default true;
    clusterRadius       : Integer default 50;
    trafficLayerEnabled : Boolean default false;
    streetViewEnabled   : Boolean default false;
    isActive            : Boolean default true;
}

// ─────────────────────────────────────────────────────────────
// REPORT SCHEDULE
// ─────────────────────────────────────────────────────────────
entity ReportSchedule : cuid, managed {
    reportKey     : String(50) @mandatory;
    cronSchedule  : String(50);     // e.g., "0 8 * * 1" = every Monday 8am
    recipients    : LargeString;    // JSON array of email addresses
    format        : String(10) default 'CSV';  // CSV | XLSX
    filters       : LargeString;    // JSON filter config
    isActive      : Boolean default true;
    lastRunAt     : Timestamp;
    lastRunStatus : String(20);
}

// ─────────────────────────────────────────────────────────────
// DATA QUALITY SCORING ENGINE
// ─────────────────────────────────────────────────────────────
entity DataQualityScore : cuid, managed {
    bridge         : Association to Bridge;
    overallScore   : Decimal(5,2);
    completeness   : Decimal(5,2);
    accuracy       : Decimal(5,2);
    timeliness     : Decimal(5,2);
    missingFields  : LargeString;
    staleFields    : LargeString;
    calculatedAt   : Timestamp;
}

// ─────────────────────────────────────────────────────────────
// ROUTING ENGINE ABSTRACTION
// ─────────────────────────────────────────────────────────────
entity RoutingEngineConfig : cuid, managed {
    engine       : String(20) @mandatory;  // osrm | valhalla | ors | google | esri
    baseUrl      : String(500) @mandatory;
    apiKey       : String(500);
    maxWaypoints : Integer default 25;
    isDefault    : Boolean default false;
    isActive     : Boolean default true;
    notes        : String(500);
}
