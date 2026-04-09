// ============================================================
// S/4HANA Integration Client
// Wraps the following S/4HANA OData V2/V4 APIs:
//   API_EQUIPMENT              — Equipment Master
//   API_MAINTNOTIFICATION_SRV  — PM Maintenance Notifications
//   API_MAINTENANCEORDER_SRV   — PM Maintenance Orders
//
// S/4HANA Bridge Data Model:
//   Bridge Entity  →  Equipment Master (EQUI table)
//   Classification →  Class BRIDGE_INFRA (type 002, equipment class)
//   Defect         →  Maintenance Notification (type M2)
//   InspectionOrder→  Maintenance Order (type ZB01/PM01)
//   Asset Value    →  FI-AA linked to Equipment
//
// Equipment Classification Characteristics (BRIDGE_INFRA):
//   BRIDGE_ID        String(20)   — NHVR bridge ID
//   NHVR_REF         String(20)   — NHVR internal reference
//   BRIDGE_TYPE      String(30)   — structureType
//   SPAN_LENGTH_M    Decimal(8,2) — spanLengthM
//   DECK_WIDTH_M     Decimal(6,2) — deckWidthM
//   CLEARANCE_HT_M   Decimal(6,2) — clearanceHeightM
//   NUM_SPANS        Integer      — numberOfSpans
//   YEAR_BUILT       Integer      — yearBuilt
//   CONDITION_RTG    Integer(1-10)— conditionRating
//   POSTING_STATUS   String(20)   — postingStatus
//   SCOUR_RISK       String(20)   — scourRisk
//   NHVR_ASSESSED    String(5)    — nhvrRouteAssessed (true/false)
//   GAZETTE_REF      String(50)   — gazetteRef
//   LATITUDE         Decimal(11,8)— latitude
//   LONGITUDE        Decimal(11,8)— longitude
//   BANC_ID          String(30)   — bancId
//   ASSET_OWNER      String(100)  — assetOwner
// ============================================================
'use strict';

// ── Characteristic name map: NHVR field → S/4HANA char name ──
const CHAR_MAP = {
    bridgeId          : 'BRIDGE_ID',
    nhvrRef           : 'NHVR_REF',
    structureType     : 'BRIDGE_TYPE',
    spanLengthM       : 'SPAN_LENGTH_M',
    deckWidthM        : 'DECK_WIDTH_M',
    clearanceHeightM  : 'CLEARANCE_HT_M',
    numberOfSpans     : 'NUM_SPANS',
    yearBuilt         : 'YEAR_BUILT',
    conditionRating   : 'CONDITION_RTG',
    postingStatus     : 'POSTING_STATUS',
    scourRisk         : 'SCOUR_RISK',
    nhvrRouteAssessed : 'NHVR_ASSESSED',
    gazetteRef        : 'GAZETTE_REF',
    latitude          : 'LATITUDE',
    longitude         : 'LONGITUDE',
    bancId            : 'BANC_ID',
    assetOwner        : 'ASSET_OWNER'
};

// PM Notification priority mapping: NHVR severity → S/4 priority
const NOTIF_PRIORITY = {
    CRITICAL : '1',
    HIGH     : '2',
    MEDIUM   : '3',
    LOW      : '4',
    ROUTINE  : '4'
};

