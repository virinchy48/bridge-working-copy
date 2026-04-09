'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-bridges');

module.exports = function registerBridgeHandlers(srv, helpers) {
    const { getBridge, getBridgeByKey, logAudit, writeHistory, updateBridgePostingStatus, validateEnum } = helpers;

    const SENSITIVE_BRIDGE_FIELDS = ['conditionRating', 'conditionScore'];

    // ─────────────────────────────────────────────────────────
    // AFTER READ — Server-Side Field Masking (RK-01)
    // Sensitive fields are nulled for users without BridgeManager or Admin role.
    // Fields masked: conditionRating, conditionScore
    // conditionLabel (condition) remains visible to all — operational necessity.
    // ─────────────────────────────────────────────────────────
    srv.after('READ', 'Bridges', (data, req) => {
        // Privileged system operations and BridgeManager/Admin see all fields
        if (!req.user || req.user.is('BridgeManager') || req.user.is('Admin')) return;

        const mask = (record) => {
            if (!record) return;
            SENSITIVE_BRIDGE_FIELDS.forEach(f => { record[f] = null; });
        };

        if (Array.isArray(data)) data.forEach(mask);
        else mask(data);
    });

    // ─────────────────────────────────────────────────────────
    // BEFORE HOOKS - Validation
    // ─────────────────────────────────────────────────────────

    srv.before(['CREATE', 'UPDATE'], 'Bridges', async (req) => {
        const data = req.data;
        const errors = [];
        if (data.latitude !== undefined && data.latitude !== null) {
            if (data.latitude < -90 || data.latitude > 90)
                errors.push('Latitude must be between -90 and 90');
        }
        if (data.longitude !== undefined && data.longitude !== null) {
            if (data.longitude < -180 || data.longitude > 180)
                errors.push('Longitude must be between -180 and 180');
        }
        if (data.conditionScore !== undefined && data.conditionScore !== null) {
            if (data.conditionScore < 0 || data.conditionScore > 100)
                errors.push('Condition Score must be between 0 and 100');
        }
        // yearBuilt realistic range [1800, 2100]
        if (data.yearBuilt !== undefined && data.yearBuilt !== null) {
            const y = parseInt(data.yearBuilt);
            if (!Number.isInteger(y) || y < 1800 || y > 2100)
                errors.push('Year Built must be an integer between 1800 and 2100');
        }
        // conditionRating 1-10 (AS 5100 scale) — auto-derive condition label
        if (data.conditionRating !== undefined && data.conditionRating !== null) {
            const rating = parseInt(data.conditionRating);
            if (!Number.isInteger(rating) || rating < 1 || rating > 10)
                errors.push('Condition Rating must be an integer between 1 and 10');
            else if (!data.condition) {
                const ratingMap = { 10:'EXCELLENT',9:'VERY_GOOD',8:'GOOD',7:'GOOD',
                                    6:'FAIR',5:'FAIR',4:'POOR',3:'POOR',2:'VERY_POOR',1:'FAILED' };
                data.condition = ratingMap[rating] || 'FAIR';
            }
        }
        // Enum validation — condition and postingStatus
        const VALID_CONDITIONS = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR', 'VERY_POOR', 'CRITICAL', 'FAILED', 'UNKNOWN'];
        const VALID_POSTING = ['UNRESTRICTED', 'POSTED', 'CLOSED', 'REDUCED'];
        try {
            if (data.condition) validateEnum(data.condition, VALID_CONDITIONS, 'condition');
            if (data.postingStatus) validateEnum(data.postingStatus, VALID_POSTING, 'postingStatus');
        } catch (e) {
            errors.push(e.message);
        }
        if (req.event === 'CREATE' && !data.postingStatus) {
            data.postingStatus = 'UNRESTRICTED';
        }
        // Rule: bridgeId must be unique on CREATE
        if (req.event === 'CREATE' && data.bridgeId) {
            const db = await cds.connect.to('db');
            const exists = await db.run(
                SELECT.from('nhvr.Bridge').columns('ID').where({ bridgeId: data.bridgeId }).limit(1)
            );
            if (exists && exists.length > 0) {
                errors.push(`Bridge ID '${data.bridgeId}' already exists. Bridge IDs must be unique.`);
            }
        }
        // Required field validation
        if (req.event === 'CREATE') {
            if (!data.name || !String(data.name).trim())
                errors.push('Bridge name is required');
        }
        // Dimension range checks (must be positive if provided)
        const posDims = ['clearanceHeightM','spanLengthM','deckWidthM','totalLengthM','widthM'];
        for (const dim of posDims) {
            if (data[dim] !== undefined && data[dim] !== null && parseFloat(data[dim]) < 0)
                errors.push(`${dim} must be a positive value`);
        }
        if (data.numberOfSpans !== undefined && data.numberOfSpans !== null && parseInt(data.numberOfSpans) < 0)
            errors.push('Number of spans must be non-negative');
        if (data.numberOfLanes !== undefined && data.numberOfLanes !== null && parseInt(data.numberOfLanes) < 0)
            errors.push('Number of lanes must be non-negative');
        if (data.aadtVehicles !== undefined && data.aadtVehicles !== null && parseInt(data.aadtVehicles) < 0)
            errors.push('AADT vehicles must be non-negative');
        // Scour risk enum
        const VALID_SCOUR = ['LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN'];
        if (data.scourRisk && !VALID_SCOUR.includes(data.scourRisk))
            errors.push(`Invalid scourRisk: '${data.scourRisk}'. Must be one of: ${VALID_SCOUR.join(', ')}`);
        if (errors.length) return req.error(400, errors.join('; '));
    });

    // ── Optimistic locking: version check on Bridge UPDATE ─────────────
    srv.before('UPDATE', 'Bridges', async (req) => {
        if (req.data.version !== undefined) {
            const db = await cds.connect.to('db');
            const current = await db.run(SELECT.one.from('nhvr.Bridge').where({ ID: req.data.ID }).columns('version'));
            if (current && current.version !== req.data.version) {
                return req.reject(409, 'Record modified by another user. Please refresh and retry.', 'version');
            }
            req.data.version = (current ? current.version : 0) + 1;
        }
    });

    // ── Business rules before Bridge CREATE/UPDATE ────────────────────
    srv.before(['CREATE', 'UPDATE'], 'Bridges', async (req) => {
        const b = req.data;
        // Rule 1: Structurally deficient bridges should not be UNRESTRICTED
        if (b.structuralDeficiencyFlag === true && b.postingStatus === 'UNRESTRICTED') {
            req.warn('Bridge is Structurally Deficient but posting status is UNRESTRICTED — please verify');
        }
        // Rule 4: Low condition rating → set highPriorityAsset
        if (b.conditionRating != null && b.conditionRating <= 4) {
            req.data.highPriorityAsset = true;
        }
        // Rule 6: Compute nextInspectionDueDate from lastPrincipalInspDate + inspectionFrequencyYrs
        if (b.lastPrincipalInspDate && b.inspectionFrequencyYrs) {
            const d = new Date(b.lastPrincipalInspDate);
            d.setFullYear(d.getFullYear() + b.inspectionFrequencyYrs);
            req.data.nextInspectionDueDate = d.toISOString().substring(0, 10);
        }
    });

    // ─────────────────────────────────────────────────────────
    // AFTER HOOKS - Post-processing + Audit Logging
    // ─────────────────────────────────────────────────────────

    srv.after('CREATE', 'Bridges', async (data, req) => {
        await logAudit('CREATE', 'Bridges', data.bridgeId, data.name,
            `Bridge "${data.name}" (${data.bridgeId}) created`, data, req);
        await writeHistory(data.ID, 'BRIDGE_CREATED',
            `Bridge created: ${data.name}`,
            `${data.state || ''} | ${data.structureType || ''} | ${data.postingStatus || ''}`,
            { effectiveFrom: new Date().toISOString().split('T')[0],
              statusAfter: data.postingStatus, relatedEntityType: 'Bridge', relatedEntityId: data.bridgeId }, req);
    });

    srv.after('UPDATE', 'Bridges', async (data, req) => {
        await logAudit('UPDATE', 'Bridges', data.bridgeId || req.data.bridgeId, data.name || req.data.name,
            `Bridge "${data.name || req.data.name}" updated`, req.data, req);
        const changedFields = Object.keys(req.data || {}).join(', ');
        const isConditionChange = req.data.conditionRating !== undefined || req.data.condition || req.data.postingStatus;
        const eventType = isConditionChange ? 'CONDITION_UPDATED' : 'BRIDGE_UPDATED';
        await writeHistory(data.ID || req.params?.[0], eventType,
            isConditionChange
                ? `Condition updated — Rating: ${req.data.conditionRating || '—'}, Status: ${req.data.postingStatus || data.postingStatus || '—'}`
                : 'Bridge record updated',
            `Fields changed: ${changedFields}`,
            { statusBefore: data.postingStatus, statusAfter: req.data.postingStatus || data.postingStatus,
              relatedEntityType: 'Bridge', relatedEntityId: data.bridgeId || req.data.bridgeId }, req);
    });

    srv.after('DELETE', 'Bridges', async (data, req) => {
        await logAudit('DELETE', 'Bridges', req.params[0], '',
            `Bridge deleted (ID: ${req.params[0]})`, null, req);
    });

    // ── Computed fields on Bridge after READ/QUERY ────────────────────
    srv.after(['READ', 'QUERY'], 'Bridges', (results) => {
        const currentYear = new Date().getFullYear();
        const today = new Date();
        const arr = Array.isArray(results) ? results : (results ? [results] : []);
        arr.forEach(b => {
            if (!b) return;
            // Remaining useful life
            if (b.designLife && b.yearBuilt) {
                const baseYear = b.yearLastMajorRehab || b.yearBuilt;
                b.remainingUsefulLifeYrs = Math.max(0, b.designLife - (currentYear - baseYear));
            }
            // Risk score computation (if not set manually)
            if (!b.currentRiskScore && b.conditionRating != null) {
                const scourW = { CRITICAL: 6, HIGH: 4, MEDIUM: 2, LOW: 0 }[b.scourRisk] || 0;
                const floodW = b.floodImpacted ? 2 : 0;
                const defW = b.structuralDeficiencyFlag ? 4 : 0;
                b.currentRiskScore = Math.min(25, (10 - Math.min(b.conditionRating, 10)) * 2 + scourW + floodW + defW);
            }
            // Risk band from score
            if (b.currentRiskScore != null && !b.currentRiskBand) {
                const s = b.currentRiskScore;
                b.currentRiskBand = s >= 20 ? 'CRITICAL' : s >= 16 ? 'VERY_HIGH' : s >= 11 ? 'HIGH' : s >= 7 ? 'MEDIUM' : 'LOW';
            }
            // Overdue inspection flag
            if (b.nextInspectionDueDate) {
                const due = new Date(b.nextInspectionDueDate);
                b.overdueFlag = today > due;
                b.daysOverdue = b.overdueFlag ? Math.floor((today - due) / 86400000) : 0;
            }
        });
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: changeCondition
    // ─────────────────────────────────────────────────────────
    srv.on('changeCondition', 'Bridges', async (req) => {
        const { conditionValue, score } = req.data;
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        const validConditions = ['EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR', 'VERY_POOR', 'CRITICAL', 'FAILED', 'UNKNOWN'];
        if (!validConditions.includes(conditionValue)) {
            return req.error(400, `Invalid condition. Must be one of: ${validConditions.join(', ')}`);
        }
        if (score !== undefined && score !== null && (score < 0 || score > 100)) {
            return req.error(400, 'conditionScore must be between 0 and 100');
        }
        const db = await cds.connect.to('db');
        const existing = await getBridge(bridgeId, db);
        if (!existing) return req.error(404, 'Bridge not found');
        await db.run(
            UPDATE('nhvr.Bridge')
                .set({ condition: conditionValue, conditionScore: score || null, inspectionDate: new Date().toISOString().split('T')[0] })
                .where({ ID: bridgeId })
        );
        // Log condition history
        if (existing) {
            await db.run(INSERT.into('nhvr.BridgeConditionHistory').entries({
                bridge_ID     : bridgeId,
                changedAt     : new Date().toISOString(),
                oldCondition  : existing.condition,
                newCondition  : conditionValue,
                conditionScore: score || null,
                changedBy     : req.user ? req.user.id : 'system',
                notes         : `Condition changed from ${existing.condition} to ${conditionValue}`
            }));
        }
        await logAudit('ACTION', 'Bridges', existing ? existing.bridgeId : bridgeId,
            existing ? existing.name : '', `Condition changed to ${conditionValue}`,
            { conditionValue, score }, req);
        const updated = await getBridge(bridgeId, db);
        return updated;
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: closeForTraffic
    // ─────────────────────────────────────────────────────────
    srv.on('closeForTraffic', 'Bridges', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin') && !req.user.is('Inspector')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        await db.run(UPDATE('nhvr.Bridge').set({ postingStatus: 'CLOSED' }).where({ ID: bridgeId }));
        await logAudit('ACTION', 'Bridges', bridge ? bridge.bridgeId : bridgeId,
            bridge ? bridge.name : '', `Bridge closed for traffic`, null, req);
        return await getBridge(bridgeId, db);
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: reopenForTraffic
    // ─────────────────────────────────────────────────────────
    srv.on('reopenForTraffic', 'Bridges', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin') && !req.user.is('Inspector')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        const activeRestrictions = await db.run(
            SELECT.from('nhvr.Restriction').where({ bridge_ID: bridgeId, status: 'ACTIVE', isActive: true })
        );
        const newStatus = activeRestrictions.length > 0 ? 'POSTED' : 'UNRESTRICTED';
        await db.run(UPDATE('nhvr.Bridge').set({ postingStatus: newStatus }).where({ ID: bridgeId }));
        await logAudit('ACTION', 'Bridges', bridge ? bridge.bridgeId : bridgeId,
            bridge ? bridge.name : '', `Bridge reopened for traffic (status: ${newStatus})`, null, req);
        return await getBridge(bridgeId, db);
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: closeBridge (with reason + approval — rich version)
    // ─────────────────────────────────────────────────────────
    srv.on('closeBridge', 'Bridges', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const { reason, effectiveFrom, expectedReopenDate, approvalRef } = req.data;
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        if (!reason)        return req.error(400, 'Closure reason is required');
        if (!effectiveFrom) return req.error(400, 'Effective date is required');
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const statusBefore = bridge.postingStatus;
        await db.run(UPDATE('nhvr.Bridge').set({ postingStatus: 'CLOSED' }).where({ ID: bridgeId }));
        await writeHistory(bridgeId, 'BRIDGE_CLOSED', 'Bridge Closed',
            `${reason}${approvalRef ? ' | Approval: ' + approvalRef : ''}${expectedReopenDate ? ' | Expected reopening: ' + expectedReopenDate : ''}`,
            { effectiveFrom, effectiveTo: expectedReopenDate, statusBefore, statusAfter: 'CLOSED',
              approvalRef, relatedEntityType: 'Bridge', relatedEntityId: bridge.bridgeId }, req);
        await logAudit('ACTION', 'Bridges', bridge.bridgeId, bridge.name,
            `Bridge closed: ${reason}`, { reason, approvalRef }, req, { critical: true });
        return { status: 'SUCCESS', message: 'Bridge closed successfully' };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: reopenBridge (with reason + approval — rich version)
    // ─────────────────────────────────────────────────────────
    srv.on('reopenBridge', 'Bridges', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const { reason, effectiveDate, approvalRef, inspectionRef } = req.data;
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        if (!reason)        return req.error(400, 'Reopening reason is required');
        if (!effectiveDate) return req.error(400, 'Effective date is required');
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const statusBefore = bridge.postingStatus;
        const activeRestrictions = await db.run(
            SELECT.from('nhvr.Restriction').where({ bridge_ID: bridgeId, status: 'ACTIVE', isActive: true })
        );
        const newStatus = activeRestrictions.length > 0 ? 'POSTED' : 'UNRESTRICTED';
        await db.run(UPDATE('nhvr.Bridge').set({ postingStatus: newStatus }).where({ ID: bridgeId }));
        await writeHistory(bridgeId, 'BRIDGE_REOPENED', 'Bridge Reopened',
            `${reason}${inspectionRef ? ' | Inspection ref: ' + inspectionRef : ''}${approvalRef ? ' | Approval: ' + approvalRef : ''}`,
            { effectiveFrom: effectiveDate, statusBefore, statusAfter: newStatus,
              approvalRef, relatedEntityType: 'Bridge', relatedEntityId: bridge.bridgeId }, req);
        await logAudit('ACTION', 'Bridges', bridge.bridgeId, bridge.name,
            `Bridge reopened: ${reason}`, { reason, approvalRef, inspectionRef }, req, { critical: true });
        return { status: 'SUCCESS', message: `Bridge reopened (status: ${newStatus})` };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: addRestriction (on Bridges entity — full standard restriction)
    // ─────────────────────────────────────────────────────────
    srv.on('addRestriction', 'Bridges', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin')) {
            return req.reject(403, 'Insufficient permissions to add restrictions');
        }
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        const { restrictionType, value, unit, vehicleClass_ID, vehicleClassLabel,
                validFromDate, validToDate, status, permitRequired, directionApplied,
                gazetteRef, nhvrPermitClass, exceptionsAllowed, signageRequired,
                signageType, enforcementAuthority, notes } = req.data;
        if (!restrictionType) return req.error(400, 'restrictionType is required');
        if (value !== undefined && value !== null && restrictionType !== 'VEHICLE_TYPE' && parseFloat(value) <= 0)
            return req.error(400, 'Restriction value must be greater than 0');
        if (!status) req.data.status = 'ACTIVE';
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const newRestriction = {
            ID               : cds.utils.uuid(),
            bridge_ID        : bridgeId,
            restrictionType  : restrictionType,
            value            : value !== undefined ? parseFloat(value) : null,
            unit             : unit || null,
            vehicleClass_ID  : vehicleClass_ID || null,
            vehicleClassLabel: vehicleClassLabel || null,
            validFromDate    : validFromDate || null,
            validToDate      : validToDate || null,
            status           : status || 'ACTIVE',
            permitRequired   : permitRequired || false,
            isActive         : true,
            directionApplied : directionApplied || 'BOTH',
            gazetteRef       : gazetteRef || null,
            nhvrPermitClass  : nhvrPermitClass || null,
            exceptionsAllowed: exceptionsAllowed || null,
            signageRequired  : signageRequired || false,
            signageType      : signageType || null,
            enforcementAuthority: enforcementAuthority || null,
            notes            : notes || null
        };
        const newId = newRestriction.ID;
        await db.run(INSERT.into('nhvr.Restriction').entries(newRestriction));
        await updateBridgePostingStatus(bridgeId);
        const label = restrictionType === 'VEHICLE_TYPE'
            ? `VEHICLE_TYPE: ${vehicleClassLabel || ''}`
            : `${restrictionType}: ${value} ${unit}`;
        await writeHistory(bridgeId, 'RESTRICTION_ADDED', `Restriction added: ${label}`,
            `${vehicleClassLabel || 'All vehicles'} | ${validFromDate || '—'} → ${validToDate || 'Ongoing'}${permitRequired ? ' | Permit Required' : ''}`,
            { statusAfter: status || 'ACTIVE', gazetteRef,
              relatedEntityType: 'Restriction', relatedEntityId: String(newId || '') }, req);
        await logAudit('CREATE', 'Restrictions', label, bridge.name,
            `Restriction added: ${label}`, newRestriction, req, { critical: true });
        return { status: 'SUCCESS', message: `Restriction added: ${label}`, ID: newId };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: applyTemporaryRestriction
    // ─────────────────────────────────────────────────────────
    srv.on('applyTemporaryRestriction', 'Bridges', async (req) => {
        const _p = req.params[0]; const bridgeId = typeof _p === "object" ? (_p.ID || Object.values(_p)[0]) : _p;
        const { restrictionType, value, unit, vehicleClass_ID, validFromDate, validToDate, notes, permitRequired } = req.data;

        if (!restrictionType || !value || !unit) {
            return req.error(400, 'restrictionType, value, and unit are required');
        }
        if (!validFromDate || !validToDate) {
            return req.error(400, 'validFromDate and validToDate are required for temporary restrictions');
        }
        if (new Date(validFromDate) > new Date(validToDate)) {
            return req.error(400, 'validFromDate must be before validToDate');
        }
        const validUnits = {
            'HEIGHT': ['m'], 'MASS': ['t'], 'WIDTH': ['m'],
            'SPEED': ['km/h'], 'AXLE_MASS': ['t'], 'COMBINATION_MASS': ['t']
        };
        const allowedUnits = validUnits[restrictionType];
        if (allowedUnits && !allowedUnits.includes(unit)) {
            return req.error(400,
                `Invalid unit "${unit}" for restriction type "${restrictionType}". Expected: ${allowedUnits.join(', ')}`);
        }

        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');

        const newRestriction = {
            bridge_ID      : bridgeId,
            restrictionType: restrictionType,
            value          : parseFloat(value),
            unit           : unit,
            vehicleClass_ID: vehicleClass_ID || null,
            validFromDate  : validFromDate,
            validToDate    : validToDate,
            status         : new Date(validFromDate) > new Date() ? 'SCHEDULED' : 'ACTIVE',
            permitRequired : permitRequired || false,
            isActive       : true,
            notes          : notes || `Temporary restriction applied by ${req.user ? req.user.id : 'operator'}`
        };

        await db.run(INSERT.into('nhvr.Restriction').entries(newRestriction));
        await updateBridgePostingStatus(bridgeId);

        await logAudit('ACTION', 'Bridges', bridge.bridgeId, bridge.name,
            `Temporary ${restrictionType} restriction (${value} ${unit}) applied from ${validFromDate} to ${validToDate}`,
            newRestriction, req);

        return {
            status : 'SUCCESS',
            message: `Temporary ${restrictionType} restriction applied successfully`
        };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: massDownloadBridges
    // ─────────────────────────────────────────────────────────
    srv.on('massDownloadBridges', async (req) => {
        const { region, state, routeCode } = req.data;
        const db = await cds.connect.to('db');
        const where = { isActive: true };
        if (region) where.region = region;
        if (state)  where.state  = state;
        let bridges = await db.run(SELECT.from('nhvr.Bridge').where(where));
        if (routeCode) {
            const route = await db.run(SELECT.one.from('nhvr.Route').where({ routeCode }));
            bridges = route ? bridges.filter(b => b.route_ID === route.ID) : [];
        }
        const routes = await db.run(SELECT.from('nhvr.Route').columns('ID', 'routeCode'));
        const routeById = {};
        routes.forEach(r => { routeById[r.ID] = r.routeCode; });
        const headers = ['bridgeId','name','region','state','structureType','material','yearBuilt',
            'latitude','longitude','routeCode','routeKm','spanLengthM','deckWidthM','clearanceHeightM',
            'condition','conditionScore','inspectionDate','postingStatus'];
        const csvLines = [headers.join(',')];
        for (const b of bridges) {
            csvLines.push([
                b.bridgeId||'', `"${(b.name||'').replace(/"/g,'""')}"`,
                b.region||'', b.state||'', b.structureType||'', b.material||'',
                b.yearBuilt||'', b.latitude||'', b.longitude||'',
                routeById[b.route_ID]||'', b.routeKm||'', b.spanLengthM||'',
                b.deckWidthM||'', b.clearanceHeightM||'', b.condition||'',
                b.conditionScore||'', b.inspectionDate||'', b.postingStatus||''
            ].join(','));
        }
        return { csvData: csvLines.join('\n'), totalRecords: bridges.length };
    });

    // ─────────────────────────────────────────────────────────
    // READ: Bridges passthrough
    // ─────────────────────────────────────────────────────────
    srv.on('READ', 'Bridges', (req, next) => next());  // passthrough — keep existing

    // ─────────────────────────────────────────────────────────
    // GeoJSON endpoint — live data merged
    // GET /bridge-management/geojson
    // ─────────────────────────────────────────────────────────
    const app = cds.app;
    if (app) {
        app.get('/bridge-management/geojson', async (req, res) => {
            try {
                const db = await cds.connect.to('db');
                const bridges = await db.run(
                    SELECT.from('nhvr.Bridge').where({ isActive: true })
                );
                const features = bridges.map(b => ({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [b.longitude, b.latitude]
                    },
                    properties: {
                        bridgeId       : b.bridgeId,
                        name           : b.name,
                        state          : b.state,
                        region         : b.region,
                        condition      : b.condition,
                        conditionRating: b.conditionRating,
                        conditionScore : b.conditionScore,
                        postingStatus  : b.postingStatus,
                        clearanceHeightM: b.clearanceHeightM,
                        spanLengthM    : b.spanLengthM,
                        yearBuilt      : b.yearBuilt,
                        inspectionDate : b.inspectionDate,
                        nhvrRouteAssessed: b.nhvrRouteAssessed,
                        freightRoute   : b.freightRoute,
                        overMassRoute  : b.overMassRoute,
                        scourRisk      : b.scourRisk,
                        assetOwner     : b.assetOwner,
                        lga            : b.lga,
                        gazetteRef     : b.gazetteRef,
                        nhvrRef        : b.nhvrRef,
                        sourceRefURL   : b.sourceRefURL,
                        markerColor    : b.conditionRating >= 7 ? '#27ae60'
                                       : b.conditionRating >= 5 ? '#f39c12'
                                       : '#e74c3c'
                    }
                }));
                res.set('Content-Type', 'application/geo+json');
                res.json({ type: 'FeatureCollection', features, totalCount: features.length });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    // ACTION: computeRiskScore
    // ─────────────────────────────────────────────────────────
    srv.on('computeRiskScore', async (req) => {
        const { bridgeId } = req.data;
        const db = await cds.connect.to('db');
        const b = await getBridgeByKey(bridgeId, db);
        if (!b) return req.error(404, `Bridge ${bridgeId} not found`);
        const scourW = { CRITICAL: 6, HIGH: 4, MEDIUM: 2, LOW: 0 }[b.scourRisk] || 0;
        const floodW = b.floodImpacted ? 2 : 0;
        const defW = b.structuralDeficiencyFlag ? 4 : 0;
        const riskScore = Math.min(25, (10 - Math.min(b.conditionRating || 5, 10)) * 2 + scourW + floodW + defW);
        const riskBand = riskScore >= 20 ? 'CRITICAL' : riskScore >= 16 ? 'VERY_HIGH' : riskScore >= 11 ? 'HIGH' : riskScore >= 7 ? 'MEDIUM' : 'LOW';
        const assessmentId = cds.utils.uuid();
        const assessment = {
            ID: assessmentId,
            bridge_ID: b.ID,
            assessmentDate: new Date().toISOString().substring(0, 10),
            assessedBy: (req.user && req.user.id) || 'SYSTEM',
            riskScore,
            riskBand,
            notes: 'Auto-computed from condition rating, scour risk, flood impact, and structural deficiency flags'
        };
        await db.run(INSERT.into('nhvr.BridgeRiskAssessment').entries(assessment));
        await db.run(UPDATE('nhvr.Bridge').set({ currentRiskScore: riskScore, currentRiskBand: riskBand }).where({ bridgeId }));
        return assessment;
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: importBridgesBatch
    // ─────────────────────────────────────────────────────────
    srv.on('importBridgesBatch', async (req) => {
        const { rows } = req.data;
        if (!rows || !rows.length) return req.error(400, 'No rows provided');
        if (rows.length > 500) return req.error(400, 'Maximum 500 rows per call');

        const db = await cds.connect.to('db');
        let created = 0, updated = 0, failed = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                // Required field validation
                if (!row.bridgeId || !row.name || !row.state) {
                    errors.push({ row: i + 1, field: 'bridgeId/name/state', message: 'Required fields missing' });
                    failed++; continue;
                }
                if (row.conditionRating !== null && row.conditionRating !== undefined &&
                    (row.conditionRating < 1 || row.conditionRating > 10)) {
                    errors.push({ row: i + 1, field: 'conditionRating', message: 'Must be 1–10' });
                    failed++; continue;
                }
                // Check if bridge exists
                const existing = await getBridgeByKey(row.bridgeId, db);

                const record = {
                    bridgeId: row.bridgeId, name: row.name, state: row.state,
                    routeNumber: row.routeNumber || null, lga: row.lga || null,
                    region: row.region || null, assetOwner: row.assetOwner || null,
                    bancId: row.bancId || null, totalLengthM: row.totalLengthM || null,
                    widthM: row.widthM || null, numberOfSpans: row.numberOfSpans || null,
                    maxSpanLengthM: row.maxSpanLengthM || null,
                    clearanceHeightM: row.clearanceHeightM || null,
                    numberOfLanes: row.numberOfLanes || null,
                    structureType: row.structureType || null, material: row.material || null,
                    yearBuilt: row.yearBuilt || null, designStandard: row.designStandard || null,
                    postingStatus: row.postingStatus || 'UNRESTRICTED',
                    loadRating: row.loadRating || null,
                    nhvrRouteAssessed: row.nhvrRouteAssessed || false,
                    nhvrRouteApprovalClass: row.nhvrRouteApprovalClass || null,
                    hmlApproved: row.hmlApproved || false,
                    bdoubleApproved: row.bdoubleApproved || false,
                    freightRoute: row.freightRoute || false,
                    gazetteRef: row.gazetteRef || null,
                    importanceLevel: row.importanceLevel || null,
                    conditionRating: row.conditionRating || null,
                    condition: row.condition || null,
                    structuralAdequacyRating: row.structuralAdequacyRating || null,
                    inspectionDate: row.inspectionDate || null,
                    nextInspectionDueDate: row.nextInspectionDueDate || null,
                    highPriorityAsset: row.highPriorityAsset || false,
                    asBuiltDrawingRef: row.asBuiltDrawingRef || null,
                    scourDepthLastMeasuredM: row.scourDepthLastMeasuredM || null,
                    scourRisk: row.scourRisk || null,
                    floodImpacted: row.floodImpacted || false,
                    floodImmunityARI: row.floodImmunityARI || null,
                    aadtVehicles: row.aadtVehicles || null,
                    heavyVehiclePct: row.heavyVehiclePct || null,
                    currentReplacementCost: row.currentReplacementCost || null,
                    remainingUsefulLifeYrs: row.remainingUsefulLifeYrs || null,
                    designLife: row.designLife || null,
                    latitude: row.latitude || null, longitude: row.longitude || null,
                    remarks: row.remarks || null, dataSource: row.dataSource || null
                };

                if (existing) {
                    await db.run(UPDATE('nhvr.Bridge').set(record).where({ ID: existing.ID }));
                    // Write history entry
                    await db.run(INSERT.into('nhvr.AuditLog').entries({
                        ID: cds.utils.uuid(), entityName: 'Bridge',
                        entityId: existing.ID, action: 'BULK_IMPORT_UPDATE',
                        changedBy: req.user.id || 'SYSTEM',
                        changedAt: new Date().toISOString(),
                        description: `Bulk import updated bridge ${row.bridgeId}`
                    }));
                    updated++;
                } else {
                    record.ID = cds.utils.uuid();
                    await db.run(INSERT.into('nhvr.Bridge').entries(record));
                    await db.run(INSERT.into('nhvr.AuditLog').entries({
                        ID: cds.utils.uuid(), entityName: 'Bridge',
                        entityId: record.ID, action: 'BULK_IMPORT_CREATE',
                        changedBy: req.user.id || 'SYSTEM',
                        changedAt: new Date().toISOString(),
                        description: `Bulk import created bridge ${row.bridgeId}`
                    }));
                    created++;
                }
            } catch (err) {
                errors.push({ row: i + 1, field: '', message: err.message || String(err) });
                failed++;
            }
        }
        return { created, updated, failed, errors };
    });

    // ─────────────────────────────────────────────────────────
    // HELPER: Bridge Health Index formula v2.1
    // Weights: superstructure 30%, substructure 28%, deck 20%,
    //          bearing 12%, joint 10%
    // ─────────────────────────────────────────────────────────
    function computeBHI({ deckRating, superstructureRating, substructureRating, bearingRating, jointRating }) {
        const weights = { superstructure: 0.30, substructure: 0.28, deck: 0.20, bearing: 0.12, joint: 0.10 };
        const s  = superstructureRating || 3;
        const b  = substructureRating   || 3;
        const d  = deckRating           || 3;
        const br = bearingRating        || 3;
        const j  = jointRating          || 3;
        const bhi = (s * weights.superstructure + b * weights.substructure + d * weights.deck +
                     br * weights.bearing + j * weights.joint) * 20;
        return Math.round(bhi * 10) / 10;
    }

    // ─────────────────────────────────────────────────────────
    // BEFORE CREATE: BridgeInspections
    // Auto-compute BHI and auto-escalate critical defects
    // ─────────────────────────────────────────────────────────
    srv.before('CREATE', 'BridgeInspections', (req) => {
        const data = req.data;
        // Auto-compute BHI if element ratings provided
        if (data.deckRating || data.superstructureRating) {
            data.bridgeHealthIndex = computeBHI(data);
        }
        // Auto-escalate critical/severe defects
        if (data.defectSeverity === 'CRITICAL' || data.defectSeverity === 'SEVERE') {
            data.followUpRequired = true;
            data.followUpPriority = 'P1';
        }
    });

    // ─────────────────────────────────────────────────────────
    // AFTER CREATE: BridgeInspections
    // Update parent bridge BHI after new inspection is created
    // ─────────────────────────────────────────────────────────
    srv.after('CREATE', 'BridgeInspections', async (result, req) => {
        if (result.bridge_ID && result.bridgeHealthIndex != null) {
            try {
                const db = await cds.connect.to('db');
                await db.run(
                    UPDATE('nhvr.Bridge').set({
                        bridgeHealthIndex:     result.bridgeHealthIndex,
                        bhiCalculationDate:    new Date().toISOString(),
                        bhiCalculationVersion: 'v2.1'
                    }).where({ ID: result.bridge_ID })
                );
            } catch (e) {
                // Non-fatal — log and continue
                LOG.debug('[BHI] Could not update parent bridge BHI:', e.message);
            }
        }
    });

    // ─────────────────────────────────────────────────────────
    // AFTER READ: FreightRoutes corridor risk roll-up
    // Computes criticalBHI, totalBridgeCount, riskLevel dynamically
    // ─────────────────────────────────────────────────────────
    srv.after('READ', 'FreightRoutes', async (routes) => {
        const arr = Array.isArray(routes) ? routes : (routes ? [routes] : []);
        for (const route of arr) {
            if (!route || !route.ID) continue;
            try {
                const db = await cds.connect.to('db');
                const assignments = await db.run(
                    SELECT.from('nhvr.BridgeRouteAssignment').where({ route_ID: route.ID }).columns('bridge_ID')
                );
                if (!assignments.length) continue;
                const bridgeIDs = assignments.map(a => a.bridge_ID);
                const bridges = await db.run(
                    SELECT.from('nhvr.Bridge').where({ ID: { in: bridgeIDs } }).columns('bridgeHealthIndex')
                );
                const bhiValues = bridges.map(b => b.bridgeHealthIndex).filter(v => v != null && !isNaN(v));
                if (bhiValues.length) {
                    route.criticalBHI      = Math.min(...bhiValues);
                    route.totalBridgeCount = bhiValues.length;
                    route.riskLevel = route.criticalBHI >= 70 ? 'LOW'
                                    : route.criticalBHI >= 55 ? 'MEDIUM'
                                    : route.criticalBHI >= 40 ? 'HIGH' : 'CRITICAL';
                }
            } catch (e) {
                LOG.debug('[FreightRoutes] Risk calc error:', e.message);
            }
        }
    });
};
