'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-inspections');

module.exports = function registerInspectionHandlers(srv, helpers) {
    const { getBridge, getInspectionOrder, getBridgeDefect, logAudit } = helpers;

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

    // ── Referential integrity: BridgeDefects + InspectionOrders ──
    srv.before('CREATE', 'BridgeDefects', async (req) => {
        const { bridge_ID } = req.data;
        if (!bridge_ID) return req.error(400, 'bridge_ID is required');
        const db = await cds.connect.to('db');
        const exists = await db.run(SELECT.from('nhvr.Bridge').columns('ID').where({ ID: bridge_ID }).limit(1));
        if (!exists || exists.length === 0) return req.error(400, `Bridge with ID '${bridge_ID}' does not exist`);
    });

    srv.before('CREATE', 'InspectionOrders', async (req) => {
        const { bridge_ID } = req.data;
        if (!bridge_ID) return req.error(400, 'bridge_ID is required');
        const db = await cds.connect.to('db');
        const exists = await db.run(SELECT.from('nhvr.Bridge').columns('ID').where({ ID: bridge_ID }).limit(1));
        if (!exists || exists.length === 0) return req.error(400, `Bridge with ID '${bridge_ID}' does not exist`);
    });

    // ── Audit hooks for new entities ─────────────────────────────
    srv.after('CREATE', 'InspectionOrders', async (data, req) => {
        await logAudit('CREATE', 'InspectionOrders', data.orderNumber, data.orderNumber,
            `Inspection order ${data.orderNumber} created`, data, req);
    });
    srv.after('CREATE', 'BridgeDefects', async (data, req) => {
        await logAudit('CREATE', 'BridgeDefects', data.defectNumber || data.ID, data.defectCategory,
            `Defect raised: ${data.severity} ${data.defectCategory}`, data, req);
    });
    srv.after('CREATE', 'BridgeExternalRefs', async (data, req) => {
        await logAudit('CREATE', 'BridgeExternalRefs', data.externalId, data.systemType,
            `External ref ${data.systemType}:${data.externalId} added`, data, req);
    });

    // ── createInspectionOrder ─────────────────────────────────────
    srv.on('createInspectionOrder', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin'))
            return req.error(403, 'Insufficient privileges for this operation');
        const { bridge_ID, orderNumber, inspectionType, plannedDate, inspector,
                inspectorOrg, accessMethod, ratingMethod, notes } = req.data;
        if (!bridge_ID || !orderNumber || !plannedDate)
            return req.error(400, 'bridge_ID, orderNumber, and plannedDate are required');
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridge_ID, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const newOrder = {
            bridge_ID, orderNumber,
            inspectionType: inspectionType || 'ROUTINE',
            status: 'PLANNED', plannedDate,
            inspector: inspector || '', inspectorOrg: inspectorOrg || '',
            accessMethod: accessMethod || null, ratingMethod: ratingMethod || null,
            notes: notes || ''
        };
        const result = await db.run(INSERT.into('nhvr.InspectionOrder').entries(newOrder));
        const newId = result.lastID || (Array.isArray(result) ? result[0] : null);
        await logAudit('CREATE', 'InspectionOrders', orderNumber, bridge.name,
            `Inspection order ${orderNumber} created for bridge ${bridge.name}`, newOrder, req);
        return { status: 'SUCCESS', message: `Inspection order ${orderNumber} created`, ID: newId };
    });

    // ── startInspection ───────────────────────────────────────────
    srv.on('startInspection', 'InspectionOrders', async (req) => {
        const _op = req.params[0];
        const orderId = (typeof _op === 'object' && _op !== null) ? (_op.ID || Object.values(_op)[0]) : _op;
        const db = await cds.connect.to('db');
        const order = await getInspectionOrder(orderId, db);
        if (!order) return req.error(404, 'Inspection order not found');
        if (order.status !== 'PLANNED') return req.error(400, `Cannot start inspection in status: ${order.status}`);
        await db.run(UPDATE('nhvr.InspectionOrder').set({ status: 'IN_PROGRESS', startedAt: new Date().toISOString() }).where({ ID: orderId }));
        await logAudit('ACTION', 'InspectionOrders', order.orderNumber, order.orderNumber,
            `Inspection started: ${order.orderNumber}`, null, req);
        return { status: 'SUCCESS', message: 'Inspection started' };
    });

    // ── completeInspection ────────────────────────────────────────
    srv.on('completeInspection', 'InspectionOrders', async (req) => {
        const _op = req.params[0];
        const orderId = (typeof _op === 'object' && _op !== null) ? (_op.ID || Object.values(_op)[0]) : _op;
        const { overallConditionRating, structuralAdequacy, maintenanceUrgency,
                recommendations, reportRef, nextInspectionDue, notes } = req.data;
        const db = await cds.connect.to('db');
        const order = await getInspectionOrder(orderId, db);
        if (!order) return req.error(404, 'Inspection order not found');
        if (order.status === 'COMPLETED' || order.status === 'PENDING_REVIEW') return req.error(400, 'Inspection is already completed');
        if (overallConditionRating !== undefined && (overallConditionRating < 1 || overallConditionRating > 10))
            return req.error(400, 'Condition rating must be between 1 and 10');
        const VALID_URGENCY = ['IMMEDIATE', 'URGENT', 'ROUTINE', 'MONITOR', 'NONE'];
        if (maintenanceUrgency !== undefined && maintenanceUrgency !== null && !VALID_URGENCY.includes(maintenanceUrgency))
            return req.error(400, `maintenanceUrgency must be one of: ${VALID_URGENCY.join(', ')}`);
        // Transition to PENDING_REVIEW instead of COMPLETED — requires manager approval
        await db.run(UPDATE('nhvr.InspectionOrder').set({
            status: 'PENDING_REVIEW', completedAt: new Date().toISOString(),
            overallConditionRating: overallConditionRating || null,
            structuralAdequacy: structuralAdequacy || null,
            maintenanceUrgency: maintenanceUrgency || null,
            recommendations: recommendations || null,
            reportRef: reportRef || null,
            nextInspectionDue: nextInspectionDue || null,
            notes: notes || null
        }).where({ ID: orderId }));
        await logAudit('ACTION', 'InspectionOrders', order.orderNumber, order.orderNumber,
            `Inspection submitted for review: ${order.orderNumber}. Rating: ${overallConditionRating || 'N/A'}`,
            { overallConditionRating, structuralAdequacy }, req);
        return { status: 'SUCCESS', message: 'Inspection submitted for review' };
    });

    // ── reviewInspection ───────────────────────────────────────────
    srv.on('reviewInspection', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Only BridgeManager or Admin can review inspections');
        }
        const { inspectionOrderId, decision, notes } = req.data;
        const db = await cds.connect.to('db');

        const order = await getInspectionOrder(inspectionOrderId, db);
        if (!order) return req.error(404, 'Inspection order not found');
        if (order.status !== 'PENDING_REVIEW') {
            return req.error(400, 'Only PENDING_REVIEW inspections can be reviewed');
        }

        const validDecisions = ['APPROVED', 'REJECTED', 'NEEDS_REVISION'];
        if (!validDecisions.includes(decision)) {
            return req.error(400, 'Decision must be APPROVED, REJECTED, or NEEDS_REVISION');
        }

        const updates = {
            reviewedBy: req.user.id || 'unknown',
            reviewedAt: new Date().toISOString(),
            reviewNotes: notes || '',
            reviewDecision: decision
        };

        if (decision === 'APPROVED') {
            updates.status = 'COMPLETED';
            updates.completedAt = new Date().toISOString();
            // Update bridge condition rating if overallConditionRating was set
            if (order.overallConditionRating && order.bridge_ID) {
                await db.run(UPDATE('nhvr.Bridge').set({
                    conditionRating: order.overallConditionRating,
                    inspectionDate: new Date().toISOString().split('T')[0]
                }).where({ ID: order.bridge_ID }));
            }
        } else if (decision === 'REJECTED' || decision === 'NEEDS_REVISION') {
            updates.status = 'IN_PROGRESS';
        }

        await db.run(UPDATE('nhvr.InspectionOrder').where({ ID: inspectionOrderId }).set(updates));

        await logAudit('ACTION', 'InspectionOrders', order.orderNumber, order.orderNumber,
            `Inspection reviewed: ${decision} by ${updates.reviewedBy}`,
            { decision, notes }, req);

        return { status: updates.status, decision: decision, message: 'Inspection review recorded' };
    });

    // ── raiseDefect ───────────────────────────────────────────────
    srv.on('raiseDefect', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin'))
            return req.error(403, 'Insufficient privileges for this operation');
        const { bridge_ID, inspectionOrder_ID, defectCategory, severity, extent,
                structuralRisk, priority, description, elementGroup, elementName, location } = req.data;
        if (!bridge_ID || !defectCategory || !severity || !description)
            return req.error(400, 'bridge_ID, defectCategory, severity, and description are required');
        // Enum validation for severity and defectCategory
        const VALID_SEVERITIES = ['CRITICAL','HIGH','MEDIUM','LOW'];
        if (!VALID_SEVERITIES.includes(severity))
            return req.error(400, `Invalid severity: '${severity}'. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
        const VALID_CATEGORIES = ['STRUCTURAL','STRUCTURAL_CRACKING','DECK','SUBSTRUCTURE','SUPERSTRUCTURE','BEARING','JOINT','DRAINAGE','SCOUR','SCOUR_EROSION','APPROACH','RAILING','WEARING_SURFACE','SURFACE_DETERIORATION','CRACKING','SPALLING','CORROSION','SAFETY','FATIGUE','SETTLEMENT','EROSION','IMPACT_DAMAGE','OVERLOAD','SERVICEABILITY','DURABILITY','FUNCTIONALITY','ENVIRONMENTAL','OTHER'];
        if (!VALID_CATEGORIES.includes(defectCategory))
            return req.error(400, `Invalid defectCategory: '${defectCategory}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridge_ID, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const existingCount = await db.run(SELECT.from('nhvr.BridgeDefect').where({ bridge_ID }));
        const defectNumber = `D-${bridge.bridgeId}-${String((existingCount.length || 0) + 1).padStart(3, '0')}`;
        const newDefect = {
            bridge_ID, inspectionOrder_ID: inspectionOrder_ID || null,
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
    srv.on('getInspectionsDue', async (req) => {
        const { daysAhead } = req.data;
        const db = await cds.connect.to('db');
        const today = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + (daysAhead || 90));
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const orders = await db.run(
            SELECT.from('nhvr.InspectionOrder').where({ status: 'COMPLETED' })
                .columns('bridge_ID', 'nextInspectionDue', 'inspectionType', 'completedAt')
        );
        const latestByBridge = {};
        for (const o of orders) {
            if (!o.nextInspectionDue) continue;
            if (!latestByBridge[o.bridge_ID] || o.completedAt > latestByBridge[o.bridge_ID].completedAt)
                latestByBridge[o.bridge_ID] = o;
        }
        const dueEntries = Object.entries(latestByBridge).filter(([, order]) => order.nextInspectionDue <= cutoffStr);
        const bridgeIds = dueEntries.map(([id]) => id);
        const bridgesData = bridgeIds.length
            ? await db.run(SELECT.from('nhvr.Bridge').columns('ID','bridgeId','name','state','condition','isActive','region')
                .where({ ID: { in: bridgeIds } }))
            : [];
        const bridgeMap = {};
        bridgesData.forEach(b => { bridgeMap[b.ID] = b; });
        const result = [];
        for (const [bridgeId, order] of dueEntries) {
            const bridge = bridgeMap[bridgeId];
            if (!bridge || !bridge.isActive) continue;
            const dueDate = new Date(order.nextInspectionDue);
            const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            result.push({
                bridgeId: bridge.bridgeId, bridgeName: bridge.name, region: bridge.region,
                lastInspection: order.completedAt ? order.completedAt.split('T')[0] : null,
                nextDue: order.nextInspectionDue,
                daysOverdue: daysOverdue > 0 ? daysOverdue : 0,
                inspectionType: order.inspectionType
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
        // Batch fetch all bridges instead of N+1 queries
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

    // ── raiseDefectFromMeasurement ────────────────────────────────
    srv.on('raiseDefectFromMeasurement', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions');
        }
        const { measurementDocId } = req.data;
        const db = await cds.connect.to('db');
        const md = await db.run(SELECT.one.from('nhvr.MeasurementDocument').where({ ID: measurementDocId }));
        if (!md) return req.error(404, 'Measurement document not found');
        const bridge = await getBridge(md.bridge_ID, db);
        const stateCode = ((bridge && bridge.state) || 'NSW').substring(0, 3).toUpperCase();
        const year = new Date().getFullYear();
        const countResult = await db.run(SELECT.one`count(*) as cnt`.from('nhvr.BridgeDefect'));
        const seq = String(((countResult?.cnt) || 0) + 1).padStart(4, '0');
        const defectNumber = `DEF-${stateCode}-${year}-${seq}`;
        const defect = {
            ID: cds.utils.uuid(), bridge_ID: md.bridge_ID, defectNumber,
            defectTitle: md.notes || `Defect from MD ${md.ID}`,
            defectCategory: 'STRUCTURAL', severity: 'MEDIUM', status: 'OPEN',
            description: md.notes || `Auto-raised from Measurement Document ${md.ID}`,
            detectedDate: new Date().toISOString().substring(0, 10),
            notes: `Auto-raised from Measurement Document ${md.ID}`
        };
        await db.run(INSERT.into('nhvr.BridgeDefect').entries(defect));
        return defect;
    });

    // ── createWorkOrder ───────────────────────────────────────────
    srv.on('createWorkOrder', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions');
        }
        const { defectId, priority, plannedDate, assignedTo, notes } = req.data;
        const db = await cds.connect.to('db');
        const defect = await getBridgeDefect(defectId, db);
        if (!defect) return req.error(404, 'Defect not found');
        const woNumber = 'WO-' + Date.now().toString().slice(-8);
        const wo = {
            ID: cds.utils.uuid(), defect_ID: defectId, bridge_ID: defect.bridge_ID,
            woNumber, priority: priority || 'MEDIUM', status: 'CREATED',
            plannedDate, assignedTo, notes
        };
        const tx = cds.tx(req);
        try {
            await tx.run(INSERT.into('nhvr.WorkOrder').entries(wo));
            await tx.run(UPDATE('nhvr.BridgeDefect').set({ status: 'WORK_ORDER_RAISED' }).where({ ID: defectId }));
            try {
                await tx.run(INSERT.into('nhvr.AuditLog').entries({
                    ID: cds.utils.uuid(), entityName: 'WorkOrder', entityId: wo.ID,
                    action: 'CREATE', changedBy: req.user?.id || 'system',
                    changedAt: new Date().toISOString(),
                    changeDescription: `Work order ${woNumber} created for defect`
                }));
            } catch (e) { LOG.warn('[NHVR] AuditLog write failed for WorkOrder CREATE:', e.message); }
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.reject(500, `Work order creation failed: ${e.message}. All changes rolled back.`);
        }
        return wo;
    });

    // ── ingestSensorReading ───────────────────────────────────────
    srv.on('ingestSensorReading', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions');
        }
        const db = await cds.connect.to('db');
        const { deviceId, value, unit, readingAt } = req.data;
        // Input validation — sensor value must be numeric and within range
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

        // Validate required fields
        if (!title) return req.reject(400, 'Document title is required');
        if (!documentType) return req.reject(400, 'Document type is required');

        // Validate file type
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

        // Validate file size (10MB max = 10240 KB)
        if (fileSize_kb && fileSize_kb > 10240) {
            return req.reject(400, 'File size exceeds 10MB limit');
        }

        // Set upload metadata
        req.data.uploadedBy = req.user.id || 'unknown';
        if (!req.data.capturedAt) {
            req.data.capturedAt = new Date().toISOString();
        }
        if (!req.data.documentDate) {
            req.data.documentDate = new Date().toISOString().split('T')[0];
        }
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