// ── HTTP helper (uses node fetch, no extra deps) ─────────────
async function s4Request(config, method, path, body) {
    const url   = `${config.baseUrl.replace(/\/$/, '')}${path}`;
    const token = Buffer.from(`${config.username}:${config._password || ''}`).toString('base64');

    const headers = {
        'Content-Type' : 'application/json',
        'Accept'       : 'application/json',
        'Authorization': config.authType === 'BASIC' ? `Basic ${token}` : `Bearer ${config._token || ''}`,
        'sap-client'   : config.s4Client || '100'
    };

    // CSRF token required for mutating calls
    if (['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase())) {
        try {
            const csrf = await fetch(`${config.baseUrl}/`, {
                method : 'GET',
                headers: { ...headers, 'x-csrf-token': 'fetch' }
            });
            const csrfToken = csrf.headers.get('x-csrf-token');
            if (csrfToken) headers['x-csrf-token'] = csrfToken;
        } catch { /* skip if CSRF endpoint unavailable */ }
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const startMs = Date.now();
    const res = await fetch(url, opts);
    const durationMs = Date.now() - startMs;

    let json;
    try { json = await res.json(); } catch { json = null; }

    if (!res.ok) {
        const errMsg = json?.error?.message?.value || json?.message || `HTTP ${res.status}`;
        throw Object.assign(new Error(errMsg), { status: res.status, raw: json, durationMs });
    }
    return { data: json, status: res.status, durationMs };
}

// ── Test connectivity ────────────────────────────────────────
async function testConnection(config) {
    const start = Date.now();
    try {
        const res = await s4Request(config, 'GET',
            '/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment?$top=1&$select=Equipment');
        return {
            ok          : true,
            message     : 'S/4HANA connection successful',
            details     : `API_EQUIPMENT reachable — ${res.data?.d?.results?.[0]?.Equipment || 'no data'}`,
            durationMs  : Date.now() - start
        };
    } catch (e) {
        return { ok: false, message: e.message, details: String(e.raw || ''), durationMs: Date.now() - start };
    }
}

// ── Find Equipment by external bridge ID ─────────────────────
async function findEquipmentByBridgeId(config, bridgeId) {
    const res = await s4Request(config, 'GET',
        `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment?` +
        `$filter=ExternalNumber eq '${encodeURIComponent(bridgeId)}'&` +
        `$select=Equipment,EquipmentName,ExternalNumber,MaintenancePlant,Location`
    );
    const results = res.data?.d?.results || [];
    return results[0] || null;
}

// ── Build Equipment payload from bridge record ────────────────
function buildEquipmentPayload(bridge, config) {
    return {
        ExternalNumber      : bridge.bridgeId,
        EquipmentName       : bridge.name || bridge.bridgeId,
        EquipmentCategory   : config.s4EquipCategory || 'M',
        MaintenancePlant    : config.s4MaintenancePlant || bridge.maintenanceAuthority || '',
        Location            : `${bridge.state || ''}${bridge.region ? ' - ' + bridge.region : ''}`,
        AssetLocation       : bridge.lga || '',
        SuperiorEquipment   : '',
        TechnicalObjectType : 'BRIDGE',
        // Geocoordinates (S/4HANA 2022+ supports this natively)
        GeographicCoordinates: {
            Latitude  : bridge.latitude  ? String(bridge.latitude)  : '',
            Longitude : bridge.longitude ? String(bridge.longitude) : ''
        }
    };
}

// ── Build classification characteristics payload ──────────────
function buildCharacteristicsPayload(bridge, config) {
    const chars = [];
    Object.entries(CHAR_MAP).forEach(([nhvrField, charName]) => {
        const val = bridge[nhvrField];
        if (val !== null && val !== undefined && val !== '') {
            chars.push({
                CharcInternalID   : charName,
                CharacteristicName: charName,
                CharcValue        : String(val)
            });
        }
    });
    return chars;
}

// ── Create Equipment + assign to class + set characteristics ──
async function createEquipment(config, bridge) {
    const payload = buildEquipmentPayload(bridge, config);
    const res = await s4Request(config, 'POST',
        '/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment', payload);
    const equipNum = res.data?.d?.Equipment;

    // Assign to BRIDGE_INFRA classification class
    if (equipNum && config.s4EquipClass) {
        try {
            await s4Request(config, 'POST',
                `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment('${equipNum}')/to_Classification`,
                { ClassType: '002', Class: config.s4EquipClass || 'BRIDGE_INFRA' }
            );
        } catch (e) {
            console.warn('[s4hana] Class assignment failed (may already exist):', e.message);
        }
        // Set characteristic values
        await updateCharacteristics(config, equipNum, bridge);
    }

    return { equipmentNumber: equipNum, payload };
}

// ── Update Equipment characteristics ─────────────────────────
async function updateCharacteristics(config, equipmentNumber, bridge) {
    const chars = buildCharacteristicsPayload(bridge, config);
    let updated = 0;
    for (const char of chars) {
        try {
            await s4Request(config, 'POST',
                `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment('${equipmentNumber}')/to_Characteristics`,
                char
            );
            updated++;
        } catch (e) {
            // PATCH if already exists
            try {
                await s4Request(config, 'PATCH',
                    `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment('${equipmentNumber}')/to_Characteristics('${char.CharacteristicName}')`,
                    { CharcValue: char.CharcValue }
                );
                updated++;
            } catch { /* skip individual char failure */ }
        }
    }
    return updated;
}

// ── Sync bridge → S/4HANA (create or update) ─────────────────
async function syncBridgeToS4(config, bridge) {
    const startMs = Date.now();
    let equipmentNumber, isNew = false;

    const existing = await findEquipmentByBridgeId(config, bridge.bridgeId);

    if (existing) {
        // PATCH the equipment
        await s4Request(config, 'PATCH',
            `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment('${existing.Equipment}')`,
            buildEquipmentPayload(bridge, config)
        );
        equipmentNumber = existing.Equipment;
        await updateCharacteristics(config, equipmentNumber, bridge);
    } else {
        const result = await createEquipment(config, bridge);
        equipmentNumber = result.equipmentNumber;
        isNew = true;
    }

    return {
        equipmentNumber,
        isNew,
        charsUpdated: Object.keys(CHAR_MAP).filter(f => bridge[f] != null).length,
        durationMs  : Date.now() - startMs
    };
}

// ── Pull Equipment → bridge field updates ────────────────────
async function syncBridgeFromS4(config, equipmentNumber) {
    const res = await s4Request(config, 'GET',
        `/sap/opu/odata/sap/API_EQUIPMENT/A_Equipment('${equipmentNumber}')?` +
        `$expand=to_Characteristics&$select=Equipment,EquipmentName,ExternalNumber,MaintenancePlant`
    );
    const eq    = res.data?.d;
    const chars = eq?.to_Characteristics?.results || [];

    const updates = {};
    const reverseMap = Object.fromEntries(Object.entries(CHAR_MAP).map(([k, v]) => [v, k]));
    chars.forEach(c => {
        const nhvrField = reverseMap[c.CharacteristicName];
        if (nhvrField && c.CharcValue) updates[nhvrField] = c.CharcValue;
    });

    return {
        bridgeId      : updates.bridgeId || eq?.ExternalNumber,
        equipmentName : eq?.EquipmentName,
        updates,
        fieldsUpdated : Object.keys(updates).length
    };
}

// ── Create PM Maintenance Notification from Defect ────────────
async function createMaintenanceNotification(config, defect, bridge) {
    const payload = {
        NotificationType    : 'M2',  // Malfunction notification
        TechObjIsEquipment  : true,
        Equipment           : defect._equipmentNumber || '',
        FunctionalLocation  : defect._functionalLocation || '',
        ShortText           : (defect.description || '').slice(0, 40),
        LongText            : defect.description || '',
        Priority            : NOTIF_PRIORITY[defect.severity] || '3',
        MalfunctionStartDate: defect.detectedDate || new Date().toISOString().slice(0, 10),
        ReportedBy          : defect.detectedBy || 'NHVR_SYSTEM',
        // NHVR reference in user-defined field
        NotificationUserStatus: 'NOPR',
        // Work Center
        MainWorkCenter      : config.workCenter || '',
        MainWorkCenterPlant : config.s4MaintenancePlant || ''
    };

    const res = await s4Request(config, 'POST',
        '/sap/opu/odata/sap/API_MAINTNOTIFICATION/MaintenanceNotification', payload);
    return { notificationNumber: res.data?.d?.MaintenanceNotification };
}

// ── Create PM Maintenance Order from Inspection Order ─────────
async function createMaintenanceOrder(config, inspectionOrder, bridge) {
    const payload = {
        OrderType           : 'ZB01',  // Bridge inspection order type; fallback: PM01
        Equipment           : inspectionOrder._equipmentNumber || '',
        ShortText           : `Bridge Inspection: ${bridge.bridgeId} — ${inspectionOrder.orderNumber || ''}`.slice(0, 40),
        MaintPriority       : '3',
        MainWorkCenter      : config.workCenter || '',
        MainWorkCenterPlant : config.s4MaintenancePlant || '',
        PlannedStartDate    : inspectionOrder.plannedDate || new Date().toISOString().slice(0, 10),
        PersonResponsible   : inspectionOrder.inspector || ''
    };

    const res = await s4Request(config, 'POST',
        '/sap/opu/odata/sap/API_MAINTENANCEORDER_SRV/MaintenanceOrder', payload);
    return { orderNumber: res.data?.d?.MaintenanceOrder };
}

module.exports = {
    testConnection,
    findEquipmentByBridgeId,
    syncBridgeToS4,
    syncBridgeFromS4,
    createMaintenanceNotification,
    createMaintenanceOrder,
    buildCharacteristicsPayload,
    CHAR_MAP
};
