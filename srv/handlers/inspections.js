'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-inspections');

// Cut-down BIS variant: InspectionOrder, MeasurementDocument and WorkOrder
// were removed. This handler now covers BridgeDefect lifecycle, the legacy
// InspectionRecord audit hooks, document attachments, and sensor ingest.
module.exports = function registerInspectionHandlers(srv, helpers) {
    const { getBridge, getBridgeDefect, logAudit } = helpers;

    // ── InspectionRecord CRUD audit hooks ────────────────────────
    srv.after('CREATE', 'InspectionRecords', async (data, req) => {
        await logAudit('CREATE', 'InspectionRecords', data.ID, `Inspection ${data.inspectionDate}`,
            `Inspection record created for bridge ${data.bridge_ID}`, data, req);
    });
    srv.after('UPDATE', 'InspectionRecords', async (data, req) => {
        await logAudit('UPDATE', 'InspectionRecords', req.params[0], `Inspection update`,
            `Inspection record updated`, req.data, req);
    });
    srv.after('DELETE', 'InspectionRecords', async (data, req) => {
        await logAudit('DELETE', 'InspectionRecords', req.params[0], '', `Inspection record deleted`, null, req);
    });

    // ── Referential integrity: BridgeDefects ─────────────────────
    srv.before('CREATE', 'BridgeDefects', async (req) => {
        const { bridge_ID } = req.data;
        if (!bridge_ID) return req.error(400, 'bridge_ID is required');
        const db = await cds.connect.to('db');
        const exists = await db.run(SELECT.from('nhvr.Bridge').columns('ID').where({ ID: bridge_ID }).limit(1));
        if (!exists || exists.length === 0) return req.error(400, `Bridge with ID '${bridge_ID}' does not exist`);
    });

    srv.after('CREATE', 'BridgeDefects', async (data, req) => {
        await logAudit('CREATE', 'BridgeDefects', data.defectNumber || data.ID, data.defectCategory,
            `Defect raised: ${data.severity} ${data.defectCategory}`, data, req);
    });
    srv.after('CREATE', 'BridgeExternalRefs', async (data, req) => {
        await logAudit('CREATE', 'BridgeExternalRefs', data.externalId, data.systemType,
            `External ref ${data.systemType}:${data.externalId} added`, data, req);
    });

    // ── raiseDefect ───────────────────────────────────────────────
    // Severity and category enums are sourced from the Lookup table at
    // request time so admin uploads via massUploadLookups can extend
    // them without a code change. The previous hardcoded VALID_SEVERITIES
    // / VALID_CATEGORIES drifted out of sync with the UI dropdowns and
    // surfaced as "Invalid severity: 'MODERATE'" errors at save time.
    async function loadAllowed(db, category) {
        try {
            const rows = await db.run(
                SELECT.from('nhvr.Lookup').columns('code')
                    .where({ category, isActive: true })
            );
            return rows.map(r => r.code).filter(Boolean);
        } catch (e) {
            return [];
        }
    }
    srv.on('raiseDefect', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin'))
            return req.error(403, 'Insufficient privileges for this operation');
        const { bridge_ID, defectCategory, severity, extent,
                structuralRisk, priority, description, elementGroup, elementName, location } = req.data;
        if (!bridge_ID || !defectCategory || !severity || !description)
            return req.error(400, 'bridge_ID, defectCategory, severity, and description are required');
        const db = await cds.connect.to('db');
        const VALID_SEVERITIES = await loadAllowed(db, 'DEFECT_SEVERITY');
        if (VALID_SEVERITIES.length && !VALID_SEVERITIES.includes(severity))
            return req.error(400, `Invalid severity: '${severity}'. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
        const VALID_CATEGORIES = await loadAllowed(db, 'DEFECT_CATEGORY');
        if (VALID_CATEGORIES.length && !VALID_CATEGORIES.includes(defectCategory))
            return req.error(400, `Invalid defectCategory: '${defectCategory}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
        const bridge = await getBridge(bridge_ID, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const existingCount = await db.run(SELECT.from('nhvr.BridgeDefect').where({ bridge_ID }));
        const defectNumber = `D-${bridge.bridgeId}-${String((existingCount.length || 0) + 1).padStart(3, '0')}`;
        const newDefect = {
            bridge_ID,
            defectNumber, elementGroup: elementGroup || null, elementName: elementName || null,
            defectCategory, severity, extent: extent || null, structuralRisk: structuralRisk || null,
            priority: priority || 'MEDIUM', status: 'OPEN', description,
            location: location || '',
            detectedDate: new Date().toISOString().split('T')[0],
            detectedBy: req.user ? req.user.id : 'system'
        };
        const result = await db.run(INSERT.into('nhvr.BridgeDefect').entries(newDefect));
        const newId = result.lastID || (Array.isArray(result) ? result[0] : null);
        await logAudit('CREATE', 'BridgeDefects', defectNumber, bridge.name,
            `Defect ${defectNumber} raised on ${bridge.name}: ${severity} ${defectCategory}`, newDefect, req);
        return { status: 'SUCCESS', message: `Defect ${defectNumber} raised`, ID: newId, defectNumber };
    });

    // ── closeDefect ───────────────────────────────────────────────
    srv.on('closeDefect', 'BridgeDefects', async (req) => {
        const { closureNotes } = req.data;
        const _dp = req.params[0];
        const defectId = (typeof _dp === 'object' && _dp !== null) ? (_dp.ID || Object.values(_dp)[0]) : _dp;
        const db = await cds.connect.to('db');
        const defect = await getBridgeDefect(defectId, db);
        if (!defect) return req.error(404, 'Defect not found');
        if (defect.status === 'CLOSED') return req.error(400, 'Defect is already closed');
        await db.run(UPDATE('nhvr.BridgeDefect').set({
            status: 'CLOSED',
            closedDate: new Date().toISOString().split('T')[0],
            closedBy: req.user ? req.user.id : 'system',
            closureNotes: closureNotes || ''
        }).where({ ID: defectId }));
        await logAudit('ACTION', 'BridgeDefects', defect.defectNumber, defect.defectNumber,
            `Defect ${defect.defectNumber} closed`, { closureNotes }, req);
        return { status: 'SUCCESS', message: 'Defect closed successfully' };
    });

    // ── addExternalRef ────────────────────────────────────────────
    srv.on('addExternalRef', async (req) => {
        const { bridge_ID, systemType, externalId, externalURL, description, isPrimary } = req.data;
        if (!bridge_ID || !systemType || !externalId)
            return req.error(400, 'bridge_ID, systemType, and externalId are required');
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridge_ID, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        if (isPrimary) {
            await db.run(UPDATE('nhvr.BridgeExternalRef').set({ isPrimary: false }).where({ bridge_ID, systemType }));
        }
        const newRef = {
            bridge_ID, systemType, externalId,
            externalURL: externalURL || null, description: description || null,
            isPrimary: isPrimary || false, isActive: true
        };
        const result = await db.run(INSERT.into('nhvr.BridgeExternalRef').entries(newRef));
        const newId = result.lastID || (Array.isArray(result) ? result[0] : null);
        if (isPrimary) {
            await db.run(UPDATE('nhvr.Bridge').set({
                primaryExternalSystem: systemType,
                primaryExternalId: externalId,
                primaryExternalURL: externalURL || null
            }).where({ ID: bridge_ID }));
        }
        await logAudit('CREATE', 'BridgeExternalRefs', externalId, bridge.name,
            `External ref added: ${systemType} ${externalId} for ${bridge.name}`, newRef, req);
        return { status: 'SUCCESS', message: 'External reference added', ID: newId };
    });

    // ── getInspectionsDue ─────────────────────────────────────────
    // Now derives "inspections due" from Bridge.nextInspectionDueDate
    // (computed by BridgeForm save logic) instead of from a dedicated
    // InspectionOrder workflow entity.
    srv.on('getInspectionsDue', async (req) => {
        const { daysAhead } = req.data;
        const db = await cds.connect.to('db');
        const today = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + (daysAhead || 90));
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const bridges = await db.run(
            SELECT.from('nhvr.Bridge')
                .columns('ID','bridgeId','name','region','state','condition','isActive',
                         'inspectionDate','nextInspectionDueDate')
                .where({ isActive: true })
        );
        const result = [];
        for (const b of bridges) {
            if (!b.nextInspectionDueDate || b.nextInspectionDueDate > cutoffStr) continue;
            const dueDate = new Date(b.nextInspectionDueDate);
            const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            result.push({
                bridgeId: b.bridgeId, bridgeName: b.name, region: b.region,
                lastInspection: b.inspectionDate || null,
                nextDue: b.nextInspectionDueDate,
                daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
                inspectionType: 'ROUTINE'
            });
        }
        return result.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    });

    // ── getOpenDefectsSummary ─────────────────────────────────────
    srv.on('getOpenDefectsSummary', async () => {
        const db = await cds.connect.to('db');
        const openDefects = await db.run(
            SELECT.from('nhvr.BridgeDefect').where({ status: { '!=': 'CLOSED' } })
                .columns('bridge_ID', 'severity', 'detectedDate')
        );
        const byBridge = {};
        for (const d of openDefects) {
            if (!byBridge[d.bridge_ID]) byBridge[d.bridge_ID] = { total: 0, critical: 0, high: 0, oldest: d.detectedDate };
            byBridge[d.bridge_ID].total++;
            if (d.severity === 'CRITICAL') byBridge[d.bridge_ID].critical++;
            if (d.severity === 'HIGH')     byBridge[d.bridge_ID].high++;
            if (d.detectedDate < byBridge[d.bridge_ID].oldest) byBridge[d.bridge_ID].oldest = d.detectedDate;
        }
        const result = [];
        const bridgeIds = Object.keys(byBridge);
        const bridgeRows = bridgeIds.length ? await db.run(
            SELECT.from('nhvr.Bridge').columns('ID','bridgeId','name','region','state').where({ ID: { in: bridgeIds } })
        ) : [];
        const bridgeMap = {};
        for (const b of bridgeRows) bridgeMap[b.ID] = b;
        for (const [bridgeId, stats] of Object.entries(byBridge)) {
            const bridge = bridgeMap[bridgeId];
            if (!bridge) continue;
            result.push({
                bridgeId: bridge.bridgeId, bridgeName: bridge.name, region: bridge.region,
                totalOpen: stats.total, criticalCount: stats.critical,
                highCount: stats.high, oldestDefectDate: stats.oldest
            });
        }
        return result.sort((a, b) => b.criticalCount - a.criticalCount || b.totalOpen - a.totalOpen);
    });

    // ── ingestSensorReading ───────────────────────────────────────
    srv.on('ingestSensorReading', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions');
        }
        const db = await cds.connect.to('db');
        const { deviceId, value, unit, readingAt } = req.data;
        if (value === undefined || value === null || isNaN(parseFloat(value))) {
            return req.reject(400, 'Sensor value must be numeric');
        }
        if (value < 0 || value > 1000) {
            return req.reject(400, 'Sensor value out of range (0-1000)');
        }
        const device = await db.run(SELECT.one.from('nhvr.SensorDevice').where({ deviceId }));
        if (!device) return req.error(404, `Sensor device '${deviceId}' not found`);
        let alertLevel = 'NORMAL';
        if (device.sensorType === 'LOAD_CELL'     && value > 80) alertLevel = 'WARNING';
        if (device.sensorType === 'LOAD_CELL'     && value > 95) alertLevel = 'CRITICAL';
        if (device.sensorType === 'WATER_LEVEL'   && value > 5)  alertLevel = 'WARNING';
        if (device.sensorType === 'WATER_LEVEL'   && value > 8)  alertLevel = 'CRITICAL';
        if (device.sensorType === 'CRACK_MONITOR' && value > 2)  alertLevel = 'WARNING';
        if (device.sensorType === 'CRACK_MONITOR' && value > 5)  alertLevel = 'CRITICAL';
        const reading = {
            ID: cds.utils.uuid(), device_ID: device.ID, bridge_ID: device.bridge_ID,
            readingAt: readingAt || new Date().toISOString(), value,
            unit: unit || device.unit, alertLevel
        };
        await db.run(INSERT.into('nhvr.SensorReading').entries(reading));
        await db.run(UPDATE('nhvr.SensorDevice').set({ lastReading: reading.readingAt, lastValue: value, alertLevel }).where({ ID: device.ID }));
        if (alertLevel !== 'NORMAL') {
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                ID: cds.utils.uuid(), entityName: 'SensorReading', entityId: reading.ID,
                action: 'ALERT', changedBy: 'system', changedAt: new Date().toISOString(),
                changeDescription: `${alertLevel} alert: ${device.sensorType} reading ${value} ${unit || device.unit}`
            }));
        }
        return reading;
    });

    // ── Document attachment upload handler ────────────────────────
    srv.before('CREATE', 'DocumentAttachments', async (req) => {
        const { fileName, mimeType, fileSize_kb, documentType, title } = req.data;

        if (!title) return req.reject(400, 'Document title is required');
        if (!documentType) return req.reject(400, 'Document type is required');

        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf', '.docx'];

        if (mimeType && !allowedTypes.includes(mimeType.toLowerCase())) {
            return req.reject(400, 'File type not allowed. Accepted: JPEG, PNG, PDF, DOCX');
        }

        if (fileName) {
            var ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
            if (!allowedExts.includes(ext)) {
                return req.reject(400, 'File extension not allowed. Accepted: ' + allowedExts.join(', '));
            }
        }

        if (fileSize_kb && fileSize_kb > 10240) {
            return req.reject(400, 'File size exceeds 10MB limit');
        }

        req.data.uploadedBy = req.user.id || 'unknown';
        if (!req.data.capturedAt) req.data.capturedAt = new Date().toISOString();
        if (!req.data.documentDate) req.data.documentDate = new Date().toISOString().split('T')[0];
    });

    srv.after('CREATE', 'DocumentAttachments', async (data, req) => {
        await logAudit('CREATE', 'DocumentAttachments', data.ID, data.title,
            `Document "${data.title}" (${data.documentType}) uploaded for bridge ${data.bridge_ID}`, data, req);
    });

    srv.after('DELETE', 'DocumentAttachments', async (data, req) => {
        await logAudit('DELETE', 'DocumentAttachments', req.params[0], '',
            'Document attachment deleted', null, req);
    });

    // ── classifyDefect (mock AI) ──────────────────────────────────
    srv.on('classifyDefect', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions');
        }
        const db = await cds.connect.to('db');
        const { defectId, photoUrl } = req.data;
        const defect = await getBridgeDefect(defectId, db);
        if (!defect) return req.error(404, 'Defect not found');
        const desc = (defect.description || '').toLowerCase();
        let aiCategory = 'CRACKING', aiSeverity = 'MEDIUM', confidence = 72;
        if      (desc.includes('spall') || desc.includes('concrete')) { aiCategory = 'SPALLING';     confidence = 85; }
        else if (desc.includes('rust')  || desc.includes('corros'))   { aiCategory = 'CORROSION';    aiSeverity = 'HIGH'; confidence = 91; }
        else if (desc.includes('scour') || desc.includes('water'))    { aiCategory = 'SCOUR';        aiSeverity = 'HIGH'; confidence = 78; }
        else if (desc.includes('joint') || desc.includes('seal'))     { aiCategory = 'JOINT_FAILURE'; confidence = 83; }
        else if (desc.includes('deform') || desc.includes('deflect')) { aiCategory = 'DEFORMATION';  aiSeverity = 'CRITICAL'; confidence = 88; }
        const result = {
            ID: cds.utils.uuid(), defect_ID: defectId, photoUrl: photoUrl || '',
            aiCategory, aiConfidence: confidence, aiSeverity,
            aiNotes: `AI analysis: ${aiCategory.toLowerCase().replace('_', ' ')} detected with ${confidence}% confidence.`,
            classifiedAt: new Date().toISOString(), classifiedBy: 'AI_MODEL_V1', humanReviewed: false
        };
        await db.run(INSERT.into('nhvr.DefectClassification').entries(result));
        return result;
    });
};
