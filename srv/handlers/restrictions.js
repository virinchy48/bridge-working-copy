'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-restrictions');

module.exports = function registerRestrictionHandlers(srv, helpers) {
    const { getBridgeByKey, getRestriction, logAudit, writeHistory, updateBridgePostingStatus, logRestrictionChange } = helpers;

    // ─────────────────────────────────────────────────────────
    // BEFORE HOOKS - Validation
    // ─────────────────────────────────────────────────────────

    // ── Optimistic locking: version check on Restriction UPDATE ─────
    srv.before('UPDATE', 'Restrictions', async (req) => {
        if (req.data.version !== undefined) {
            const db = await cds.connect.to('db');
            const current = await db.run(SELECT.one.from('nhvr.Restriction').where({ ID: req.data.ID }).columns('version'));
            if (current && current.version !== req.data.version) {
                return req.reject(409, 'Record modified by another user. Please refresh and retry.', 'version');
            }
            req.data.version = (current ? current.version : 0) + 1;
        }
    });

    srv.before(['CREATE', 'UPDATE'], 'Restrictions', async (req) => {
        const data = req.data;
        const today = new Date().toISOString().split('T')[0];
        const errors = [];

        if (data.validFromDate && data.validToDate) {
            if (new Date(data.validFromDate) > new Date(data.validToDate))
                errors.push('Valid From Date must be before Valid To Date');
        }
        // Rule: validToDate requires validFromDate
        if (data.validToDate && !data.validFromDate)
            errors.push('Valid From Date is required when Valid To Date is set');

        // Rule: cannot mark ACTIVE if validToDate already passed
        if (data.status === 'ACTIVE' && data.validToDate && data.validToDate < today)
            errors.push(`Cannot set status to ACTIVE — Valid To Date (${data.validToDate}) has already passed. Extend the date or set status to INACTIVE.`);

        // Rule: temporary restrictions must have both dates and a reason
        if (data.isTemporary) {
            if (!data.validFromDate && !data.temporaryFromDate)
                errors.push('Temporary restrictions require a Valid From Date');
            if (!data.validToDate && !data.temporaryToDate)
                errors.push('Temporary restrictions require a Valid To Date');
            if (!data.temporaryReason)
                errors.push('Temporary restrictions require a reason');
        }

        if (data.validFromTime && data.validToTime) {
            if (data.validFromTime >= data.validToTime)
                errors.push('Valid From Time must be before Valid To Time');
        }
        if (!data.bridge_ID && !data.route_ID && req.event === 'CREATE') {
            errors.push('Restriction must be associated with either a Bridge or a Route');
        }
        if (data.bridge_ID && req.event === 'CREATE') {
            const db2 = await cds.connect.to('db');
            const bridgeExists = await db2.run(SELECT.from('nhvr.Bridge').columns('ID').where({ ID: data.bridge_ID }).limit(1));
            if (!bridgeExists || bridgeExists.length === 0) {
                errors.push(`Bridge with ID '${data.bridge_ID}' does not exist`);
            }
        }
        if (data.value !== undefined && data.value !== null && data.value <= 0 &&
            data.restrictionType !== 'VEHICLE_TYPE') {
            errors.push('Restriction value must be greater than 0');
        }
        const validUnits = {
            'HEIGHT': ['m'], 'MASS': ['t'], 'GROSS_MASS': ['t'], 'WIDTH': ['m'],
            'LENGTH': ['m'], 'SPEED': ['km/h'], 'AXLE_LOAD': ['t'],
            'AXLE_MASS': ['t'], 'COMBINATION_MASS': ['t'], 'WIND_SPEED': ['km/h']
        };
        if (data.restrictionType && data.unit) {
            const allowed = validUnits[data.restrictionType];
            if (allowed && !allowed.includes(data.unit))
                errors.push(`Invalid unit "${data.unit}" for restriction type "${data.restrictionType}". Expected: ${allowed.join(', ')}`);
        }
        // Restriction type enum validation
        const VALID_RESTRICTION_TYPES = ['MASS','GROSS_MASS','HEIGHT','WIDTH','LENGTH','SPEED','AXLE_LOAD','AXLE_MASS','COMBINATION_MASS','VEHICLE_TYPE','WIND_SPEED','WEIGHT','CLEARANCE'];
        if (data.restrictionType && !VALID_RESTRICTION_TYPES.includes(data.restrictionType))
            errors.push(`Invalid restrictionType: '${data.restrictionType}'. Must be one of: ${VALID_RESTRICTION_TYPES.join(', ')}`);
        // Status enum validation
        const VALID_STATUSES = ['ACTIVE','INACTIVE','EXPIRED','SCHEDULED','DRAFT','SUPERSEDED'];
        if (data.status && !VALID_STATUSES.includes(data.status))
            errors.push(`Invalid status: '${data.status}'. Must be one of: ${VALID_STATUSES.join(', ')}`);
        // Direction enum validation
        const VALID_DIRECTIONS = ['BOTH','NORTHBOUND','SOUTHBOUND','EASTBOUND','WESTBOUND','INBOUND','OUTBOUND'];
        if (data.directionApplied && !VALID_DIRECTIONS.includes(data.directionApplied))
            errors.push(`Invalid direction: '${data.directionApplied}'. Must be one of: ${VALID_DIRECTIONS.join(', ')}`);
        if (errors.length) return req.error(400, errors.join('; '));
    });

    // ── GAP-2: Auto-validate gazetteRef against GazetteNotice register ────
    srv.before(['CREATE', 'UPDATE'], 'Restrictions', async (req) => {
        const gazetteRef = req.data.gazetteRef;
        if (!gazetteRef) return;

        // Format check: STATE-YYYY/NNN or STATE-YYYY-NNN
        const fmtOk = /^[A-Z]{2,10}-\d{4}[-\/]\d{1,4}$/.test(gazetteRef);
        if (!fmtOk) {
            req.data.gazetteValidationStatus = 'INVALID_FORMAT';
            req.data.gazetteValidationDate   = new Date().toISOString();
            return; // soft warning — do not block save
        }

        // Register lookup
        const db2 = await cds.connect.to('db');
        const notice = await db2.run(
            SELECT.one.from('nhvr.GazetteNotice').where({ gazetteRef })
        );
        if (!notice) {
            req.data.gazetteValidationStatus = 'NOT_FOUND';
        } else if (notice.expiryDate && new Date(notice.expiryDate) < new Date()) {
            req.data.gazetteValidationStatus = 'EXPIRED';
        } else {
            req.data.gazetteValidationStatus = 'VALID';
        }
        req.data.gazetteValidationDate = new Date().toISOString();
    });

    // ─────────────────────────────────────────────────────────
    // AFTER HOOKS - Post-processing + Audit Logging
    // ─────────────────────────────────────────────────────────

    srv.after('CREATE', 'Restrictions', async (data, req) => {
        if (data.bridge_ID) await updateBridgePostingStatus(data.bridge_ID);
        await logAudit('CREATE', 'Restrictions', data.ID, `${data.restrictionType} restriction`,
            `Restriction "${data.restrictionType}: ${data.value} ${data.unit}" created`, data, req);
        if (data.bridge_ID) {
            const label = `${data.restrictionType}: ${data.value || ''} ${data.unit || ''}`.trim();
            await writeHistory(data.bridge_ID, data.isTemporary ? 'TEMP_RESTRICTION_ADDED' : 'RESTRICTION_ADDED',
                `Restriction added: ${label}`,
                `${data.validFromDate || '—'} → ${data.validToDate || 'Ongoing'}${data.permitRequired ? ' | Permit Required' : ''}`,
                { statusAfter: data.status, gazetteRef: data.gazetteRef,
                  relatedEntityType: 'Restriction', relatedEntityId: data.ID }, req);
        }
    });

    srv.after('UPDATE', 'Restrictions', async (data, req) => {
        await logAudit('UPDATE', 'Restrictions', data.ID || req.params[0], `${req.data.restrictionType || ''} restriction`,
            `Restriction updated`, req.data, req);
    });

    srv.after('DELETE', 'Restrictions', async (data, req) => {
        if (req.data && req.data.bridge_ID) await updateBridgePostingStatus(req.data.bridge_ID);
        await logAudit('DELETE', 'Restrictions', req.params[0], '',
            `Restriction deleted (ID: ${req.params[0]})`, null, req);
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: expireRestrictions (auto-expire past validToDate)
    // ─────────────────────────────────────────────────────────
    srv.on('expireRestrictions', async (req) => {
        const db = await cds.connect.to('db');
        const today = new Date().toISOString().split('T')[0];
        const toExpire = await db.run(
            SELECT.from('nhvr.Restriction')
                .where`isActive = true and status = 'ACTIVE' and validToDate < ${today}`
        );
        let expired = 0;
        const tx = cds.tx(req);
        try {
            for (const r of toExpire) {
                await tx.run(UPDATE('nhvr.Restriction').set({ status: 'EXPIRED', isActive: false }).where({ ID: r.ID }));
                await logRestrictionChange(r.ID, 'EXPIRED', 'ACTIVE', 'EXPIRED', 'Auto-expired on validToDate', req);
                await logAudit('SYSTEM', 'Restrictions', r.ID,
                    `${r.restrictionType} restriction`,
                    `Restriction auto-expired: validToDate passed`,
                    { oldStatus: r.status, newStatus: 'EXPIRED' }, req);
                if (r.bridge_ID) await updateBridgePostingStatus(r.bridge_ID);
                expired++;
            }
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Restriction expiry failed: ${e.message}. All changes rolled back.`);
        }
        return { expired };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: disableRestriction (on Restrictions entity)
    // ─────────────────────────────────────────────────────────
    srv.on('disableRestriction', 'Restrictions', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin') && !req.user.is('Inspector')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const { reason } = req.data;
        const _rp = req.params[0];
        const restrictionId = (typeof _rp === "object" && _rp !== null) ? (_rp.ID || Object.values(_rp)[0]) : _rp;
        const db = await cds.connect.to('db');
        const restriction = await getRestriction(restrictionId, db);
        if (!restriction) return req.error(404, 'Restriction not found');
        if (!restriction.isActive) return req.error(400, 'Restriction is already disabled');

        const oldStatus = restriction.status;
        await db.run(UPDATE('nhvr.Restriction').set({
            isActive      : false,
            status        : 'INACTIVE',
            disabledAt    : new Date().toISOString(),
            disabledBy    : req.user ? req.user.id : 'system',
            disableReason : reason || ''
        }).where({ ID: restrictionId }));

        await logRestrictionChange(restrictionId, 'DISABLED', oldStatus, 'INACTIVE', reason, req);
        if (restriction.bridge_ID) await updateBridgePostingStatus(restriction.bridge_ID);
        await logAudit('ACTION', 'Restrictions', restrictionId, `${restriction.restrictionType} restriction`,
            `Restriction disabled: ${reason || 'no reason given'}`, { reason }, req);

        return { status: 'SUCCESS', message: 'Restriction disabled successfully' };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: enableRestriction (on Restrictions entity)
    // ─────────────────────────────────────────────────────────
    srv.on('enableRestriction', 'Restrictions', async (req) => {
        if (!req.user.is('BridgeManager') && !req.user.is('Admin') && !req.user.is('Inspector')) {
            return req.error(403, 'Insufficient privileges for this operation');
        }
        const { reason } = req.data;
        const _rp = req.params[0];
        const restrictionId = (typeof _rp === "object" && _rp !== null) ? (_rp.ID || Object.values(_rp)[0]) : _rp;
        const db = await cds.connect.to('db');
        const restriction = await getRestriction(restrictionId, db);
        if (!restriction) return req.error(404, 'Restriction not found');
        if (restriction.isActive) return req.error(400, 'Restriction is already active');

        await db.run(UPDATE('nhvr.Restriction').set({
            isActive      : true,
            status        : 'ACTIVE',
            disabledAt    : null,
            disabledBy    : null,
            disableReason : null
        }).where({ ID: restrictionId }));

        await logRestrictionChange(restrictionId, 'ENABLED', 'INACTIVE', 'ACTIVE', reason, req);
        if (restriction.bridge_ID) await updateBridgePostingStatus(restriction.bridge_ID);
        await logAudit('ACTION', 'Restrictions', restrictionId, `${restriction.restrictionType} restriction`,
            `Restriction re-enabled`, { reason }, req);

        return { status: 'SUCCESS', message: 'Restriction enabled successfully' };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: createTemporaryRestriction (on Restrictions entity)
    // ─────────────────────────────────────────────────────────
    srv.on('createTemporaryRestriction', 'Restrictions', async (req) => {
        const { fromDate, toDate, reason } = req.data;
        const _rp = req.params[0];
        const restrictionId = (typeof _rp === "object" && _rp !== null) ? (_rp.ID || Object.values(_rp)[0]) : _rp;
        if (!fromDate || !toDate) return req.error(400, 'fromDate and toDate are required');
        if (new Date(fromDate) > new Date(toDate)) return req.error(400, 'fromDate must be before toDate');

        const db = await cds.connect.to('db');
        const restriction = await getRestriction(restrictionId, db);
        if (!restriction) return req.error(404, 'Restriction not found');

        // Create a temporary clone of this restriction
        const tempRestriction = {
            restrictionType  : restriction.restrictionType,
            value            : restriction.value,
            unit             : restriction.unit,
            vehicleClass_ID  : restriction.vehicleClass_ID,
            bridge_ID        : restriction.bridge_ID,
            route_ID         : restriction.route_ID,
            direction        : restriction.direction,
            status           : 'ACTIVE',
            permitRequired   : restriction.permitRequired,
            isActive         : true,
            isTemporary      : true,
            temporaryFromDate: fromDate,
            temporaryToDate  : toDate,
            temporaryReason  : reason || '',
            validFromDate    : fromDate,
            validToDate      : toDate,
            notes            : `Temporary restriction: ${reason || ''}`,
            conditionCode    : restriction.conditionCode,
            gazetteRef       : restriction.gazetteRef,
            enforcementAuthority: restriction.enforcementAuthority,
            nhvrPermitClass  : restriction.nhvrPermitClass,
            signageRequired  : restriction.signageRequired,
            supersedes_ID    : restrictionId
        };

        const newTempId = cds.utils.uuid();
        tempRestriction.ID = newTempId;
        await db.run(INSERT.into('nhvr.Restriction').entries(tempRestriction));
        const newId = newTempId;
        await logRestrictionChange(restrictionId, 'TEMP_APPLIED', restriction.status, restriction.status, reason, req);
        if (restriction.bridge_ID) await updateBridgePostingStatus(restriction.bridge_ID);

        return { status: 'SUCCESS', message: 'Temporary restriction created', ID: newId };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: extendTemporaryRestriction (on Restrictions entity)
    // ─────────────────────────────────────────────────────────
    srv.on('extendTemporaryRestriction', 'Restrictions', async (req) => {
        const { newToDate, reason } = req.data;
        const _rp = req.params[0];
        const restrictionId = (typeof _rp === "object" && _rp !== null) ? (_rp.ID || Object.values(_rp)[0]) : _rp;
        if (!newToDate) return req.error(400, 'newToDate is required');

        const db = await cds.connect.to('db');
        const restriction = await getRestriction(restrictionId, db);
        if (!restriction) return req.error(404, 'Restriction not found');
        if (!restriction.isTemporary) return req.error(400, 'This restriction is not a temporary restriction');

        await db.run(UPDATE('nhvr.Restriction').set({
            temporaryToDate: newToDate,
            validToDate    : newToDate
        }).where({ ID: restrictionId }));

        await logRestrictionChange(restrictionId, 'TEMP_EXTENDED', restriction.status, restriction.status,
            `Extended to ${newToDate}: ${reason || ''}`, req);

        return { status: 'SUCCESS', message: `Temporary restriction extended to ${newToDate}` };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: validateRestriction
    // ─────────────────────────────────────────────────────────
    srv.on('validateRestriction', async (req) => {
        const { bridgeId, vehicleClassCode, checkDate, checkTime, restrictionType } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db, true);
        if (!bridge) return { isAllowed: false, message: `Bridge "${bridgeId}" not found`, permitRequired: false };
        const vc = await db.run(SELECT.one.from('nhvr.VehicleClass').where({ code: vehicleClassCode, isActive: true }));
        const whereClause = { bridge_ID: bridge.ID, status: 'ACTIVE', isActive: true };
        if (restrictionType) whereClause.restrictionType = restrictionType;
        if (vc)              whereClause.vehicleClass_ID = vc.ID;
        const restrictions = await db.run(SELECT.from('nhvr.Restriction').where(whereClause));
        if (restrictions.length === 0) {
            return { isAllowed: true, message: 'No restrictions found for this vehicle on this bridge', permitRequired: false };
        }
        const checkDateObj = checkDate ? new Date(checkDate) : new Date();
        const checkDay = ['SUN','MON','TUE','WED','THU','FRI','SAT'][checkDateObj.getDay()];
        for (const r of restrictions) {
            if (r.validFromDate && new Date(r.validFromDate) > checkDateObj) continue;
            if (r.validToDate   && new Date(r.validToDate)   < checkDateObj) continue;
            if (r.dayOfWeek) {
                const allowedDays = r.dayOfWeek.split(',').map(d => d.trim());
                if (!allowedDays.includes(checkDay)) continue;
            }
            if (r.validFromTime && r.validToTime && checkTime) {
                if (checkTime < r.validFromTime || checkTime > r.validToTime) continue;
            }
            return {
                isAllowed: false, restrictionValue: r.value, unit: r.unit,
                message: `Vehicle restricted. ${r.restrictionType}: ${r.value} ${r.unit}` +
                         (r.permitRequired ? ' (Permit may be available)' : ''),
                permitRequired: r.permitRequired || false
            };
        }
        return { isAllowed: true, message: 'Vehicle is permitted on this bridge at the specified time', permitRequired: false };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: assessRestriction
    // Full NHVR vehicle access assessment
    // ─────────────────────────────────────────────────────────
    srv.on('assessRestriction', async (req) => {
        const { bridgeId, grossMassT, axleLoadT, heightM } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db, true);
        if (!bridge) return req.error(404, `Bridge "${bridgeId}" not found`);

        const restrictions = await db.run(
            SELECT.from('nhvr.Restriction')
                .where({ bridge_ID: bridge.ID, status: 'ACTIVE', isActive: true })
        );

        const violations = [];
        let permitRequired = false;
        let gazetteRefs = [];

        for (const r of restrictions) {
            let violated = false;
            if (r.restrictionType === 'MASS' && grossMassT && parseFloat(grossMassT) > r.value) violated = true;
            if (r.restrictionType === 'AXLE_MASS' && axleLoadT && parseFloat(axleLoadT) > r.value) violated = true;
            if (r.restrictionType === 'HEIGHT' && heightM && parseFloat(heightM) > r.value) violated = true;
            if (r.restrictionType === 'COMBINATION_MASS' && grossMassT && parseFloat(grossMassT) > r.value) violated = true;
            if (violated) {
                violations.push({
                    restrictionType: r.restrictionType,
                    value: r.value,
                    unit: r.unit,
                    nhvrRef: r.nhvrRef || '',
                    gazetteRef: r.gazetteRef || ''
                });
                if (r.permitRequired) permitRequired = true;
                if (r.gazetteRef) gazetteRefs.push(r.gazetteRef);
            }
        }

        const permitted = violations.length === 0;
        let message;
        if (permitted) {
            message = `Vehicle is permitted to cross ${bridge.name}. All dimension and mass limits satisfied.`;
        } else if (permitRequired) {
            message = `Permit may be available for ${bridge.name}. ${violations.length} restriction(s) exceeded — apply for NHVR permit.`;
        } else {
            message = `Access PROHIBITED to ${bridge.name}. ${violations.length} restriction(s) exceeded with no permit option.`;
        }

        return {
            permitted,
            permitRequired,
            message,
            nhvrPermitUrl: 'https://www.nhvr.gov.au/road-access/permits',
            gazetteRef: gazetteRefs.join(', ')
        };
    });

    // ─────────────────────────────────────────────────────────
    // ACTION: importRestrictionsBatch
    // ─────────────────────────────────────────────────────────
    srv.on('importRestrictionsBatch', async (req) => {
        const { rows } = req.data;
        if (!rows || !rows.length) return req.error(400, 'No rows provided');
        if (rows.length > 500) return req.error(400, 'Maximum 500 rows per call');

        const db = await cds.connect.to('db');
        let created = 0, updated = 0, failed = 0;
        const errors = [];
        const tx = cds.tx(req);
        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    if (!row.bridge_bridgeId || !row.restrictionType || !row.value || !row.unit) {
                        errors.push({ row: i + 1, field: 'bridge_bridgeId/restrictionType/value/unit', message: 'Required fields missing' });
                        failed++; continue;
                    }
                    // Look up bridge by bridgeId
                    const bridge = await getBridgeByKey(row.bridge_bridgeId, db);
                    if (!bridge) {
                        errors.push({ row: i + 1, field: 'bridge_bridgeId', message: `Bridge not found: ${row.bridge_bridgeId}` });
                        failed++; continue;
                    }
                    const record = {
                        ID: cds.utils.uuid(),
                        bridge_ID: bridge.ID,
                        restrictionType: row.restrictionType,
                        value: row.value, unit: row.unit,
                        status: row.status || 'ACTIVE',
                        isTemporary: row.isTemporary || false,
                        permitRequired: row.permitRequired || false,
                        validFromDate: row.validFromDate || null,
                        validToDate: row.validToDate || null,
                        gazetteRef: row.gazetteRef || null,
                        approvedBy: row.approvedBy || null,
                        notes: row.notes || null,
                        isActive: true
                    };
                    await tx.run(INSERT.into('nhvr.Restriction').entries(record));
                    created++;
                } catch (err) {
                    errors.push({ row: i + 1, field: '', message: err.message || String(err) });
                    failed++;
                }
            }
            await tx.commit();
        } catch (e) {
            await tx.rollback();
            return req.error(500, `Restriction batch import failed: ${e.message}. All changes rolled back.`);
        }
        return { created, updated, failed, errors };
    });

    // ── Before hook: VehiclePermits approval validation ────────
    srv.before(['CREATE', 'UPDATE'], 'VehiclePermits', async (req) => {
        const d = req.data;
        const errors = [];
        if (d.permitStatus === 'APPROVED' || d.permitStatus === 'APPROVED_WITH_CONDITIONS') {
            if (d.allChecksPassed === false)
                errors.push('Cannot approve permit — one or more engineering checks have not passed. Run assessment first.');
            if (!d.assessedBy)
                errors.push('assessedBy (engineer name and NER/RPEQ registration) is required before approval.');
            if (!d.effectiveFrom)
                errors.push('effectiveFrom date is required.');
            if (!d.expiryDate)
                errors.push('expiryDate is required for all approved permits.');
            if (d.expiryDate && d.effectiveFrom && d.expiryDate <= d.effectiveFrom)
                errors.push('expiryDate must be after effectiveFrom.');
        }
        if (d.permitType === 'SINGLE_TRIP' && !d.effectiveFrom)
            errors.push('Single-trip permits require a specific effectiveFrom date.');
        if (errors.length) return req.error(400, errors.join('; '));
    });

    // ── After hook: write history on permit approval ───────────
    srv.after(['CREATE', 'UPDATE'], 'VehiclePermits', async (permit, req) => {
        if (permit && (permit.permitStatus === 'APPROVED' || permit.permitStatus === 'APPROVED_WITH_CONDITIONS')) {
            try {
                await writeHistory(
                    permit.bridge_ID,
                    'PERMIT_APPROVED',
                    `Vehicle permit issued: ${permit.vehicleTypeName || permit.vehicleType_vehicleTypeId} — ${permit.assessedGVM_t}t`,
                    `Permit: ${permit.permitId} | Applicant: ${permit.applicantName} | Type: ${permit.permitType} | Expires: ${permit.expiryDate} | Assessed by: ${permit.assessedBy}`,
                    {
                        effectiveFrom    : permit.effectiveFrom,
                        effectiveTo      : permit.expiryDate,
                        approvalRef      : permit.nhvrPermitNumber,
                        relatedEntityType: 'VehiclePermit',
                        relatedEntityId  : permit.permitId
                    },
                    req
                );
            } catch (e) {
                LOG.error('writeHistory for permit failed:', e.message);
            }
        }
    });

    // ── P08: validateGazette — format check + upsert record ──────
    srv.on('validateGazette', async (req) => {
        const db = await cds.connect.to('db');
        const { restrictionId, gazetteRef } = req.data;
        const validFormat = /^[A-Z]{2,5}-[\d]{4}[-\/][\d]{2,4}$/i.test(gazetteRef || '');
        const status  = validFormat ? 'VALID' : 'INVALID';
        const message = validFormat
            ? `Gazette reference ${gazetteRef} format is valid`
            : `Invalid gazette format. Expected: STATE-YYYY/NNN (e.g. NSW-2024/123)`;
        const expiryDate = validFormat
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : null;
        const existing = await db.run(
            SELECT.one.from('nhvr.GazetteValidation').where({ restriction_ID: restrictionId })
        );
        const validationData = {
            restriction_ID: restrictionId, gazetteRef,
            validationStatus: status,
            validatedAt: new Date().toISOString(),
            validatedBy: req.user?.id || 'system',
            expiryDate
        };
        if (existing) {
            await db.run(
                UPDATE('nhvr.GazetteValidation').set(validationData).where({ ID: existing.ID })
            );
        } else {
            validationData.ID = cds.utils.uuid();
            await db.run(INSERT.into('nhvr.GazetteValidation').entries(validationData));
        }
        return { status, message, expiryDate: expiryDate || '' };
    });

    // ── LoadRatings — BEFORE CREATE/UPDATE validation ─────────────
    srv.before(['CREATE', 'UPDATE'], 'LoadRatings', async (req) => {
        const data = req.data;

        // maxGrossMass_t must be > 0
        if (data.maxGrossMass_t !== undefined && data.maxGrossMass_t !== null) {
            if (isNaN(Number(data.maxGrossMass_t)) || Number(data.maxGrossMass_t) <= 0) {
                req.error(400, 'Max Gross Mass must be greater than 0 tonnes.');
            }
        }

        // maxAxleLoad_t must be > 0 if provided
        if (data.maxAxleLoad_t !== undefined && data.maxAxleLoad_t !== null) {
            if (isNaN(Number(data.maxAxleLoad_t)) || Number(data.maxAxleLoad_t) <= 0) {
                req.error(400, 'Max Axle Load must be greater than 0 tonnes.');
            }
        }

        // assessmentDate must not be in the future
        if (data.assessmentDate) {
            const assessDate = new Date(data.assessmentDate);
            const today      = new Date();
            today.setHours(23, 59, 59, 999);
            if (assessDate > today) {
                req.error(400, 'Assessment Date cannot be in the future.');
            }
        }

        // nextReviewDue must be after assessmentDate if both provided
        if (data.nextReviewDue && data.assessmentDate) {
            const reviewDate = new Date(data.nextReviewDue);
            const assessDate = new Date(data.assessmentDate);
            if (reviewDate <= assessDate) {
                req.error(400, 'Next Review Due date must be after the Assessment Date.');
            }
        }

        // ratingFactor: if provided must be > 0
        if (data.ratingFactor !== undefined && data.ratingFactor !== null) {
            if (isNaN(Number(data.ratingFactor)) || Number(data.ratingFactor) <= 0) {
                req.error(400, 'Rating Factor (RF) must be a positive number.');
            }
        }
    });

    // ── LoadRatings — AFTER CREATE: write AuditLog ────────────────
    srv.after('CREATE', 'LoadRatings', async (result, req) => {
        try {
            const db = await cds.connect.to('db');
            await db.run(
                INSERT.into('nhvr.AuditLog').entries({
                    entityName : 'LoadRating',
                    entityId   : result.ID,
                    action     : 'CREATE',
                    fieldName  : 'maxGrossMass_t',
                    newValue   : String(result.maxGrossMass_t ?? ''),
                    changedBy  : req.user?.id || 'system',
                    changedAt  : new Date().toISOString(),
                    notes      : `Load rating created: ${result.ratingStandard || ''} by ${result.assessedBy || ''}`
                })
            );
        } catch (e) {
            // Audit failure is non-fatal — log but do not block the response
            LOG.warn('[NHVR] AuditLog write failed for LoadRating CREATE:', e.message);
        }
    });

    // ── LoadRatings — AFTER UPDATE: write AuditLog ───────────────
    srv.after('UPDATE', 'LoadRatings', async (result, req) => {
        try {
            const db = await cds.connect.to('db');
            await db.run(
                INSERT.into('nhvr.AuditLog').entries({
                    entityName : 'LoadRating',
                    entityId   : req.params?.[0]?.ID || result.ID || '',
                    action     : 'UPDATE',
                    fieldName  : 'status',
                    newValue   : String(result.status ?? ''),
                    changedBy  : req.user?.id || 'system',
                    changedAt  : new Date().toISOString(),
                    notes      : 'Load rating updated'
                })
            );
        } catch (e) {
            LOG.warn('[NHVR] AuditLog write failed for LoadRating UPDATE:', e.message);
        }
    });
};
