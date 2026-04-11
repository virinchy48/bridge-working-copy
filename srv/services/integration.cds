using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

entity SensorDevices as projection on nhvr.SensorDevice {
    key ID,
    bridge.ID as bridge_ID,
    deviceId, sensorType, location, manufacturer, installDate,
    lastReading, lastValue, unit, alertLevel, isActive, createdAt, modifiedAt
};

@restrict: [{ to: ['Viewer','Inspector','Operator','BridgeManager','Admin'] }]
entity SensorReadings as projection on nhvr.SensorReading {
    key ID,
    device.ID as device_ID,
    bridge.ID as bridge_ID,
    readingAt, value, unit, alertLevel, rawPayload
};

@restrict: [{ to: ['BridgeManager','Admin','Inspector','Operator'] }]
action ingestSensorReading(deviceId: String, value: Decimal, unit: String, readingAt: DateTime, rawPayload: String) returns SensorReadings;

// ── P14: AI Defect Classification ─────────────────────────────

// ── Document Attachments ─────────────────────────────────────
@restrict: [{ grant: ['READ'],             to: ['Viewer','Inspector','Operator','BridgeManager','Admin','Executive'] },
            { grant: ['CREATE','UPDATE'],  to: ['BridgeManager','Admin','Inspector'] },
            { grant: ['DELETE'],           to: ['Admin','BridgeManager'] }]
entity DocumentAttachments as projection on nhvr.DocumentAttachment {
    key ID, bridge, documentType, title, description,
        fileName, mimeType, fileSize_kb, storageRef, externalUrl,
        uploadedBy, documentDate, version, isActive,
        s4DmsObjectKey, s4DmsDocType,
        gpsLatitude, gpsLongitude, capturedAt,
        createdAt, createdBy, modifiedAt, modifiedBy
}

// ── Integration Configs (Admin only) ─────────────────────────
@restrict: [{ grant: ['READ','CREATE','UPDATE','DELETE'], to: ['Admin'] }]
entity IntegrationConfigs as projection on nhvr.IntegrationConfig {
    key ID, systemCode, systemName, description, baseUrl, authType,
        username, oauthClientId, oauthScope, oauthTokenEndpoint,
        additionalConfig, isActive, lastTestedAt, lastTestStatus, lastTestMessage,
        s4SystemId, s4Client, s4PlantCode, s4AssetClass, s4EquipClass,
        s4EquipCategory, s4MaintenancePlant,
        esriPortalUrl, esriFeatureServiceUrl, esriLayerId, esriSpatialRef,
        bancStateCode, bancFormatVersion, bancSubmissionUrl, bancAgencyCode,
        createdAt, createdBy, modifiedAt, modifiedBy
}

// ── Integration Logs (read-only, Admin/BridgeManager) ────────
@restrict: [{ grant: ['READ'],   to: ['BridgeManager','Admin','Executive'] },
            { grant: ['DELETE'], to: ['Admin'] }]
entity IntegrationLogs as projection on nhvr.IntegrationLog {
    key ID, systemCode, operationType, entityType, entityId, externalId,
        status, recordsProcessed, recordsSuccess, recordsFailed,
        startedAt, completedAt, durationMs, triggeredBy, errorMessage,
        requestSummary, responseSummary
}

// ── S/4HANA Equipment Mappings ───────────────────────────────
@restrict: [{ grant: ['READ'],             to: ['Viewer','Inspector','Operator','BridgeManager','Admin','Executive'] },
            { grant: ['CREATE','UPDATE','DELETE'], to: ['Admin','BridgeManager'] }]
entity S4EquipmentMappings as projection on nhvr.S4EquipmentMapping {
    key ID, bridge, equipmentNumber, functionalLocation, equipmentClass,
        assetNumber, assetSubNumber, companyCode,
        maintenancePlant, costCenter, wbsElement, workCenter,
        lastSyncAt, lastSyncStatus, lastSyncMessage, syncDirection,
        lastCharSnapshot, conflictFields,
        createdAt, createdBy, modifiedAt, modifiedBy
}

// ═══════════════════════════════════════════════════════════
// INTEGRATION ACTIONS
// ═══════════════════════════════════════════════════════════

// ── S/4HANA: Push bridge → Equipment + Classification ────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action syncBridgeToS4(
    bridgeId    : UUID,
    forceCreate : Boolean
) returns {
    status          : String;
    message         : String;
    equipmentNumber : String;
    assetNumber     : String;
    charsUpdated    : Integer;
};

// ── S/4HANA: Pull Equipment → update bridge fields ───────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action syncBridgeFromS4(
    equipmentNumber : String
) returns {
    status      : String;
    message     : String;
    bridgeId    : UUID;
    bridgeName  : String;
    fieldsUpdated: Integer;
};

// ── S/4HANA: Bulk sync all bridges (optionally filtered by state)
@restrict: [{ to: ['Admin'] }]
action syncAllBridgesToS4(
    state : String
) returns {
    status  : String;
    total   : Integer;
    success : Integer;
    failed  : Integer;
    skipped : Integer;
};

// ── S/4HANA: Defect → PM Maintenance Notification ────────────
@restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
action createS4MaintenanceNotification(
    defectId : UUID
) returns {
    status             : String;
    message            : String;
    notificationNumber : String;
};

// ── S/4HANA: InspectionOrder → PM Work Order ─────────────────
@restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
action createS4MaintenanceOrder(
    inspectionOrderId : UUID
) returns {
    status      : String;
    message     : String;
    orderNumber : String;
};

// ── BANC: Generate BANC-format CSV export ────────────────────
@restrict: [{ to: ['BridgeManager','Admin','Executive'] }]
action exportToBANC(
    stateCode : String,
    fromDate  : Date,
    toDate    : Date
) returns {
    status      : String;
    message     : String;
    recordCount : Integer;
    csvData     : LargeString;
    filename    : String;
};

// ── BANC: Validate single bridge for BANC compliance ─────────
@restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
action validateBancRecord(
    bridgeId : UUID
) returns {
    isValid  : Boolean;
    errors   : array of String;
    warnings : array of String;
    bancId   : String;
};

// ── ESRI: Sync single bridge to ArcGIS Feature Service ───────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action syncBridgeToESRI(
    bridgeId : UUID
) returns {
    status   : String;
    message  : String;
    objectId : Integer;
};

// ── ESRI: Bulk sync bridges to ArcGIS ────────────────────────
@restrict: [{ to: ['Admin'] }]
action syncAllBridgesToESRI(
    state  : String,
    region : String
) returns {
    status  : String;
    total   : Integer;
    success : Integer;
    failed  : Integer;
};

// ── General: Test connection to any configured system ─────────
@restrict: [{ to: ['Admin','BridgeManager'] }]
action testIntegrationConnection(
    systemCode : String
) returns {
    status         : String;
    message        : String;
    details        : String;
    responseTimeMs : Integer;
};

// ── General: Current status of all integration systems ───────
@restrict: [{ to: ['Viewer','Inspector','Operator','BridgeManager','Admin','Executive'] }]
type IntegrationStatusItem {
    systemCode    : String; systemName : String;
    isActive      : Boolean; isConfigured : Boolean;
    lastSyncAt    : Timestamp; lastSyncStatus : String;
    totalSynced   : Integer; lastError : String;
}
function getIntegrationStatus() returns array of IntegrationStatusItem;

// ═══════════════════════════════════════════════════════════
// v1.1 ENHANCEMENTS — Load Rating Certificates, BHI Inspections,
//                     Route Assignments, Health Check
// ═══════════════════════════════════════════════════════════

}
