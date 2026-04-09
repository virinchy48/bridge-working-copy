'use strict';
const cds = require('@sap/cds');
const crypto = require('crypto');
const LOG = cds.log('nhvr-geo');

/**
 * Load admin-configurable assessment thresholds from nhvr.AssessmentThreshold.
 * Falls back to sensible defaults if DB rows are missing.
 */
async function loadThresholds(db, jurisdiction) {
    // Load global thresholds first (jurisdiction IS NULL)
    const globalRows = await db.run(
        SELECT.from('nhvr.AssessmentThreshold')
            .where({ isActive: true, jurisdiction: { '=': null } })
    );
    var thresholds = {};
    for (const row of globalRows) { thresholds[row.thresholdKey] = parseFloat(row.value); }

    // If jurisdiction specified, overlay jurisdiction-specific values
    if (jurisdiction) {
        const jurisRows = await db.run(
            SELECT.from('nhvr.AssessmentThreshold')
                .where({ isActive: true, jurisdiction: jurisdiction })
        );
        for (const row of jurisRows) { thresholds[row.thresholdKey] = parseFloat(row.value); }
    }

    // Provide defaults if not found in DB
    return Object.assign({
        MASS_MARGIN_WARNING_T: 2,
        HEIGHT_MARGIN_WARNING_M: 0.3,
        WIDTH_MARGIN_WARNING_M: 0.6,
        FATIGUE_WARNING_PCT: 20,
        SCOUR_CRITICAL_MARGIN_M: 0,
        PROXIMITY_RADIUS_M: 500,
        CROSSING_SPEED_DEFAULT_KMH: 40
    }, thresholds);
}

