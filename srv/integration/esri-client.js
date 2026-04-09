// ============================================================
// ESRI ArcGIS REST Integration Client
// Syncs NHVR bridge data to an ArcGIS Feature Service layer
//
// Supported operations:
//   • addFeatures    — create new bridge feature
//   • updateFeatures — update existing bridge feature
//   • deleteFeatures — remove bridge feature
//   • queryFeatures  — search/retrieve features
//   • applyEdits     — batch add/update/delete
//
// Expected ESRI Feature Service schema:
//   OBJECTID         (auto)
//   BRIDGE_ID        String(20)
//   NHVR_REF         String(20)
//   NAME             String(200)
//   STATE            String(10)
//   REGION           String(100)
//   LGA              String(100)
//   STRUCT_TYPE      String(30)
//   COND_RATING      Integer
//   COND_LABEL       String(20)
//   POSTING_STATUS   String(20)
//   SCOUR_RISK       String(20)
//   YEAR_BUILT       Integer
//   SPAN_LEN_M       Double
//   DECK_WIDTH_M     Double
//   CLEARANCE_HT_M   Double
//   NUM_SPANS        Integer
//   LOAD_LIMIT_T     Double
//   HEIGHT_LIMIT_M   Double
//   ASSET_OWNER      String(100)
//   NHVR_ASSESSED    String(5)
//   LAST_INSP_DATE   Date
//   SYNC_TIMESTAMP   Date
// ============================================================
'use strict';

// ── HTTP helper ───────────────────────────────────────────────
async function esriRequest(config, method, path, params, body) {
    const base = config.baseUrl.replace(/\/$/, '');
    const url  = `${base}${path}`;

    const headers = { 'Accept': 'application/json' };
    let fetchUrl  = url;
    let fetchOpts = { method: method.toUpperCase(), headers };

    if (method.toUpperCase() === 'GET') {
        const qp = new URLSearchParams({ f: 'json', ...(params || {}) });
        if (config.token) qp.set('token', config.token);
        fetchUrl = `${url}?${qp.toString()}`;
    } else {
        // POST form-encoded (ESRI standard)
        const form = new URLSearchParams({ f: 'json', ...(params || {}) });
        if (body)         form.set('features', JSON.stringify(body));
        if (config.token) form.set('token', config.token);
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchOpts.body = form.toString();
    }

    const startMs = Date.now();
    const res     = await fetch(fetchUrl, fetchOpts);
    const durationMs = Date.now() - startMs;

    let json;
    try { json = await res.json(); } catch { json = null; }

    // ESRI returns 200 even for errors — check json.error
    if (!res.ok || json?.error) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        throw Object.assign(new Error(msg), { status: res.status, raw: json, durationMs });
    }
    return { data: json, status: res.status, durationMs };
}