module.exports = function registerGeoHandlers(srv, helpers) {
    const { logAudit } = helpers;

    function getCorrelationId(req) {
        return (req.correlationId) ||
            (req.headers && (
                req.headers['x-correlation-id'] ||
                req.headers['x-request-id'] ||
                req.headers['x-vcap-request-id']
            )) || `nhvr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }

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
                        bridgeId        : b.bridgeId,
                        name            : b.name,
                        state           : b.state,
                        region          : b.region,
                        condition       : b.condition,
                        conditionRating : b.conditionRating,
                        conditionScore  : b.conditionScore,
                        postingStatus   : b.postingStatus,
                        clearanceHeightM: b.clearanceHeightM,
                        spanLengthM     : b.spanLengthM,
                        yearBuilt       : b.yearBuilt,
                        inspectionDate  : b.inspectionDate,
                        nhvrRouteAssessed: b.nhvrRouteAssessed,
                        freightRoute    : b.freightRoute,
                        overMassRoute   : b.overMassRoute,
                        scourRisk       : b.scourRisk,
                        assetOwner      : b.assetOwner,
                        lga             : b.lga,
                        gazetteRef      : b.gazetteRef,
                        nhvrRef         : b.nhvrRef,
                        sourceRefURL    : b.sourceRefURL,
                        markerColor     : b.conditionRating >= 7 ? '#27ae60'
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

    // ── syncWithBams ──────────────────────────────────────────
    srv.on('syncWithBams', async (req) => {
        const { bridgeId } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await h.getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const existing = await db.run(SELECT.one.from('nhvr.BamsSync').where({ bridge_ID: bridgeId }));
        const syncData = {
            bridge_ID     : bridgeId,
            lastSyncAt    : new Date().toISOString(),
            syncStatus    : 'SYNCED',
            syncMessage   : 'Mock sync completed successfully',
            externalBamsId: 'BAMS-' + (bridge.bridgeId || bridgeId.slice(0, 8)),
            dataVersion   : '1.0'
        };
        if (existing) {
            await db.run(UPDATE('nhvr.BamsSync').set(syncData).where({ ID: existing.ID }));
        } else {
            syncData.ID = cds.utils.uuid();
            await db.run(INSERT.into('nhvr.BamsSync').entries(syncData));
        }
        try {
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                ID               : cds.utils.uuid(),
                entityName       : 'BamsSync',
                entityId         : bridgeId,
                action           : 'SYNC',
                changedBy        : req.user?.id || 'system',
                changedAt        : new Date().toISOString(),
                changeDescription: 'BAMS sync performed'
            }));
        } catch (e) { LOG.warn('[NHVR] AuditLog write failed for BAMS sync:', e.message); }
        return { status: 'SYNCED', message: 'Bridge data synced with BAMS successfully' };
    });

    // ── assessCorridor ────────────────────────────────────────
    srv.on('assessCorridor', async (req) => {
        const { routeId } = req.data;
        const db = await cds.connect.to('db');
        const routeBridges = await db.run(SELECT.from('nhvr.FreightRouteBridge').where({ route_ID: routeId }));
        if (!routeBridges.length) return req.error(400, 'No bridges on this route');
        let minMass = 999;
        let criticalCount = 0;
        for (const rb of routeBridges) {
            const rating = await db.run(
                SELECT.one.from('nhvr.LoadRating')
                    .where({ bridge_ID: rb.bridge_ID, status: 'ADEQUATE' })
                    .orderBy('assessmentDate desc')
            );
            if (rating && rating.maxGrossMass_t < minMass) minMass = rating.maxGrossMass_t;
            if (rb.isCritical) criticalCount++;
        }
        const corridorMass = minMass === 999 ? null : minMass;
        await db.run(
            UPDATE('nhvr.FreightRoute')
                .set({ corridorMaxMass: corridorMass, lastAssessedAt: new Date().toISOString() })
                .where({ ID: routeId })
        );
        return { corridorMaxMass: corridorMass, bridgeCount: routeBridges.length, criticalBridges: criticalCount };
    });

    // ── assessFreightRouteVehicle — full per-bridge route assessment ──
    srv.on('assessFreightRouteVehicle', async (req) => {
        const { routeId, vehicleGVM_t, vehicleGCM_t, vehicleHeight_m, vehicleWidth_m,
                vehicleLength_m, crossingSpeed, vehicleClass } = req.data;

        // Vehicle dimension range validation (reasonable limits for AU heavy vehicles)
        if (vehicleGVM_t !== undefined && (vehicleGVM_t < 0 || vehicleGVM_t > 500)) {
            return req.reject(400, 'Vehicle GVM must be between 0 and 500 tonnes');
        }
        if (vehicleHeight_m !== undefined && (vehicleHeight_m < 0 || vehicleHeight_m > 10)) {
            return req.reject(400, 'Vehicle height must be between 0 and 10 metres');
        }
        if (vehicleWidth_m !== undefined && (vehicleWidth_m < 0 || vehicleWidth_m > 10)) {
            return req.reject(400, 'Vehicle width must be between 0 and 10 metres');
        }
        if (vehicleLength_m !== undefined && (vehicleLength_m < 0 || vehicleLength_m > 60)) {
            return req.reject(400, 'Vehicle length must be between 0 and 60 metres');
        }

        const db = await cds.connect.to('db');
        const T = await loadThresholds(db, null);
        const today = new Date().toISOString().slice(0, 10);

        const route = await db.run(SELECT.one.from('nhvr.FreightRoute').where({ ID: routeId }));
        if (!route) return req.error(404, 'Route not found');

        const routeBridges = await db.run(
            SELECT.from('nhvr.FreightRouteBridge').where({ route_ID: routeId }).orderBy('sequence')
        );

        const gvm    = parseFloat(vehicleGVM_t)    || 0;
        const gcm    = parseFloat(vehicleGCM_t)    || 0;
        const height = parseFloat(vehicleHeight_m) || 0;
        const width  = parseFloat(vehicleWidth_m)  || 0;
        const length = parseFloat(vehicleLength_m) || 0;
        const speed  = parseInt(crossingSpeed)     || 80;

        const bridgeResults = [];
        let routeVerdict       = 'APPROVED';
        let limitingAsset      = null;
        let limitingConstraint = null;
        let limitingEffectiveMass = 9999;
        let minMassMargin      = 9999;
        let minClearanceMargin = 9999;

        for (const rb of routeBridges) {
            const bridge   = await db.run(SELECT.one.from('nhvr.Bridge').where({ ID: rb.bridge_ID }));
            if (!bridge) continue;
            const capacity = await db.run(SELECT.one.from('nhvr.BridgeCapacity').where({ bridge_ID: rb.bridge_ID }));

            const allRestr = await db.run(
                SELECT.from('nhvr.Restriction').where({ bridge_ID: rb.bridge_ID, isActive: true, status: 'ACTIVE' })
            );
            const activeRestr = allRestr.filter(r => {
                if (r.validFromDate && r.validToDate) return r.validFromDate <= today && r.validToDate >= today;
                return true;
            });

            const isClosed = bridge.postingStatus === 'CLOSED';
            const issues   = [];
            const warnings = [];
            let closurePass = !isClosed;
            if (isClosed) issues.push('Bridge is CLOSED to traffic');

            let restrMassLimit   = null;
            let restrHeightLimit = null;
            let restrWidthLimit  = null;
            for (const r of activeRestr) {
                const t = (r.restrictionType || '').toUpperCase();
                if (t === 'GROSS_MASS' || t === 'MASS') {
                    const v = parseFloat(r.value) || 0;
                    if (restrMassLimit === null || v < restrMassLimit) restrMassLimit = v;
                }
                if (t === 'HEIGHT') {
                    const v = parseFloat(r.value) || 0;
                    if (restrHeightLimit === null || v < restrHeightLimit) restrHeightLimit = v;
                }
                if (t === 'WIDTH') {
                    const v = parseFloat(r.value) || 0;
                    if (restrWidthLimit === null || v < restrWidthLimit) restrWidthLimit = v;
                }
                if (t === 'CLOSURE' || t === 'CLOSED') {
                    closurePass = false;
                    issues.push(`Active ${r.validFromDate ? 'temporary' : 'permanent'} closure restriction`);
                }
            }

            const massLimit = restrMassLimit !== null
                ? (capacity?.grossMassLimit_t ? Math.min(restrMassLimit, capacity.grossMassLimit_t) : restrMassLimit)
                : (capacity?.grossMassLimit_t || null);
            let massPass = true;
            if (massLimit && gvm > 0) {
                const margin = massLimit - gvm;
                if (margin < 0)  { massPass = false; issues.push(`Mass: GVM ${gvm}t exceeds limit ${massLimit}t by ${Math.abs(margin).toFixed(1)}t`); }
                else if (margin < T.MASS_MARGIN_WARNING_T) warnings.push(`Mass margin small: ${margin.toFixed(1)}t — verify weighbridge`);
                if (margin < minMassMargin) minMassMargin = margin;
            }

            const effectiveClearance = restrHeightLimit !== null
                ? (capacity?.minVerticalClearance_m ? Math.min(restrHeightLimit, capacity.minVerticalClearance_m) : restrHeightLimit)
                : (capacity?.minVerticalClearance_m || bridge.clearanceHeightM || null);
            let clearancePass = true;
            if (effectiveClearance && height > 0) {
                const margin = effectiveClearance - height;
                if (margin < 0)      { clearancePass = false; issues.push(`Clearance: Height ${height}m exceeds clearance ${effectiveClearance}m by ${Math.abs(margin * 1000).toFixed(0)}mm`); }
                else if (margin < T.HEIGHT_MARGIN_WARNING_M) warnings.push(`Clearance margin very small: ${(margin * 1000).toFixed(0)}mm`);
                if (margin < minClearanceMargin) minClearanceMargin = margin;
            }

            const carriageway = restrWidthLimit !== null
                ? (capacity?.trafficableWidth_m ? Math.min(restrWidthLimit, capacity.trafficableWidth_m) : restrWidthLimit)
                : (capacity?.trafficableWidth_m || capacity?.carriageway_m || null);
            let widthPass = true;
            if (carriageway && width > 0) {
                const required = width + T.WIDTH_MARGIN_WARNING_M;
                const margin   = carriageway - required;
                if (margin < 0)    { widthPass = false; issues.push(`Width: Vehicle ${width}m + ${T.WIDTH_MARGIN_WARNING_M}m buffer exceeds carriageway ${carriageway}m`); }
                else if (margin < T.HEIGHT_MARGIN_WARNING_M) warnings.push(`Width margin tight: ${margin.toFixed(2)}m — traffic control may be required`);
            }

            const allPass = closurePass && massPass && clearancePass && widthPass;
            let verdict;
            if (!allPass)             verdict = 'FAIL';
            else if (warnings.length) verdict = 'CONDITIONS';
            else                       verdict = 'PASS';

            if (verdict === 'FAIL') {
                // Track the most restrictive (lowest effective limit) bridge
                const effectiveMass = massLimit || 9999;
                if (routeVerdict !== 'REFUSED' || effectiveMass < (limitingEffectiveMass || 9999)) {
                    limitingAsset      = bridge.bridgeId;
                    limitingConstraint = issues[0] || 'Engineering check failed';
                    limitingEffectiveMass = effectiveMass;
                }
                routeVerdict = 'REFUSED';
            } else if (verdict === 'CONDITIONS' && routeVerdict === 'APPROVED') {
                routeVerdict = 'APPROVED_WITH_CONDITIONS';
            }

            bridgeResults.push({
                sequence: rb.sequence || 0,
                bridgeUUID: bridge.ID,
                bridgeId: bridge.bridgeId,
                name: bridge.name,
                state: bridge.state,
                region: bridge.region,
                structureType: bridge.structureType,
                material: bridge.material,
                yearBuilt: bridge.yearBuilt,
                spanLengthM: bridge.spanLengthM,
                deckWidthM: bridge.deckWidthM,
                clearanceHeightM: bridge.clearanceHeightM,
                postingStatus: bridge.postingStatus,
                condition: bridge.condition,
                conditionRating: bridge.conditionRating,
                conditionScore: bridge.conditionScore,
                latitude: bridge.latitude,
                longitude: bridge.longitude,
                isCritical: !!rb.isCritical,
                isClosed,
                grossMassLimit_t: capacity?.grossMassLimit_t,
                minVerticalClearance_m: capacity?.minVerticalClearance_m,
                trafficableWidth_m: capacity?.trafficableWidth_m,
                carriageway_m: capacity?.carriageway_m,
                loadRatingFactor: capacity?.loadRatingFactor,
                loadRatingDate: capacity?.loadRatingDate,
                fatigueSensitive: capacity?.fatigueSensitive,
                remainingFatigueLife_years: capacity?.remainingFatigueLife_years,
                scourSafetyMargin_m: capacity?.scourSafetyMargin_m,
                effectiveMassLimit_t: massLimit,
                effectiveClearance_m: effectiveClearance,
                effectiveWidth_m: carriageway,
                activeRestrictions: activeRestr.map(r => ({
                    type: r.restrictionType, value: r.value, unit: r.unit,
                    isTemporary: !!(r.validFromDate), validFrom: r.validFromDate, validTo: r.validToDate,
                    notes: r.notes, permitRequired: r.permitRequired
                })),
                verdict, issues, warnings,
            });
        }

        const total   = bridgeResults.length;
        const passing = bridgeResults.filter(b => b.verdict === 'PASS').length;
        const warned  = bridgeResults.filter(b => b.verdict === 'CONDITIONS').length;
        const failing = bridgeResults.filter(b => b.verdict === 'FAIL').length;

        try {
            await db.run(UPDATE('nhvr.FreightRoute').set({ lastAssessedAt: new Date().toISOString() }).where({ ID: routeId }));
        } catch (_) {}

        await logAudit('ACTION', 'Assessment', routeId,
            'Route Assessment',
            `Route assessment completed: verdict=${routeVerdict}`,
            { vehicleGVM_t: gvm, verdict: routeVerdict, bridgeCount: bridgeResults.length }, req);

        return JSON.stringify({
            routeId, routeCode: route.routeCode, routeName: route.name,
            routeState: route.state, routeClass: route.routeClass,
            vehicleConfig: { gvm, gcm, height, width, length, speed, vehicleClass: vehicleClass || 'GENERAL' },
            assessedAt: new Date().toISOString(),
            routeVerdict, limitingAsset, limitingConstraint,
            summary: { total, passing, warned, failing },
            minMassMargin:      minMassMargin      < 9999 ? parseFloat(minMassMargin.toFixed(2))      : null,
            minClearanceMargin: minClearanceMargin < 9999 ? parseFloat(minClearanceMargin.toFixed(3)) : null,
            bridges: bridgeResults,
        });
    });

    // ── findAlternativeRoutes ─────────────────────────────────
    srv.on('findAlternativeRoutes', async (req) => {
        const { routeId, vehicleGVM_t, vehicleHeight_m, vehicleWidth_m, vehicleLength_m } = req.data;
        const db = await cds.connect.to('db');
        const T = await loadThresholds(db, null);

        const route = await db.run(SELECT.one.from('nhvr.FreightRoute').where({ ID: routeId }));
        if (!route) return req.error(404, 'Route not found');

        const gvm    = parseFloat(vehicleGVM_t)    || 0;
        const height = parseFloat(vehicleHeight_m) || 0;
        const width  = parseFloat(vehicleWidth_m)  || 0;
        const length = parseFloat(vehicleLength_m) || 0;

        const quickAssessBridgeLinks = async (bridgeLinks) => {
            let passing = 0, warned = 0, failing = 0;
            const keyBridges = [];
            const bridgeCoords = [];
            for (const rb of bridgeLinks) {
                const bridge = await db.run(
                    SELECT.one.from('nhvr.Bridge')
                        .columns('ID', 'bridgeId', 'name', 'postingStatus', 'clearanceHeightM',
                                 'latitude', 'longitude')
                        .where({ ID: rb.bridge_ID })
                );
                if (!bridge) continue;
                const cap = await db.run(
                    SELECT.one.from('nhvr.BridgeCapacity')
                        .columns('grossMassLimit_t', 'minVerticalClearance_m', 'trafficableWidth_m')
                        .where({ bridge_ID: rb.bridge_ID })
                );

                let verdict = 'PASS', keyIssue = null;

                if (bridge.postingStatus === 'CLOSED') {
                    verdict = 'FAIL'; keyIssue = 'CLOSED to traffic';
                } else {
                    if (cap?.grossMassLimit_t && gvm > 0) {
                        const m = parseFloat(cap.grossMassLimit_t) - gvm;
                        if (m < 0)  { verdict = 'FAIL';       keyIssue = `Mass ${gvm}t > limit ${cap.grossMassLimit_t}t`; }
                        else if (m < T.MASS_MARGIN_WARNING_T && verdict === 'PASS') { verdict = 'CONDITIONS'; keyIssue = `Mass margin ${m.toFixed(1)}t`; }
                    }
                    const clr = cap?.minVerticalClearance_m || parseFloat(bridge.clearanceHeightM) || null;
                    if (clr && height > 0) {
                        const m = clr - height;
                        if (m < 0)     { verdict = 'FAIL';       keyIssue = keyIssue || `Height ${height}m > clearance ${clr}m`; }
                        else if (m < T.HEIGHT_MARGIN_WARNING_M && verdict === 'PASS') { verdict = 'CONDITIONS'; keyIssue = keyIssue || `Height margin ${(m * 1000).toFixed(0)}mm`; }
                    }
                    if (cap?.trafficableWidth_m && width > 0) {
                        if (parseFloat(cap.trafficableWidth_m) - width < T.WIDTH_MARGIN_WARNING_M) {
                            if (verdict !== 'FAIL') { verdict = 'FAIL'; keyIssue = keyIssue || `Width clearance < ${T.WIDTH_MARGIN_WARNING_M}m safety buffer`; }
                        }
                    }
                    if ((bridge.postingStatus === 'POSTED' || bridge.postingStatus === 'REDUCED') && verdict === 'PASS') {
                        verdict = 'CONDITIONS'; keyIssue = `Posted / reduced-capacity bridge`;
                    }
                }

                if (verdict === 'FAIL') failing++;
                else if (verdict === 'CONDITIONS') warned++;
                else passing++;

                if (verdict !== 'PASS' || keyBridges.length < 3) {
                    keyBridges.push({
                        bridgeId : bridge.bridgeId || String(rb.bridge_ID).slice(0, 8),
                        name     : bridge.name || '—',
                        verdict,
                        keyIssue : keyIssue || null
                    });
                }
                if (bridge.latitude && bridge.longitude) {
                    bridgeCoords.push({
                        bridgeId : bridge.bridgeId || String(rb.bridge_ID).slice(0, 8),
                        name     : bridge.name || '—',
                        lat      : parseFloat(bridge.latitude),
                        lon      : parseFloat(bridge.longitude),
                        sequence : rb.sequence || 0,
                        verdict,
                        keyIssue : keyIssue || null
                    });
                }
            }
            bridgeCoords.sort((a, b) => a.sequence - b.sequence);
            return { total: bridgeLinks.length, passing, warned, failing,
                     keyBridges: keyBridges.slice(0, 6), bridgeCoords };
        };

        const alternatives = [];

        // 1. Internal FreightRoutes — same state, different route, ACTIVE
        const candidates = await db.run(
            SELECT.from('nhvr.FreightRoute').where({ state: route.state, status: 'ACTIVE' })
        );
        for (const cand of candidates) {
            if (cand.ID === routeId) continue;
            const massOk   = !cand.corridorMaxMass   || gvm    <= parseFloat(cand.corridorMaxMass);
            const heightOk = !cand.corridorMaxHeight || height <= parseFloat(cand.corridorMaxHeight);
            const corridorOk = massOk && heightOk;

            const bridgeLinks = await db.run(
                SELECT.from('nhvr.FreightRouteBridge')
                    .columns('bridge_ID', 'sequence')
                    .where({ route_ID: cand.ID })
                    .orderBy('sequence')
            );

            const assetSummary = corridorOk && bridgeLinks.length > 0
                ? await quickAssessBridgeLinks(bridgeLinks)
                : { total: bridgeLinks.length, passing: 0, warned: 0, failing: 0, keyBridges: [] };

            const verdict = corridorOk
                ? (assetSummary.failing > 0 ? 'NOT_VIABLE' : 'VIABLE')
                : 'NOT_VIABLE';

            let reason;
            if (!corridorOk) {
                reason = !massOk
                    ? `Corridor mass limit ${cand.corridorMaxMass}t < vehicle GVM ${gvm}t`
                    : `Corridor height limit ${cand.corridorMaxHeight}m < vehicle height ${height}m`;
            } else if (assetSummary.failing > 0) {
                const first = assetSummary.keyBridges.find(b => b.verdict === 'FAIL');
                reason = `${assetSummary.failing} bridge(s) fail vehicle checks`
                    + (first ? ` — limiting asset: ${first.bridgeId} (${first.keyIssue})` : '');
            } else {
                reason = `${assetSummary.passing} of ${assetSummary.total} bridges pass`
                    + (assetSummary.warned > 0 ? `, ${assetSummary.warned} with conditions` : '');
            }

            alternatives.push({
                type: 'INTERNAL', routeId: cand.ID, routeCode: cand.routeCode,
                name: cand.name || cand.routeCode, state: cand.state, routeClass: cand.routeClass,
                corridorMaxMass: cand.corridorMaxMass, corridorMaxHeight: cand.corridorMaxHeight,
                bridgeCount: assetSummary.total, distanceKm: null,
                assetSummary,
                bridgeCoords: assetSummary.bridgeCoords || [],
                verdict,
                reason,
                source: 'NHVR Internal Network',
            });
        }

        // 2. ApprovedRoutes (APPROVED + active)
        const approvedRoutes = await db.run(
            SELECT.from('nhvr.ApprovedRoute').where({ routeStatus: 'APPROVED', active: true })
                .columns('ID', 'routeId', 'routeName', 'startPoint', 'endPoint', 'totalDistanceKm',
                         'routeGrossLimit_t', 'routeHeightLimit_m', 'routeWidthLimit_m', 'limitingConstraint')
        );
        for (const ar of approvedRoutes) {
            const massOk   = !ar.routeGrossLimit_t  || gvm    <= parseFloat(ar.routeGrossLimit_t);
            const heightOk = !ar.routeHeightLimit_m || height <= parseFloat(ar.routeHeightLimit_m);
            const widthOk  = !ar.routeWidthLimit_m  || width  <= parseFloat(ar.routeWidthLimit_m);
            const viable   = massOk && heightOk && widthOk;

            const bridgeLinks = await db.run(
                SELECT.from('nhvr.ApprovedRouteBridge')
                    .columns('bridge_ID', 'sequence')
                    .where({ route_ID: ar.ID })
                    .orderBy('sequence')
            );
            const assetSummary = viable && bridgeLinks.length > 0
                ? await quickAssessBridgeLinks(bridgeLinks)
                : { total: bridgeLinks.length, passing: 0, warned: 0, failing: 0, keyBridges: [] };

            const effectiveVerdict = viable
                ? (assetSummary.failing > 0 ? 'NOT_VIABLE' : 'VIABLE')
                : 'NOT_VIABLE';

            let reason;
            if (!viable) {
                reason = !massOk ? `Route mass limit ${ar.routeGrossLimit_t}t insufficient`
                    : !heightOk  ? `Route height limit ${ar.routeHeightLimit_m}m insufficient`
                                 : `Route width limit ${ar.routeWidthLimit_m}m insufficient`;
            } else if (assetSummary.failing > 0) {
                const first = assetSummary.keyBridges.find(b => b.verdict === 'FAIL');
                reason = `${assetSummary.failing} bridge(s) fail vehicle checks`
                    + (first ? ` — ${first.bridgeId}: ${first.keyIssue}` : '');
            } else {
                reason = `Approved route — ${assetSummary.passing} of ${assetSummary.total} bridges pass`
                    + (assetSummary.warned > 0 ? `, ${assetSummary.warned} with conditions` : '');
            }

            alternatives.push({
                type: 'APPROVED_ROUTE', routeId: ar.ID, routeCode: ar.routeId,
                name: ar.routeName, state: route.state,
                startPoint: ar.startPoint, endPoint: ar.endPoint,
                corridorMaxMass: ar.routeGrossLimit_t, corridorMaxHeight: ar.routeHeightLimit_m,
                corridorMaxWidth: ar.routeWidthLimit_m, distanceKm: ar.totalDistanceKm,
                bridgeCount: assetSummary.total,
                assetSummary,
                bridgeCoords: assetSummary.bridgeCoords || [],
                verdict: effectiveVerdict,
                reason,
                limitingConstraint: ar.limitingConstraint,
                source: 'NHVR Approved Route Register',
            });
        }

        // 3. OSRM — Open Source Routing Machine (OpenStreetMap)
        const routeBridges = await db.run(
            SELECT.from('nhvr.FreightRouteBridge').where({ route_ID: routeId }).orderBy('sequence')
        );
        let osrmNote = 'No bridge coordinates available — cannot call OSRM routing.';
        if (routeBridges.length >= 2) {
            const firstBr = await db.run(
                SELECT.one.from('nhvr.Bridge').columns('ID', 'bridgeId', 'name', 'latitude', 'longitude')
                    .where({ ID: routeBridges[0].bridge_ID })
            );
            const lastBr = await db.run(
                SELECT.one.from('nhvr.Bridge').columns('ID', 'bridgeId', 'name', 'latitude', 'longitude')
                    .where({ ID: routeBridges[routeBridges.length - 1].bridge_ID })
            );
            if (firstBr?.longitude && firstBr?.latitude && lastBr?.longitude && lastBr?.latitude) {
                try {
                    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/` +
                        `${firstBr.longitude},${firstBr.latitude};${lastBr.longitude},${lastBr.latitude}` +
                        `?alternatives=3&overview=simplified&geometries=geojson&steps=false`;
                    const resp = await fetch(osrmUrl, {
                        headers: { 'User-Agent': 'NHVR-Bridge-Management/3.2 (nhvr.gov.au)' },
                        signal: AbortSignal.timeout(8000)
                    });
                    if (resp.ok) {
                        const osrmData = await resp.json();
                        if (osrmData.code === 'Ok') {
                            (osrmData.routes || []).forEach((r, i) => {
                                const distKm = (r.distance / 1000).toFixed(1);
                                const durMin = Math.round(r.duration / 60);
                                alternatives.push({
                                    type      : 'OSRM',
                                    routeCode : i === 0 ? 'OSM-PRIMARY' : `OSM-ALT-${i}`,
                                    name      : i === 0
                                        ? `Primary Road Path (OpenStreetMap)`
                                        : `Alternative Road Path ${i} (OpenStreetMap)`,
                                    state     : route.state,
                                    distanceKm: parseFloat(distKm),
                                    durationMin: durMin,
                                    bridgeCount: null,
                                    bridgeCoords: [],
                                    corridorMaxMass: null, corridorMaxHeight: null,
                                    assetSummary: null,
                                    osrmGeometry: r.geometry ? r.geometry.coordinates : null,
                                    verdict   : 'UNASSESSED',
                                    reason    : `OpenStreetMap road route — ${distKm} km, ~${durMin} min. ` +
                                        `NHVR bridge compliance NOT assessed — contains ${routeBridges.length} known bridges ` +
                                        `on source route. Field verification required before use.`,
                                    source    : 'OSRM / OpenStreetMap',
                                    startCoord: `${firstBr.latitude},${firstBr.longitude}`,
                                    endCoord  : `${lastBr.latitude},${lastBr.longitude}`,
                                    startBridge: firstBr.bridgeId || firstBr.name,
                                    endBridge  : lastBr.bridgeId  || lastBr.name,
                                });
                            });
                            osrmNote = null;
                        } else {
                            osrmNote = `OSRM returned code: ${osrmData.code}`;
                        }
                    } else {
                        osrmNote = `OSRM HTTP ${resp.status}`;
                    }
                } catch (e) {
                    osrmNote = `OSRM call failed: ${e.message}`;
                    LOG.warn('[NHVR] OSRM call failed:', e.message);
                }
            } else {
                osrmNote = `Bridge coordinates missing (${firstBr?.bridgeId || 'first'} or ${lastBr?.bridgeId || 'last'} bridge lacks lat/lon)`;
            }
        }

        const order = { VIABLE: 0, UNASSESSED: 1, NOT_VIABLE: 2 };
        const typeOrder = { INTERNAL: 0, APPROVED_ROUTE: 1, OSRM: 2 };
        alternatives.sort((a, b) => {
            const vd = (order[a.verdict] ?? 1) - (order[b.verdict] ?? 1);
            return vd !== 0 ? vd : (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
        });

        return JSON.stringify({
            sourceRouteId: routeId, sourceRouteCode: route.routeCode,
            vehicleConfig: { gvm, height, width, length },
            generatedAt: new Date().toISOString(),
            osrmNote,
            alternatives,
        });
    });

    // ── assessRouteGeometry — Route Planner spatial bridge discovery ──
    srv.on('assessRouteGeometry', async (req) => {
        const { routeCoords, vehicleGVM_t, vehicleGCM_t, vehicleHeight_m,
                vehicleWidth_m, vehicleLength_m, crossingSpeed, vehicleClass } = req.data;

        // Vehicle dimension range validation (reasonable limits for AU heavy vehicles)
        if (vehicleGVM_t !== undefined && (vehicleGVM_t < 0 || vehicleGVM_t > 500)) {
            return req.reject(400, 'Vehicle GVM must be between 0 and 500 tonnes');
        }
        if (vehicleHeight_m !== undefined && (vehicleHeight_m < 0 || vehicleHeight_m > 10)) {
            return req.reject(400, 'Vehicle height must be between 0 and 10 metres');
        }
        if (vehicleWidth_m !== undefined && (vehicleWidth_m < 0 || vehicleWidth_m > 10)) {
            return req.reject(400, 'Vehicle width must be between 0 and 10 metres');
        }
        if (vehicleLength_m !== undefined && (vehicleLength_m < 0 || vehicleLength_m > 60)) {
            return req.reject(400, 'Vehicle length must be between 0 and 60 metres');
        }

        if (!routeCoords) return req.error(400, 'routeCoords is required');
        let coords;
        try {
            coords = JSON.parse(routeCoords);
        } catch (e) {
            return req.error(400, 'routeCoords must be valid JSON array of [lon,lat] pairs');
        }
        if (!Array.isArray(coords) || coords.length < 2) {
            return req.error(400, 'routeCoords must contain at least 2 coordinate pairs');
        }

        const gvm    = parseFloat(vehicleGVM_t)    || 0;
        const gcm    = parseFloat(vehicleGCM_t)    || 0;
        const height = parseFloat(vehicleHeight_m) || 0;
        const width  = parseFloat(vehicleWidth_m)  || 0;
        const length = parseFloat(vehicleLength_m) || 0;
        const speed  = parseInt(crossingSpeed)     || 80;
        const today  = new Date().toISOString().slice(0, 10);

        function haversineM(lon1, lat1, lon2, lat2) {
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2
                + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
                * Math.sin(dLon / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(a));
        }

        function minDistToRoute(bridgeLon, bridgeLat) {
            let minDist = Infinity;
            for (let i = 0; i < coords.length - 1; i++) {
                const [lon1, lat1] = coords[i];
                const [lon2, lat2] = coords[i + 1];
                const dx = lon2 - lon1;
                const dy = lat2 - lat1;
                const lenSq = dx * dx + dy * dy;
                const t = lenSq > 0
                    ? Math.max(0, Math.min(1, ((bridgeLon - lon1) * dx + (bridgeLat - lat1) * dy) / lenSq))
                    : 0;
                const closestLon = lon1 + t * dx;
                const closestLat = lat1 + t * dy;
                const d = haversineM(bridgeLon, bridgeLat, closestLon, closestLat);
                if (d < minDist) minDist = d;
            }
            return minDist;
        }

        const db = await cds.connect.to('db');
        const T = await loadThresholds(db, null);

        const BUFFER_DEG = 0.03;
        const PROXIMITY_M = T.PROXIMITY_RADIUS_M;
        const lons = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        const minLon = Math.min(...lons) - BUFFER_DEG;
        const maxLon = Math.max(...lons) + BUFFER_DEG;
        const minLat = Math.min(...lats) - BUFFER_DEG;
        const maxLat = Math.max(...lats) + BUFFER_DEG;

        const bbBridges = await db.run(
            SELECT.from('nhvr.Bridge')
                .where({ isActive: true })
                .and('latitude is not null')
                .and('longitude is not null')
                .and('latitude >=', minLat).and('latitude <=', maxLat)
                .and('longitude >=', minLon).and('longitude <=', maxLon)
        );

        const nearbyBridges = [];
        for (const b of bbBridges) {
            const bLon = parseFloat(b.longitude);
            const bLat = parseFloat(b.latitude);
            if (isNaN(bLon) || isNaN(bLat)) continue;
            const dist = minDistToRoute(bLon, bLat);
            // Phase D20: Graduated proximity buffers
            let proximityTier;
            if (dist <= 50)           proximityTier = 'CROSSING';   // Bridge is directly on route
            else if (dist <= 200)     proximityTier = 'ADJACENT';   // Adjacent to route
            else if (dist <= PROXIMITY_M) proximityTier = 'NEARBY'; // Within proximity radius
            else continue;  // Outside all buffers — skip

            let nearestIdx = 0;
            let nearestD   = Infinity;
            for (let i = 0; i < coords.length; i++) {
                const d = haversineM(bLon, bLat, coords[i][0], coords[i][1]);
                if (d < nearestD) { nearestD = d; nearestIdx = i; }
            }
            nearbyBridges.push({ ...b, _distM: dist, _seqIdx: nearestIdx, _proximityTier: proximityTier });
        }
        nearbyBridges.sort((a, b) => a._seqIdx - b._seqIdx);

        const bridgeResults = [];
        let routeVerdict       = 'APPROVED';
        let limitingAsset      = null;
        let limitingConstraint = null;
        let limitingEffectiveMass = 9999;
        let minMassMargin      = 9999;
        let minClearanceMargin = 9999;

        for (const bridge of nearbyBridges) {
            const capacity = await db.run(SELECT.one.from('nhvr.BridgeCapacity').where({ bridge_ID: bridge.ID }));
            const allRestr = await db.run(
                SELECT.from('nhvr.Restriction').where({ bridge_ID: bridge.ID, isActive: true, status: 'ACTIVE' })
            );
            const activeRestr = allRestr.filter(r => {
                if (r.validFromDate && r.validToDate) return r.validFromDate <= today && r.validToDate >= today;
                return true;
            });

            const isClosed = bridge.postingStatus === 'CLOSED';
            const issues   = [];
            const warnings = [];
            let closurePass = !isClosed;
            if (isClosed) issues.push('Bridge is CLOSED to traffic');

            let restrMassLimit = null, restrHeightLimit = null, restrWidthLimit = null;
            for (const r of activeRestr) {
                const t = (r.restrictionType || '').toUpperCase();
                if (t === 'GROSS_MASS' || t === 'MASS') {
                    const v = parseFloat(r.value) || 0;
                    if (restrMassLimit === null || v < restrMassLimit) restrMassLimit = v;
                }
                if (t === 'HEIGHT') {
                    const v = parseFloat(r.value) || 0;
                    if (restrHeightLimit === null || v < restrHeightLimit) restrHeightLimit = v;
                }
                if (t === 'WIDTH') {
                    const v = parseFloat(r.value) || 0;
                    if (restrWidthLimit === null || v < restrWidthLimit) restrWidthLimit = v;
                }
                if (t === 'CLOSURE' || t === 'CLOSED') {
                    closurePass = false;
                    issues.push(`Active ${r.validFromDate ? 'temporary' : 'permanent'} closure restriction`);
                }
            }

            const massLimit = restrMassLimit !== null
                ? (capacity?.grossMassLimit_t ? Math.min(restrMassLimit, capacity.grossMassLimit_t) : restrMassLimit)
                : (capacity?.grossMassLimit_t || null);
            let massPass = true;
            if (massLimit && gvm > 0) {
                const margin = massLimit - gvm;
                if (margin < 0)  { massPass = false; issues.push(`Mass: GVM ${gvm}t exceeds limit ${massLimit}t by ${Math.abs(margin).toFixed(1)}t`); }
                else if (margin < T.MASS_MARGIN_WARNING_T) warnings.push(`Mass margin small: ${margin.toFixed(1)}t`);
                if (margin < minMassMargin) minMassMargin = margin;
            }

            const effectiveClearance = restrHeightLimit !== null
                ? (capacity?.minVerticalClearance_m ? Math.min(restrHeightLimit, capacity.minVerticalClearance_m) : restrHeightLimit)
                : (capacity?.minVerticalClearance_m || bridge.clearanceHeightM || null);
            let clearancePass = true;
            if (effectiveClearance && height > 0) {
                const margin = effectiveClearance - height;
                if (margin < 0)      { clearancePass = false; issues.push(`Clearance: Height ${height}m exceeds clearance ${effectiveClearance}m`); }
                else if (margin < T.HEIGHT_MARGIN_WARNING_M) warnings.push(`Clearance margin very small: ${(margin * 1000).toFixed(0)}mm`);
                if (margin < minClearanceMargin) minClearanceMargin = margin;
            }

            const carriageway = restrWidthLimit !== null
                ? (capacity?.trafficableWidth_m ? Math.min(restrWidthLimit, capacity.trafficableWidth_m) : restrWidthLimit)
                : (capacity?.trafficableWidth_m || capacity?.carriageway_m || null);
            let widthPass = true;
            if (carriageway && width > 0) {
                const required = width + T.WIDTH_MARGIN_WARNING_M;
                const margin   = carriageway - required;
                if (margin < 0)    { widthPass = false; issues.push(`Width: Vehicle ${width}m + ${T.WIDTH_MARGIN_WARNING_M}m buffer exceeds carriageway ${carriageway}m`); }
                else if (margin < T.HEIGHT_MARGIN_WARNING_M) warnings.push(`Width margin tight: ${margin.toFixed(2)}m`);
            }

            const allPass = closurePass && massPass && clearancePass && widthPass;
            let verdict;
            if (!allPass)             verdict = 'FAIL';
            else if (warnings.length) verdict = 'CONDITIONS';
            else                       verdict = 'PASS';

            if (verdict === 'FAIL') {
                const effectiveMass = massLimit || 9999;
                if (routeVerdict !== 'REFUSED' || effectiveMass < (limitingEffectiveMass || 9999)) {
                    limitingAsset      = bridge.bridgeId;
                    limitingConstraint = issues[0] || 'Engineering check failed';
                    limitingEffectiveMass = effectiveMass;
                }
                routeVerdict = 'REFUSED';
            } else if (verdict === 'CONDITIONS' && routeVerdict === 'APPROVED') {
                routeVerdict = 'APPROVED_WITH_CONDITIONS';
            }

            const hierarchy = (bridge.roadHierarchy || '').toUpperCase();
            let roadCategory;
            if      (hierarchy === 'NATIONAL') roadCategory = 'National Highway';
            else if (hierarchy === 'STATE')    roadCategory = 'State Highway';
            else if (hierarchy === 'REGIONAL') roadCategory = 'Regional Road';
            else if (hierarchy === 'LOCAL')    roadCategory = 'Council Road';
            else if (bridge.assetOwner && /council|shire|city|municipal/i.test(bridge.assetOwner))
                                               roadCategory = 'Council Road';
            else if (bridge.roadRoute && /highway|hwy|freeway|motorway|pacific|hume|bruce|great/i.test(bridge.roadRoute))
                                               roadCategory = 'State Highway';
            else                               roadCategory = 'Other / Unknown';

            bridgeResults.push({
                sequence: bridge._seqIdx,
                proximityM: Math.round(bridge._distM),
                proximityTier: bridge._proximityTier,
                proximityDistance_m: Math.round(bridge._distM),
                bridgeUUID: bridge.ID,
                bridgeId: bridge.bridgeId,
                name: bridge.name,
                state: bridge.state,
                region: bridge.region,
                structureType: bridge.structureType,
                material: bridge.material,
                yearBuilt: bridge.yearBuilt,
                spanLengthM: bridge.spanLengthM,
                deckWidthM: bridge.deckWidthM,
                clearanceHeightM: bridge.clearanceHeightM,
                postingStatus: bridge.postingStatus,
                condition: bridge.condition,
                conditionRating: bridge.conditionRating,
                conditionScore: bridge.conditionScore,
                latitude: parseFloat(bridge.latitude),
                longitude: parseFloat(bridge.longitude),
                roadRoute: bridge.roadRoute || null,
                routeNumber: bridge.routeNumber || null,
                roadHierarchy: hierarchy || null,
                roadCategory,
                assetOwner: bridge.assetOwner || null,
                maintenanceAuthority: bridge.maintenanceAuthority || null,
                lga: bridge.lga || null,
                councilArea: bridge.councilArea || null,
                isClosed,
                grossMassLimit_t: capacity?.grossMassLimit_t,
                minVerticalClearance_m: capacity?.minVerticalClearance_m,
                trafficableWidth_m: capacity?.trafficableWidth_m,
                carriageway_m: capacity?.carriageway_m,
                loadRatingFactor: capacity?.loadRatingFactor,
                effectiveMassLimit_t: massLimit,
                effectiveClearance_m: effectiveClearance,
                effectiveWidth_m: carriageway,
                activeRestrictions: activeRestr.map(r => ({
                    type: r.restrictionType, value: r.value, unit: r.unit,
                    isTemporary: !!(r.validFromDate), validFrom: r.validFromDate, validTo: r.validToDate,
                    notes: r.notes, permitRequired: r.permitRequired
                })),
                verdict, issues, warnings,
            });
        }

        const total   = bridgeResults.length;
        const passing = bridgeResults.filter(b => b.verdict === 'PASS').length;
        const warned  = bridgeResults.filter(b => b.verdict === 'CONDITIONS').length;
        const failing = bridgeResults.filter(b => b.verdict === 'FAIL').length;

        const categoryMap = {};
        for (const b of bridgeResults) {
            const cat = b.roadCategory || 'Other / Unknown';
            if (!categoryMap[cat]) categoryMap[cat] = { total: 0, passing: 0, warned: 0, failing: 0 };
            categoryMap[cat].total++;
            if (b.verdict === 'PASS')            categoryMap[cat].passing++;
            else if (b.verdict === 'CONDITIONS') categoryMap[cat].warned++;
            else if (b.verdict === 'FAIL')       categoryMap[cat].failing++;
        }
        const roadCategorySummary = Object.entries(categoryMap)
            .map(([category, counts]) => ({ category, ...counts }))
            .sort((a, b) => b.total - a.total);

        await logAudit('ACTION', 'Assessment', 'geometry',
            'Route Assessment',
            `Route assessment completed: verdict=${routeVerdict}`,
            { vehicleGVM_t: gvm, verdict: routeVerdict, bridgeCount: bridgeResults.length }, req);

        return JSON.stringify({
            vehicleConfig: { gvm, gcm, height, width, length, speed, vehicleClass: vehicleClass || 'GENERAL' },
            assessedAt: new Date().toISOString(),
            routeVerdict, limitingAsset, limitingConstraint,
            summary: { total, passing, warned, failing },
            roadCategorySummary,
            bridgesInSearchRadius: bbBridges.length,
            proximityThresholdM: PROXIMITY_M,
            minMassMargin:      minMassMargin      < 9999 ? parseFloat(minMassMargin.toFixed(2))      : null,
            minClearanceMargin: minClearanceMargin < 9999 ? parseFloat(minClearanceMargin.toFixed(3)) : null,
            bridges: bridgeResults,
        });
    });

    // ── validateRoute — Pre-Trip Validation API for fleet/TMS integration ──
    srv.on('validateRoute', async (req) => {
        // Rate limit: simple in-memory counter
        // (production should use Redis or BTP rate-limiting)
        const userId = req.user?.id || 'anonymous';
        if (!global._nhvrRateLimits) global._nhvrRateLimits = {};
        const now = Date.now();
        const userLimits = global._nhvrRateLimits[userId] || { count: 0, windowStart: now };
        if (now - userLimits.windowStart > 3600000) {
            // Reset window every hour
            userLimits.count = 0;
            userLimits.windowStart = now;
        }
        userLimits.count++;
        global._nhvrRateLimits[userId] = userLimits;
        if (userLimits.count > 100) {
            return req.reject(429, 'Rate limit exceeded. Maximum 100 requests per hour.');
        }

        const { routeGeometry, vehicleGVM_t, vehicleGCM_t, vehicleHeight_m,
                vehicleWidth_m, vehicleLength_m, crossingSpeed_kmh, vehicleClass } = req.data;

        // Input validation
        if (!routeGeometry) return req.reject(400, 'routeGeometry is required (GeoJSON LineString)');
        if (!vehicleGVM_t || vehicleGVM_t <= 0) return req.reject(400, 'vehicleGVM_t is required and must be > 0');

        // Delegate to assessRouteGeometry with mapped parameter names
        const result = await srv.send('assessRouteGeometry', {
            routeCoords:     routeGeometry,
            vehicleGVM_t:    vehicleGVM_t,
            vehicleGCM_t:    vehicleGCM_t,
            vehicleHeight_m: vehicleHeight_m,
            vehicleWidth_m:  vehicleWidth_m,
            vehicleLength_m: vehicleLength_m,
            crossingSpeed:   crossingSpeed_kmh,
            vehicleClass:    vehicleClass
        });
        return result;
    });

    // ── proxyRoute — ORS HGV routing proxy ───────────────────
    srv.on('proxyRoute', async (req) => {
        const correlationId = getCorrelationId(req);
        const { startLon, startLat, endLon, endLat } = req.data;

        if (!startLon || !startLat || !endLon || !endLat) {
            return req.error(400, 'Coordinates are required: startLon, startLat, endLon, endLat');
        }
        if (Math.abs(startLat) > 90 || Math.abs(endLat) > 90 ||
            Math.abs(startLon) > 180 || Math.abs(endLon) > 180) {
            return req.error(400, 'Coordinates out of valid range');
        }

        try {
            const apiKey = process.env.ORS_API_KEY;
            if (!apiKey) return req.error(500, 'ORS_API_KEY environment variable is not configured. Contact your system administrator.');
            const url = `https://api.openrouteservice.org/v2/directions/driving-hgv?` +
                `api_key=${apiKey}&` +
                `start=${startLon},${startLat}&` +
                `end=${endLon},${endLat}`;
            const https = require('https');
            const result = await new Promise((resolve, reject) => {
                https.get(url, { headers: { 'User-Agent': 'NHVR-BridgeManagement/3.2.1' } }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            LOG.info(`[${correlationId}] proxyRoute: ORS routing completed`);
            return result;
        } catch (err) {
            LOG.error(`[${correlationId}] proxyRoute error:`, err.message);
            return req.error(502, `Routing service unavailable: ${err.message}`);
        }
    });

    // ── geocodeAddress — Nominatim forward geocode proxy ─────
    srv.on('geocodeAddress', async (req) => {
        const correlationId = getCorrelationId(req);
        const { address } = req.data;

        if (!address || String(address).trim().length === 0) {
            return req.error(400, 'Address is required');
        }
        const safeAddress = String(address).replace(/[<>'"]/g, '').slice(0, 200);

        try {
            const encodedAddr = encodeURIComponent(safeAddress);
            const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddr}&format=json&limit=5&countrycodes=au`;
            const https = require('https');
            const result = await new Promise((resolve, reject) => {
                https.get(url, {
                    headers: {
                        'User-Agent': 'NHVR-BridgeManagement/3.2.1 (nhvr.gov.au)',
                        'Accept-Language': 'en-AU'
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            LOG.info(`[${correlationId}] geocodeAddress: completed for "${safeAddress.slice(0, 30)}..."`);
            return result;
        } catch (err) {
            LOG.error(`[${correlationId}] geocodeAddress error:`, err.message);
            return req.error(502, `Geocoding service unavailable: ${err.message}`);
        }
    });

    // ── reverseGeocode — Nominatim reverse geocode proxy ─────
    srv.on('reverseGeocode', async (req) => {
        const correlationId = getCorrelationId(req);
        const { lat, lon } = req.data;

        if (typeof lat !== 'number' && typeof lat !== 'string') return req.error(400, 'lat is required');
        if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) {
            return req.error(400, 'Coordinates out of valid range');
        }

        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
            const https = require('https');
            const result = await new Promise((resolve, reject) => {
                https.get(url, {
                    headers: { 'User-Agent': 'NHVR-BridgeManagement/3.2.1 (nhvr.gov.au)' }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            LOG.info(`[${correlationId}] reverseGeocode: ${lat},${lon} completed`);
            return result;
        } catch (err) {
            LOG.error(`[${correlationId}] reverseGeocode error:`, err.message);
            return req.error(502, `Reverse geocoding unavailable: ${err.message}`);
        }
    });
};