// ── Generate OAuth token (if using token auth) ───────────────
async function generateToken(config) {
    const form = new URLSearchParams({
        username  : config.username,
        password  : config._password || '',
        client    : 'referer',
        referer   : config.baseUrl,
        expiration: '120',
        f         : 'json'
    });

    const tokenUrl = config.tokenUrl || 'https://www.arcgis.com/sharing/rest/generateToken';
    const res      = await fetch(tokenUrl, {
        method : 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body   : form.toString()
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.token;
}

// ── Test connectivity ────────────────────────────────────────
async function testConnection(config) {
    const start = Date.now();
    try {
        const layerUrl = `/${config.esriLayerId || 0}`;
        const res      = await esriRequest(config, 'GET', layerUrl, { f: 'json' });
        return {
            ok         : true,
            message    : 'ArcGIS Feature Service reachable',
            details    : `Layer: ${res.data?.name || layerUrl}, Fields: ${res.data?.fields?.length || 0}`,
            durationMs : Date.now() - start
        };
    } catch (e) {
        return { ok: false, message: e.message, details: String(e.raw || ''), durationMs: Date.now() - start };
    }
}

// ── Map bridge record → ESRI feature attributes ──────────────
function bridgeToEsriAttributes(bridge, activeRestrictions) {
    // Pull active load/height limits
    let loadLimit = null, heightLimit = null;
    if (Array.isArray(activeRestrictions)) {
        const lr = activeRestrictions.find(r => r.restrictionType === 'LOAD_LIMIT'   && r.isActive);
        const hr = activeRestrictions.find(r => r.restrictionType === 'HEIGHT_LIMIT' && r.isActive);
        if (lr) loadLimit   = lr.value;
        if (hr) heightLimit = hr.value;
    }

    return {
        BRIDGE_ID       : bridge.bridgeId,
        NHVR_REF        : bridge.nhvrRef || bridge.bridgeId,
        NAME            : bridge.name || bridge.bridgeId,
        STATE           : bridge.state || '',
        REGION          : bridge.region || '',
        LGA             : bridge.lga || '',
        STRUCT_TYPE     : bridge.structureType || '',
        COND_RATING     : bridge.conditionRating || null,
        COND_LABEL      : bridge.condition || '',
        POSTING_STATUS  : bridge.postingStatus || '',
        SCOUR_RISK      : bridge.scourRisk || '',
        YEAR_BUILT      : bridge.yearBuilt || null,
        SPAN_LEN_M      : bridge.spanLengthM    ? Number(bridge.spanLengthM)    : null,
        DECK_WIDTH_M    : bridge.deckWidthM     ? Number(bridge.deckWidthM)     : null,
        CLEARANCE_HT_M  : bridge.clearanceHeightM ? Number(bridge.clearanceHeightM) : null,
        NUM_SPANS       : bridge.numberOfSpans  ? Number(bridge.numberOfSpans)  : null,
        LOAD_LIMIT_T    : loadLimit  ? Number(loadLimit)  : null,
        HEIGHT_LIMIT_M  : heightLimit ? Number(heightLimit) : null,
        ASSET_OWNER     : bridge.assetOwner || '',
        NHVR_ASSESSED   : bridge.nhvrRouteAssessed ? 'true' : 'false',
        LAST_INSP_DATE  : bridge.lastInspectionDate
                            ? new Date(bridge.lastInspectionDate).getTime() : null,
        SYNC_TIMESTAMP  : Date.now()
    };
}

// ── Build ESRI feature (point geometry + attributes) ─────────
function buildEsriFeature(bridge, activeRestrictions) {
    const feature = {
        attributes: bridgeToEsriAttributes(bridge, activeRestrictions)
    };

    if (bridge.latitude != null && bridge.longitude != null) {
        feature.geometry = {
            x: Number(bridge.longitude),
            y: Number(bridge.latitude),
            spatialReference: { wkid: 4326 }
        };
    }

    return feature;
}

// ── Query for existing feature by BRIDGE_ID ──────────────────
async function findFeatureByBridgeId(config, bridgeId) {
    const layerPath = `/${config.esriLayerId || 0}/query`;
    const res = await esriRequest(config, 'GET', layerPath, {
        where         : `BRIDGE_ID='${bridgeId.replace(/'/g, "''")}'`,
        outFields     : 'OBJECTID,BRIDGE_ID,SYNC_TIMESTAMP',
        returnGeometry: 'false',
        resultRecordCount: '1'
    });
    const features = res.data?.features || [];
    return features[0] || null;
}

// ── Add new feature ──────────────────────────────────────────
async function addFeature(config, bridge, activeRestrictions) {
    const layerPath = `/${config.esriLayerId || 0}/addFeatures`;
    const feature   = buildEsriFeature(bridge, activeRestrictions);
    const res = await esriRequest(config, 'POST', layerPath, {}, [feature]);
    const addResult = res.data?.addResults?.[0];
    if (!addResult?.success) {
        throw new Error(addResult?.error?.description || 'ESRI addFeature failed');
    }
    return { objectId: addResult.objectId };
}

// ── Update existing feature ───────────────────────────────────
async function updateFeature(config, objectId, bridge, activeRestrictions) {
    const layerPath = `/${config.esriLayerId || 0}/updateFeatures`;
    const feature   = buildEsriFeature(bridge, activeRestrictions);
    feature.attributes.OBJECTID = objectId;
    const res = await esriRequest(config, 'POST', layerPath, {}, [feature]);
    const upd = res.data?.updateResults?.[0];
    if (!upd?.success) {
        throw new Error(upd?.error?.description || 'ESRI updateFeature failed');
    }
    return { objectId };
}

// ── Sync a single bridge (upsert) ───────────────────────────
async function syncBridgeToESRI(config, bridge, activeRestrictions) {
    const startMs  = Date.now();
    const existing = await findFeatureByBridgeId(config, bridge.bridgeId);

    let objectId, isNew = false;
    if (existing) {
        objectId = existing.attributes.OBJECTID;
        await updateFeature(config, objectId, bridge, activeRestrictions);
    } else {
        const result = await addFeature(config, bridge, activeRestrictions);
        objectId = result.objectId;
        isNew    = true;
    }

    return {
        objectId,
        isNew,
        bridgeId  : bridge.bridgeId,
        durationMs: Date.now() - startMs
    };
}

// ── Bulk sync via applyEdits ─────────────────────────────────
async function bulkSyncBridgesToESRI(config, bridges, restrictionsMap) {
    const startMs = Date.now();
    const results = { success: 0, failed: 0, errors: [] };

    // Query all existing BRIDGE_IDs in the layer (batched)
    const batchSize = 100;
    const existingMap = new Map();

    for (let i = 0; i < bridges.length; i += batchSize) {
        const batch  = bridges.slice(i, i + batchSize);
        const ids    = batch.map(b => `'${b.bridgeId.replace(/'/g, "''")}'`).join(',');
        const layerPath = `/${config.esriLayerId || 0}/query`;
        try {
            const res = await esriRequest(config, 'GET', layerPath, {
                where         : `BRIDGE_ID IN (${ids})`,
                outFields     : 'OBJECTID,BRIDGE_ID',
                returnGeometry: 'false'
            });
            (res.data?.features || []).forEach(f => {
                existingMap.set(f.attributes.BRIDGE_ID, f.attributes.OBJECTID);
            });
        } catch (e) {
            // continue — will treat all as new
        }
    }

    // Build adds and updates
    const adds    = [];
    const updates = [];

    for (const bridge of bridges) {
        const activeRestrictions = restrictionsMap?.[bridge.ID] || [];
        const feature = buildEsriFeature(bridge, activeRestrictions);
        const oid     = existingMap.get(bridge.bridgeId);
        if (oid) {
            feature.attributes.OBJECTID = oid;
            updates.push(feature);
        } else {
            adds.push(feature);
        }
    }

    // Execute applyEdits in batches
    const editBatch = 200;
    const doEdits = async (features, mode) => {
        for (let i = 0; i < features.length; i += editBatch) {
            const batch     = features.slice(i, i + editBatch);
            const layerPath = `/${config.esriLayerId || 0}/applyEdits`;
            const params    = mode === 'adds'
                ? { adds: JSON.stringify(batch) }
                : { updates: JSON.stringify(batch) };
            try {
                const res = await esriRequest(config, 'POST', layerPath, params);
                const list = mode === 'adds'
                    ? (res.data?.addResults    || [])
                    : (res.data?.updateResults || []);
                list.forEach(r => {
                    if (r.success) results.success++;
                    else {
                        results.failed++;
                        results.errors.push(r.error?.description || 'Unknown error');
                    }
                });
            } catch (e) {
                results.failed  += batch.length;
                results.errors.push(e.message);
            }
        }
    };

    await doEdits(adds,    'adds');
    await doEdits(updates, 'updates');

    return {
        ...results,
        totalBridges: bridges.length,
        newFeatures : adds.length,
        updFeatures : updates.length,
        durationMs  : Date.now() - startMs
    };
}

module.exports = {
    testConnection,
    generateToken,
    findFeatureByBridgeId,
    syncBridgeToESRI,
    bulkSyncBridgesToESRI,
    buildEsriFeature,
    bridgeToEsriAttributes
};
