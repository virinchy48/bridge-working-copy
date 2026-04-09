'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-reports');

module.exports = function registerReportHandlers(srv, helpers) {
    const { getBridge, getBridgeByKey } = helpers;

    // ── bridgeComplianceReport ─────────────────────────────────
    srv.on('bridgeComplianceReport', async (req) => {
        const db = await cds.connect.to('db');
        const issues = [];
        const bridges = await db.run(SELECT.from('nhvr.Bridge').where({ isActive: true }));
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const twoYearsAgoStr = twoYearsAgo.toISOString().split('T')[0];
        for (const b of bridges) {
            if (!b.nhvrRouteAssessed) {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: 'NHVR route assessment not completed', severity: 'MEDIUM',
                    recommendation: 'Submit bridge for NHVR route assessment at nhvr.gov.au/road-access/route-assessments' });
            }
            if ((b.postingStatus === 'POSTED' || b.postingStatus === 'CLOSED') && !b.gazetteRef) {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: `Bridge is ${b.postingStatus} but has no Gazette reference`, severity: 'HIGH',
                    recommendation: 'Obtain and record Gazette notice reference for regulatory compliance' });
            }
            if (b.inspectionDate && b.inspectionDate < twoYearsAgoStr) {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: `Inspection overdue (last: ${b.inspectionDate})`, severity: 'HIGH',
                    recommendation: 'Schedule routine inspection immediately per AS 5100 requirements' });
            }
            if (b.conditionRating != null && b.conditionRating <= 3) {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: `Critical condition rating: ${b.conditionRating}/10`, severity: 'CRITICAL',
                    recommendation: 'Immediate structural assessment required. Consider temporary closure pending rehabilitation.' });
            }
            if (b.scourRisk === 'CRITICAL') {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: 'Critical scour risk with no scour protection recorded', severity: 'HIGH',
                    recommendation: 'Commission underwater scour inspection and implement scour protection measures' });
            }
            if (b.highPriorityAsset && !b.sourceRefURL) {
                issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                    issue: 'High priority asset missing data provenance URL', severity: 'MEDIUM',
                    recommendation: 'Add sourceRefURL linking to authoritative open data portal record' });
            }
        }
        const inspections = await db.run(SELECT.from('nhvr.InspectionRecord').where({ criticalDefects: { '>': 0 } }));
        const latestByBridge = {};
        for (const ins of inspections) {
            if (!latestByBridge[ins.bridge_ID] || ins.inspectionDate > latestByBridge[ins.bridge_ID].inspectionDate)
                latestByBridge[ins.bridge_ID] = ins;
        }
        const bridgeMap = {};
        for (const b of bridges) bridgeMap[b.ID] = b;
        for (const ins of Object.values(latestByBridge)) {
            const b = bridgeMap[ins.bridge_ID];
            if (b) issues.push({ bridgeId: b.bridgeId, bridgeName: b.name, state: b.state,
                issue: `${ins.criticalDefects} critical defect(s) found in inspection ${ins.inspectionDate}`, severity: 'CRITICAL',
                recommendation: 'Review inspection report and implement defect rectification programme immediately' });
        }
        return issues.sort((a, b) => {
            const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            return (order[a.severity] || 9) - (order[b.severity] || 9);
        });
    });

    // ── assessRestriction ──────────────────────────────────────
    srv.on('assessRestriction', async (req) => {
        const { bridgeId, grossMassT, axleLoadT, heightM } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db, true);
        if (!bridge) return req.error(404, `Bridge "${bridgeId}" not found`);
        const restrictions = await db.run(
            SELECT.from('nhvr.Restriction').where({ bridge_ID: bridge.ID, status: 'ACTIVE', isActive: true })
        );
        const violations = [];
        let permitRequired = false;
        const gazetteRefs = [];
        for (const r of restrictions) {
            let violated = false;
            if (r.restrictionType === 'MASS'             && grossMassT && parseFloat(grossMassT) > r.value) violated = true;
            if (r.restrictionType === 'AXLE_MASS'        && axleLoadT  && parseFloat(axleLoadT)  > r.value) violated = true;
            if (r.restrictionType === 'HEIGHT'           && heightM    && parseFloat(heightM)    > r.value) violated = true;
            if (r.restrictionType === 'COMBINATION_MASS' && grossMassT && parseFloat(grossMassT) > r.value) violated = true;
            if (violated) {
                violations.push({ restrictionType: r.restrictionType, value: r.value, unit: r.unit,
                    nhvrRef: r.nhvrRef||'', gazetteRef: r.gazetteRef||'' });
                if (r.permitRequired) permitRequired = true;
                if (r.gazetteRef) gazetteRefs.push(r.gazetteRef);
            }
        }
        const permitted = violations.length === 0;
        let message;
        if      (permitted)      message = `Vehicle is permitted to cross ${bridge.name}. All dimension and mass limits satisfied.`;
        else if (permitRequired) message = `Permit may be available for ${bridge.name}. ${violations.length} restriction(s) exceeded — apply for NHVR permit.`;
        else                     message = `Access PROHIBITED to ${bridge.name}. ${violations.length} restriction(s) exceeded with no permit option.`;
        return { permitted, permitRequired, message,
            nhvrPermitUrl: 'https://www.nhvr.gov.au/road-access/permits',
            gazetteRef: gazetteRefs.join(', ') };
    });

    // ── getAssetRegister (CDS query — HANA + SQLite compatible) ─
    srv.on('getAssetRegister', async (req) => {
        const p = req.data;
        const db = await cds.connect.to('db');
        const limit  = Math.min(Math.max(parseInt(p.pageSize  || 200, 10), 1), 500);
        const offset = Math.max(parseInt(p.pageOffset || 0,   10), 0);
        try {
            // Build CDS-compatible WHERE conditions
            let q = SELECT.from('nhvr.Bridge').limit(limit, offset).orderBy('state','region','bridgeId');
            const conds = [];
            if (p.assetClass)    conds.push({ assetClass: String(p.assetClass).slice(0,200) });
            if (p.state)         conds.push({ state: String(p.state).slice(0,200) });
            if (p.postingStatus) conds.push({ postingStatus: String(p.postingStatus).slice(0,200) });
            if (p.condition)     conds.push({ condition: String(p.condition).slice(0,200) });
            if (p.criticality)   conds.push({ criticality: String(p.criticality).slice(0,200) });
            if (p.isActive === true) conds.push({ isActive: true });
            for (const c of conds) q = q.where(c);
            if (p.region) q = q.where(`LOWER(region) LIKE LOWER(?)`, ['%' + String(p.region).slice(0,200) + '%']);
            if (p.conditionMin && parseInt(p.conditionMin) > 0) q = q.where('conditionRating >=', parseInt(p.conditionMin));
            if (p.conditionMax && parseInt(p.conditionMax) > 0) q = q.where('conditionRating <=', parseInt(p.conditionMax));
            if (p.yearBuiltFrom && parseInt(p.yearBuiltFrom) > 0) q = q.where('yearBuilt >=', parseInt(p.yearBuiltFrom));
            if (p.yearBuiltTo   && parseInt(p.yearBuiltTo)   > 0) q = q.where('yearBuilt <=', parseInt(p.yearBuiltTo));
            const bridges = await db.run(q);
            if (!bridges || !bridges.length) return [];

            // Batch-fetch restriction counts and capacity for all bridge IDs
            const ids = bridges.map(b => b.ID);
            const restrictions = await db.run(SELECT.from('nhvr.Restriction').columns('bridge_ID').where({ bridge_ID: { in: ids }, status: 'ACTIVE' }));
            const rCounts = {};
            for (const r of restrictions) rCounts[r.bridge_ID] = (rCounts[r.bridge_ID]||0) + 1;
            let capMap = {};
            try {
                const caps = await db.run(SELECT.from('nhvr.BridgeCapacity').columns('bridge_ID','grossMassLimit_t').where({ bridge_ID: { in: ids } }));
                for (const c of caps) { if (!capMap[c.bridge_ID]) capMap[c.bridge_ID] = c.grossMassLimit_t; }
            } catch (e) { /* BridgeCapacity may not exist */ }

            return bridges.map(b => ({
                ID: b.ID, bridgeId: b.bridgeId, name: b.name,
                assetClass: b.assetClass||'BRIDGE', state: b.state, region: b.region, lga: b.lga,
                roadRoute: b.roadRoute, routeNumber: b.routeNumber, structureType: b.structureType,
                material: b.material, yearBuilt: b.yearBuilt, condition: b.condition,
                conditionRating: b.conditionRating, postingStatus: b.postingStatus,
                operationalStatus: b.operationalStatus||'OPERATIONAL', criticality: b.criticality||'STANDARD',
                totalLengthM: b.totalLengthM, spanLengthM: b.spanLengthM,
                clearanceHeightM: b.clearanceHeightM, numberOfSpans: b.numberOfSpans,
                assetOwner: b.assetOwner, inspectionDate: b.inspectionDate,
                nextInspectionDue: b.nextInspectionDue,
                activeRestrictions: rCounts[b.ID]||0, grossMassLimit_t: capMap[b.ID]||null,
                latitude: b.latitude, longitude: b.longitude
            }));
        } catch(e) {
            LOG.error('[getAssetRegister] query error:', e.message);
            req.error(500, 'Asset register query failed: ' + e.message);
        }
    });

    // ── getAssetSummary (CDS query — HANA + SQLite compatible) ──
    srv.on('getAssetSummary', async (req) => {
        const p = req.data;
        const db = await cds.connect.to('db');
        // Fetch all bridges matching filter, then aggregate in JS
        let q = SELECT.from('nhvr.Bridge').columns('assetClass','postingStatus','condition','state','criticality');
        if (p.assetClass)    q = q.where({ assetClass: String(p.assetClass).slice(0,200) });
        if (p.state)         q = q.where({ state: String(p.state).slice(0,200) });
        if (p.postingStatus) q = q.where({ postingStatus: String(p.postingStatus).slice(0,200) });
        if (p.condition)     q = q.where({ condition: String(p.condition).slice(0,200) });
        if (p.criticality)   q = q.where({ criticality: String(p.criticality).slice(0,200) });
        if (p.isActive === true) q = q.where({ isActive: true });
        if (p.region) q = q.where(`LOWER(region) LIKE LOWER(?)`, ['%' + String(p.region).slice(0,200) + '%']);
        if (p.conditionMin && parseInt(p.conditionMin) > 0) q = q.where('conditionRating >=', parseInt(p.conditionMin));
        if (p.conditionMax && parseInt(p.conditionMax) > 0) q = q.where('conditionRating <=', parseInt(p.conditionMax));
        if (p.yearBuiltFrom && parseInt(p.yearBuiltFrom) > 0) q = q.where('yearBuilt >=', parseInt(p.yearBuiltFrom));
        if (p.yearBuiltTo   && parseInt(p.yearBuiltTo)   > 0) q = q.where('yearBuilt <=', parseInt(p.yearBuiltTo));
        const bridges = await db.run(q);
        const results = [];
        const dims = [
            { name: 'assetClass',    field: 'assetClass',    fallback: 'BRIDGE' },
            { name: 'postingStatus', field: 'postingStatus', fallback: 'UNRESTRICTED' },
            { name: 'condition',     field: 'condition',     fallback: 'UNKNOWN' },
            { name: 'state',         field: 'state',         fallback: 'UNKNOWN' },
            { name: 'criticality',   field: 'criticality',   fallback: 'STANDARD' },
        ];
        for (const dim of dims) {
            const counts = {};
            for (const b of bridges) {
                const label = b[dim.field] || dim.fallback;
                counts[label] = (counts[label]||0) + 1;
            }
            const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
            const total = bridges.length || 1;
            for (const [label, cnt] of entries) {
                results.push({ dimension: dim.name, label, count: cnt, pct: Math.round(cnt*1000/total)/10 });
            }
        }
        return results;
    });

    // ── getConditionDistribution (CDS — HANA + SQLite compatible)
    srv.on('getConditionDistribution', async (req) => {
        const p = req.data;
        const db = await cds.connect.to('db');
        const labels = {10:'Excellent',9:'Very Good',8:'Good',7:'Good',6:'Fair',5:'Fair',4:'Poor',3:'Poor',2:'Very Poor',1:'Failed'};
        let q = SELECT.from('nhvr.Bridge').columns('conditionRating').where('conditionRating IS NOT NULL');
        if (p.assetClass)    q = q.where({ assetClass: String(p.assetClass).slice(0,200) });
        if (p.state)         q = q.where({ state: String(p.state).slice(0,200) });
        if (p.postingStatus) q = q.where({ postingStatus: String(p.postingStatus).slice(0,200) });
        if (p.condition)     q = q.where({ condition: String(p.condition).slice(0,200) });
        if (p.criticality)   q = q.where({ criticality: String(p.criticality).slice(0,200) });
        if (p.isActive === true) q = q.where({ isActive: true });
        if (p.region) q = q.where(`LOWER(region) LIKE LOWER(?)`, ['%' + String(p.region).slice(0,200) + '%']);
        if (p.conditionMin && parseInt(p.conditionMin) > 0) q = q.where('conditionRating >=', parseInt(p.conditionMin));
        if (p.conditionMax && parseInt(p.conditionMax) > 0) q = q.where('conditionRating <=', parseInt(p.conditionMax));
        const rows = await db.run(q);
        // Aggregate in JS
        const counts = {};
        for (const r of rows) { const cr = r.conditionRating; counts[cr] = (counts[cr]||0) + 1; }
        const total = rows.length || 1;
        return Object.entries(counts)
            .map(([cr, cnt]) => ({ conditionRating: parseInt(cr), conditionLabel: labels[cr]||String(cr), count: cnt, pct: Math.round(cnt*1000/total)/10 }))
            .sort((a,b) => b.conditionRating - a.conditionRating);
    });

    // ── getRestrictionSummary (CDS — HANA + SQLite compatible) ──
    srv.on('getRestrictionSummary', async (req) => {
        const p = req.data;
        const db = await cds.connect.to('db');
        // Fetch active restrictions
        let rq = SELECT.from('nhvr.Restriction').where({ isActive: true }).limit(2000);
        if (p.restrictionType) rq = rq.where({ restrictionType: String(p.restrictionType).slice(0,200) });
        if (p.status)          rq = rq.where({ status: String(p.status).slice(0,200) });
        const restrictions = await db.run(rq);
        if (!restrictions.length) return [];

        // Fetch related bridges
        const bridgeIds = [...new Set(restrictions.map(r => r.bridge_ID).filter(Boolean))];
        const bridges = bridgeIds.length
            ? await db.run(SELECT.from('nhvr.Bridge').where({ ID: { in: bridgeIds } }))
            : [];
        const bMap = {};
        for (const b of bridges) bMap[b.ID] = b;

        // Count active restrictions per bridge
        const rCounts = {};
        for (const r of restrictions) {
            if (r.status === 'ACTIVE') rCounts[r.bridge_ID] = (rCounts[r.bridge_ID]||0) + 1;
        }

        // Filter by bridge-level criteria and map results
        const results = [];
        for (const r of restrictions) {
            const b = bMap[r.bridge_ID];
            if (!b) continue;
            if (p.state && b.state !== String(p.state).slice(0,200)) continue;
            if (p.region && b.region !== String(p.region).slice(0,200)) continue;
            if (p.assetClass && (b.assetClass||'BRIDGE') !== String(p.assetClass).slice(0,200)) continue;
            results.push({
                bridgeId: b.bridgeId, bridgeName: b.name, assetClass: b.assetClass||'BRIDGE',
                state: b.state, region: b.region, restrictionType: r.restrictionType,
                value: r.value, unit: r.unit, status: r.status,
                validFromDate: r.validFromDate, validToDate: r.validToDate,
                isTemporary: r.isTemporary ? 1 : 0, gazetteRef: r.gazetteRef,
                activeRestrictions: rCounts[r.bridge_ID]||0
            });
            if (results.length >= 1000) break;
        }
        return results.sort((a,b) => (a.state||'').localeCompare(b.state||'') || (a.region||'').localeCompare(b.region||'') || (a.bridgeId||'').localeCompare(b.bridgeId||''));
    });

    // ── getInspectionStatusReport (CDS — HANA + SQLite compatible)
    srv.on('getInspectionStatusReport', async (req) => {
        const p = req.data;
        const db = await cds.connect.to('db');
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const in90days = new Date(now.getTime() + 90*86400000).toISOString().split('T')[0];

        // Fetch bridges via CDS
        let q = SELECT.from('nhvr.Bridge').where({ isActive: true }).limit(2000);
        if (p.state)      q = q.where({ state: String(p.state).slice(0,200) });
        if (p.region)     q = q.where({ region: String(p.region).slice(0,200) });
        if (p.assetClass) q = q.where('COALESCE(assetClass,?) = ?', ['BRIDGE', String(p.assetClass).slice(0,200)]);
        if (p.overdueOnly) q = q.where('(nextInspectionDue < ? OR nextInspectionDue IS NULL)', [todayStr]);
        const bridges = await db.run(q);
        if (!bridges.length) return [];

        // Fetch latest inspector per bridge via CDS
        const ids = bridges.map(b => b.ID);
        const inspections = await db.run(SELECT.from('nhvr.InspectionRecord').columns('bridge_ID','inspector','inspectionDate').where({ bridge_ID: { in: ids } }));
        const inspectorMap = {};
        for (const ir of inspections) {
            if (!inspectorMap[ir.bridge_ID] || ir.inspectionDate > inspectorMap[ir.bridge_ID].inspectionDate) {
                inspectorMap[ir.bridge_ID] = ir;
            }
        }

        // Compute status and daysOverdue in JS (no julianday/date dependency)
        const results = bridges.map(b => {
            let daysOverdue = 0, status = 'CURRENT';
            if (!b.nextInspectionDue) {
                daysOverdue = -9999; status = 'NEVER_INSPECTED';
            } else if (b.nextInspectionDue < todayStr) {
                daysOverdue = Math.floor((now - new Date(b.nextInspectionDue)) / 86400000);
                status = 'OVERDUE';
            } else if (b.nextInspectionDue <= in90days) {
                status = 'DUE_SOON';
            }
            return {
                bridgeId: b.bridgeId, bridgeName: b.name, assetClass: b.assetClass||'BRIDGE',
                state: b.state, region: b.region, lastInspection: b.inspectionDate,
                nextDue: b.nextInspectionDue, conditionRating: b.conditionRating,
                daysOverdue, status,
                inspector: inspectorMap[b.ID] ? inspectorMap[b.ID].inspector : null
            };
        });
        // Sort: most overdue first, then by nextDue ascending
        return results.sort((a,b) => b.daysOverdue - a.daysOverdue || (a.nextDue||'').localeCompare(b.nextDue||''));
    });

    // ── Executive Dashboard KPIs ───────────────────────────────
    srv.on('getNetworkKPIs', async () => {
        const db = await cds.connect.to('db');
        const bridges      = await db.run(SELECT.from('nhvr.Bridge').columns('postingStatus','conditionScore','conditionRating'));
        const restrictions = await db.run(SELECT.from('nhvr.Restriction').where({ status: 'ACTIVE' }));
        const overdueDate  = new Date(Date.now() - 365*24*60*60*1000).toISOString();
        const inspections  = await db.run(SELECT.from('nhvr.InspectionRecord').where({ inspectionDate: { '<=': overdueDate } }));
        return {
            totalBridges       : bridges.length,
            openBridges        : bridges.filter(b => b.postingStatus === 'OPEN' || !b.postingStatus || b.postingStatus === 'UNRESTRICTED').length,
            restrictedBridges  : bridges.filter(b => b.postingStatus === 'RESTRICTED' || b.postingStatus === 'POSTED').length,
            closedBridges      : bridges.filter(b => b.postingStatus === 'CLOSED').length,
            avgConditionScore  : bridges.length ? Math.round(bridges.reduce((s,b)=>s+(b.conditionScore||70),0)/bridges.length) : 0,
            criticalCount      : bridges.filter(b => (b.conditionScore||70) < 30).length,
            overdueInspections : inspections.length,
            activeRestrictions : restrictions.length
        };
    });

    srv.on('getInspectionComplianceKPIs', async () => {
        const db = await cds.connect.to('db');
        const all = await db.run(SELECT.from('nhvr.InspectionRecord').columns('inspectionDate','nextInspectionDue','conditionRatingGiven'));
        const now = new Date();
        const overdue = all.filter(i => i.nextInspectionDue && new Date(i.nextInspectionDue) < now).length;
        const total   = Math.max(all.length, 1);
        const avgDays = all.length > 0
            ? Math.round(all.reduce((s,i) => { const d = i.inspectionDate ? (now-new Date(i.inspectionDate))/86400000 : 365; return s+d; }, 0)/all.length)
            : 0;
        return { totalDue: all.length, completedOnTime: all.length-overdue, overdue,
            complianceRate: Math.round(((all.length-overdue)/total)*100), avgDaysSinceInspection: avgDays };
    });

    srv.on('getDefectKPIs', async () => {
        const db = await cds.connect.to('db');
        const defects = await db.run(SELECT.from('nhvr.BridgeDefect').columns('severity','status','detectedDate','closedDate'));
        const now  = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const open = defects.filter(d => d.status !== 'CLOSED' && d.status !== 'REPAIRED');
        const avgDays = open.length > 0
            ? Math.round(open.reduce((s,d)=>s+(d.detectedDate?(now-new Date(d.detectedDate))/86400000:0),0)/open.length) : 0;
        return { totalOpen: open.length,
            criticalOpen: open.filter(d=>d.severity==='CRITICAL').length,
            highOpen:     open.filter(d=>d.severity==='HIGH').length,
            avgDaysOpen:  avgDays,
            closedThisMonth: defects.filter(d=>(d.status==='CLOSED'||d.status==='REPAIRED')&&d.closedDate>=thisMonthStart).length };
    });

    srv.on('getRestrictionKPIs', async () => {
        const db = await cds.connect.to('db');
        const active = await db.run(SELECT.from('nhvr.Restriction').where({ status: 'ACTIVE' }));
        const in30   = new Date(Date.now() + 30*86400000).toISOString();
        return { totalActive: active.length,
            expiringIn30Days: active.filter(r=>r.validToDate&&r.validToDate<=in30.split('T')[0]).length,
            temporaryActive:  active.filter(r=>r.isTemporary).length,
            gazetteValid:     active.filter(r=>r.gazetteValidationStatus==='VALID').length,
            gazetteInvalid:   active.filter(r=>r.gazetteValidationStatus==='INVALID_FORMAT'||r.gazetteValidationStatus==='NOT_FOUND').length };
    });

    srv.on('getTrendData', async (req) => {
        const db = await cds.connect.to('db');
        const { metric = 'conditions', periods = 6 } = req.data;
        const result = [];
        for (let i = (periods-1); i >= 0; i--) {
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
            const periodStart = d.toISOString().slice(0,7);
            const periodEnd   = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10);
            let value = 0;
            try {
                if (metric === 'conditions') {
                    const rows = await db.run(SELECT.from('nhvr.BridgeConditionHistory').columns('newConditionScore')
                        .where('changedAt >= ? AND changedAt <= ?', [periodStart + '-01', periodEnd + 'T23:59:59Z']));
                    value = rows.length ? Math.round(rows.reduce((s,r)=>s+(r.newConditionScore||70),0)/rows.length) : null;
                } else if (metric === 'restrictions') {
                    const rows = await db.run(SELECT.from('nhvr.Restriction').columns('ID').where({ status: 'ACTIVE' }));
                    value = rows.length;
                } else if (metric === 'defects') {
                    const rows = await db.run(SELECT.from('nhvr.BridgeDefect').columns('ID')
                        .where('detectedDate >= ? AND detectedDate <= ?', [periodStart + '-01', periodEnd]));
                    value = rows.length;
                } else {
                    const rows = await db.run(SELECT.from('nhvr.Bridge').columns('ID').where({ isActive: true }));
                    value = rows.length;
                }
            } catch (e) { value = null; }
            result.push({ period: periodStart, value });
        }
        return result;
    });

    // ── computeRiskScore ───────────────────────────────────────
    srv.on('computeRiskScore', async (req) => {
        const { bridgeId } = req.data;
        const db = await cds.connect.to('db');
        const b = await getBridgeByKey(bridgeId, db);
        if (!b) return req.error(404, `Bridge ${bridgeId} not found`);
        const scourW = { CRITICAL:6, HIGH:4, MEDIUM:2, LOW:0 }[b.scourRisk] || 0;
        const floodW = b.floodImpacted ? 2 : 0;
        const defW   = b.structuralDeficiencyFlag ? 4 : 0;
        const riskScore = Math.min(25, (10-Math.min(b.conditionRating||5,10))*2+scourW+floodW+defW);
        const riskBand  = riskScore>=20?'CRITICAL':riskScore>=16?'VERY_HIGH':riskScore>=11?'HIGH':riskScore>=7?'MEDIUM':'LOW';
        const assessmentId = cds.utils.uuid();
        const assessment = {
            ID: assessmentId, bridge_ID: b.ID,
            assessmentDate: new Date().toISOString().substring(0,10),
            assessedBy: (req.user&&req.user.id)||'SYSTEM',
            riskScore, riskBand,
            notes: 'Auto-computed from condition rating, scour risk, flood impact, and structural deficiency flags'
        };
        await db.run(INSERT.into('nhvr.BridgeRiskAssessment').entries(assessment));
        await db.run(UPDATE('nhvr.Bridge').set({ currentRiskScore: riskScore, currentRiskBand: riskBand }).where({ bridgeId }));
        return assessment;
    });

    // ── assessScourRisk ────────────────────────────────────────
    const BIMM_MATRIX = [['LOW','LOW','MEDIUM','MEDIUM'],['LOW','MEDIUM','MEDIUM','HIGH'],['MEDIUM','MEDIUM','HIGH','HIGH'],['MEDIUM','HIGH','HIGH','EXTREME']];
    const BIMM_SCORE  = { LOW:15, MEDIUM:40, HIGH:70, EXTREME:95 };

    function getConsequenceLevel(foundationType, scourDepth_m) {
        const isDeep = ['DEEP_PILE','CAISSON','DRILLED_SHAFT','DEEP'].includes((foundationType||'').toUpperCase());
        if ((scourDepth_m||0) < 0.5)  return 0;
        if ((scourDepth_m||0) < 1.5)  return isDeep ? 0 : 1;
        if ((scourDepth_m||0) < 3.0)  return isDeep ? 1 : 2;
        return isDeep ? 2 : 3;
    }

    function getLikelihoodLevel(floodFrequency, velocityRating) {
        const freqTier = (floodFrequency||100) <= 10 ? 3 : (floodFrequency||100) <= 50 ? 2 : (floodFrequency||100) <= 100 ? 1 : 0;
        let velNum = typeof velocityRating === 'number' ? velocityRating : ({ LOW:1, MODERATE:2, HIGH:3, EXTREME:4 }[velocityRating] || 2);
        const velTier = velNum >= 4 ? 3 : velNum === 3 ? 2 : velNum === 2 ? 1 : 0;
        return Math.min(3, Math.round((freqTier+velTier)/2));
    }

    srv.on('assessScourRisk', async (req) => {
        const db = await cds.connect.to('db');
        const { bridgeId, floodFrequency, scourDepth_m, velocityRating, sedimentRating, foundationType, watercourseName, assessedBy } = req.data;
        const cIdx = getConsequenceLevel(foundationType, scourDepth_m||0);
        const lIdx = getLikelihoodLevel(floodFrequency, velocityRating);
        const scourRiskLevel = BIMM_MATRIX[cIdx][lIdx];
        const score = BIMM_SCORE[scourRiskLevel];
        const existing = await db.run(SELECT.one.from('nhvr.ScourAssessment').where({ bridge_ID: bridgeId }));
        const today = new Date().toISOString().split('T')[0];
        const data = {
            bridge_ID: bridgeId, watercourseName, crossingType: 'BRIDGE',
            floodFrequency, scourDepth_m: scourDepth_m||0, velocityRating, sedimentRating, foundationType,
            scourRiskScore: score, scourRiskLevel, assessedBy: assessedBy||req.user?.id||'system',
            assessmentDate: today, mitigationStatus: 'NONE'
        };
        if (existing) { data.ID = existing.ID; await db.run(UPDATE('nhvr.ScourAssessment').set(data).where({ ID: existing.ID })); }
        else           { data.ID = cds.utils.uuid(); await db.run(INSERT.into('nhvr.ScourAssessment').entries(data)); }
        try {
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                ID: cds.utils.uuid(), entityName: 'ScourAssessment', entityId: data.ID,
                action: existing?'UPDATE':'CREATE', changedBy: req.user?.id||'system',
                changedAt: new Date().toISOString(), changeDescription: `Scour assessment: ${scourRiskLevel} (score ${score})`
            }));
        } catch (e) { LOG.warn('[NHVR] AuditLog write failed for ScourAssessment:', e.message); }
        try { await db.run(UPDATE('nhvr.Bridge').set({ scourRisk: scourRiskLevel }).where({ ID: bridgeId })); }
        catch (e) { LOG.warn('[NHVR] Bridge scourRisk denorm failed:', e.message); }
        return data;
    });

    // ── validateGazette ────────────────────────────────────────
    srv.on('validateGazette', async (req) => {
        const db = await cds.connect.to('db');
        const { restrictionId, gazetteRef } = req.data;
        const validFormat = /^[A-Z]{2,5}-[\d]{4}[-\/][\d]{2,4}$/i.test(gazetteRef||'');
        const status  = validFormat ? 'VALID' : 'INVALID';
        const message = validFormat ? `Gazette reference ${gazetteRef} format is valid` : `Invalid gazette format. Expected: STATE-YYYY/NNN (e.g. NSW-2024/123)`;
        const expiryDate = validFormat ? new Date(Date.now()+365*24*60*60*1000).toISOString().split('T')[0] : null;
        const existing = await db.run(SELECT.one.from('nhvr.GazetteValidation').where({ restriction_ID: restrictionId }));
        const validationData = { restriction_ID: restrictionId, gazetteRef, validationStatus: status,
            validatedAt: new Date().toISOString(), validatedBy: req.user?.id||'system', expiryDate };
        if (existing) { await db.run(UPDATE('nhvr.GazetteValidation').set(validationData).where({ ID: existing.ID })); }
        else { validationData.ID = cds.utils.uuid(); await db.run(INSERT.into('nhvr.GazetteValidation').entries(validationData)); }
        return { status, message, expiryDate: expiryDate||'' };
    });

    // ── predictCondition ───────────────────────────────────────
    srv.on('predictCondition', async (req) => {
        const { bridgeId, yearsAhead = 10 } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const history = await db.run(SELECT.from('nhvr.BridgeConditionHistory').where({ bridge_ID: bridgeId }).orderBy('changedAt asc').limit(20));
        const currentScore = bridge.conditionScore || 50;
        const currentYear  = new Date().getFullYear();
        let annualDecline = 1.5;
        if (history.length >= 2) {
            const first = history[0]; const last = history[history.length-1];
            const years = (new Date(last.changedAt)-new Date(first.changedAt))/(365.25*24*60*60*1000);
            if (years > 0.5) annualDecline = Math.max(0.1, ((first.newScore||50)-(last.newScore||50))/years);
        }
        const results = [];
        for (let y = 1; y <= yearsAhead; y++) {
            const score   = Math.max(0, currentScore-annualDecline*y);
            const rating  = score>=80?10:score>=65?8:score>=50?6:score>=35?4:score>=20?2:1;
            const confidence = history.length>=5?'HIGH':history.length>=2?'MEDIUM':'LOW';
            results.push({ year: currentYear+y, predictedScore: Math.round(score*10)/10, predictedRating: rating, confidence });
        }
        return results;
    });

    // ── computeDeteriorationProfile ────────────────────────────
    const TPM_DECLINE = {
        CONCRETE:  { '0-10':0.3, '11-20':0.5, '21-30':0.8, '31-40':1.2, '41-50':1.8, '50+':2.5 },
        STEEL:     { '0-10':0.4, '11-20':0.7, '21-30':1.0, '31-40':1.5, '41-50':2.2, '50+':3.0 },
        TIMBER:    { '0-10':0.8, '11-20':1.2, '21-30':1.8, '31-40':2.5, '41-50':3.5, '50+':5.0 },
        MASONRY:   { '0-10':0.2, '11-20':0.4, '21-30':0.6, '31-40':0.9, '41-50':1.3, '50+':1.8 },
        COMPOSITE: { '0-10':0.3, '11-20':0.5, '21-30':0.9, '31-40':1.3, '41-50':1.9, '50+':2.8 }
    };
    function getAgeBand(yearBuilt) {
        const age = new Date().getFullYear()-(yearBuilt||1980);
        if (age<=10) return '0-10'; if (age<=20) return '11-20'; if (age<=30) return '21-30';
        if (age<=40) return '31-40'; if (age<=50) return '41-50'; return '50+';
    }

    srv.on('computeDeteriorationProfile', async (req) => {
        const db = await cds.connect.to('db');
        const { bridgeId } = req.data;
        const bridge = await getBridge(bridgeId, db);
        if (!bridge) return req.error(404, 'Bridge not found');
        const material = (bridge.material||'CONCRETE').toUpperCase().split(' ')[0];
        const normalMaterial = Object.keys(TPM_DECLINE).find(k=>material.startsWith(k))||'CONCRETE';
        const ageBand = getAgeBand(bridge.yearBuilt);
        const decline = (TPM_DECLINE[normalMaterial]||TPM_DECLINE.CONCRETE)[ageBand];
        const score   = bridge.conditionScore||70;
        const proj5y  = Math.max(0, score-decline*5);
        const proj10y = Math.max(0, score-decline*10);
        const conditionWeight  = (100-score)*0.40;
        const declineWeight    = Math.min(decline*20,30)*0.30;
        const trafficWeight    = Math.min((bridge.numberOfSpans||1)*2,10)*0.20;
        const strategicWeight  = (bridge.postingStatus==='RESTRICTED'||bridge.postingStatus==='CLOSED'?10:5)*0.10;
        const priorityScore    = conditionWeight+declineWeight+trafficWeight+strategicWeight;
        const priorityBand     = priorityScore>=60?'CRITICAL':priorityScore>=40?'HIGH':priorityScore>=20?'MEDIUM':'LOW';
        const serviceLife      = Math.max(0, Math.round(score/decline));
        const profile = {
            ID: cds.utils.uuid(), bridge_ID: bridgeId, material: normalMaterial, ageBand,
            currentScore: score, projectedScore5y: Math.round(proj5y*10)/10,
            projectedScore10y: Math.round(proj10y*10)/10, annualDeclineRate: decline,
            priorityScore: Math.round(priorityScore*10)/10, priorityBand,
            serviceLifeYears: serviceLife, computedAt: new Date().toISOString()
        };
        await db.run(DELETE.from('nhvr.BridgeDeteriorationProfile').where({ bridge_ID: bridgeId }));
        await db.run(INSERT.into('nhvr.BridgeDeteriorationProfile').entries(profile));
        try {
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                ID: cds.utils.uuid(), entityName: 'BridgeDeteriorationProfile', entityId: profile.ID,
                action: 'CREATE', changedBy: req.user?.id||'system', changedAt: new Date().toISOString(),
                changeDescription: `Deterioration profile computed: ${priorityBand} priority, ${serviceLife}yr remaining life`
            }));
        } catch (e) { LOG.warn('[NHVR] AuditLog write failed for DeteriorationProfile:', e.message); }
        return profile;
    });

    srv.on('getMaintenancePriorityList', async (req) => {
        const db = await cds.connect.to('db');
        const { state, priorityBand } = req.data;
        const profiles = await db.run(SELECT.from('nhvr.BridgeDeteriorationProfile').columns('*').orderBy('priorityScore desc'));
        if (!state && !priorityBand) return profiles;
        const filtered = [];
        for (const p of profiles) {
            if (priorityBand && p.priorityBand !== priorityBand) continue;
            if (state) { const b = await getBridge(p.bridge_ID, db); if (!b || b.state !== state) continue; }
            filtered.push(p);
        }
        return filtered;
    });

    // ── VehiclePermits validation hooks ────────────────────────
    srv.before(['CREATE', 'UPDATE'], 'VehiclePermits', async (req) => {
        const d = req.data;
        const errors = [];
        if (d.permitStatus === 'APPROVED' || d.permitStatus === 'APPROVED_WITH_CONDITIONS') {
            if (d.allChecksPassed === false) errors.push('Cannot approve permit — one or more engineering checks have not passed. Run assessment first.');
            if (!d.assessedBy) errors.push('assessedBy (engineer name and NER/RPEQ registration) is required before approval.');
            if (!d.effectiveFrom) errors.push('effectiveFrom date is required.');
            if (!d.expiryDate) errors.push('expiryDate is required for all approved permits.');
            if (d.expiryDate && d.effectiveFrom && d.expiryDate <= d.effectiveFrom) errors.push('expiryDate must be after effectiveFrom.');
        }
        if (d.permitType === 'SINGLE_TRIP' && !d.effectiveFrom) errors.push('Single-trip permits require a specific effectiveFrom date.');
        if (errors.length) return req.error(400, errors.join('; '));
    });

    srv.after(['CREATE', 'UPDATE'], 'VehiclePermits', async (permit, req) => {
        if (permit && (permit.permitStatus === 'APPROVED' || permit.permitStatus === 'APPROVED_WITH_CONDITIONS')) {
            try {
                // writeHistory not available here directly — use inline INSERT
                const db = await cds.connect.to('db');
                await db.run(INSERT.into('nhvr.BridgeEventLog').entries({
                    bridge_ID: permit.bridge_ID, eventType: 'PERMIT_APPROVED',
                    title: `Vehicle permit issued: ${permit.vehicleTypeName||''} — ${permit.assessedGVM_t}t`,
                    detail: `Permit: ${permit.permitId} | Applicant: ${permit.applicantName} | Type: ${permit.permitType} | Expires: ${permit.expiryDate}`,
                    effectiveFrom: permit.effectiveFrom, effectiveTo: permit.expiryDate,
                    approvalRef: permit.nhvrPermitNumber,
                    relatedEntityType: 'VehiclePermit', relatedEntityId: permit.permitId,
                    performedBy: req.user?.id || 'system', timestamp: new Date().toISOString()
                }));
            } catch (e) { LOG.error('writeHistory for permit failed:', e.message); }
        }
    });

    // ── assessVehicleOnBridge ──────────────────────────────────
    srv.on('assessVehicleOnBridge', async (req) => {
        const { bridgeId, vehicleTypeId, assessedGVM_t,
                assessedHeight_m, assessedWidth_m, assessedLength_m } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db);
        if (!bridge) return req.error(404, `Bridge '${bridgeId}' not found`);
        const capacity = await db.run(SELECT.one.from('nhvr.BridgeCapacity').where({ bridge_ID: bridge.ID }));
        if (!capacity) return req.error(400, `No load rating data for bridge '${bridgeId}'.`);
        const vehicle = await db.run(SELECT.one.from('nhvr.VehicleType').where({ vehicleTypeId }));
        if (!vehicle) return req.error(404, `Vehicle type '${vehicleTypeId}' not found`);
        const conditions = [], warnings = [];
        const gvm  = parseFloat(assessedGVM_t)     || 0;
        const height = parseFloat(assessedHeight_m) || 0;
        const width  = parseFloat(assessedWidth_m)  || 0;
        const length = parseFloat(assessedLength_m) || 0;
        const massLimit = parseFloat(capacity.grossMassLimit_t)||0;
        const massMargin = massLimit-gvm;
        const massCheckPassed = massMargin >= 0;
        if (!massCheckPassed) conditions.push(`MASS: Vehicle GVM ${gvm}t exceeds bridge capacity ${massLimit}t`);
        if (massCheckPassed && massMargin < 2.0) warnings.push(`Mass margin is small (${massMargin.toFixed(1)}t)`);
        const clearance = parseFloat(capacity.minVerticalClearance_m)||0;
        const clearanceMargin = clearance-height;
        const clearanceCheckPassed = clearanceMargin >= 0;
        if (!clearanceCheckPassed) conditions.push(`CLEARANCE: Vehicle height ${height}m exceeds posted clearance ${clearance}m`);
        if (clearanceCheckPassed && clearanceMargin < 0.15) warnings.push(`Clearance margin very small (${(clearanceMargin*1000).toFixed(0)}mm)`);
        const carriageway = parseFloat(capacity.trafficableWidth_m)||parseFloat(capacity.carriageway_m)||0;
        const requiredWidth = width+0.6;
        const widthMargin = carriageway-requiredWidth;
        const widthCheckPassed = widthMargin >= 0;
        if (!widthCheckPassed) conditions.push(`WIDTH: Vehicle requires traffic management or is not permitted`);
        const spanLen = parseFloat(bridge.spanLengthM)||0;
        const lengthCheckPassed = !spanLen || !length || (length <= spanLen*2.5);
        if (!lengthCheckPassed) conditions.push(`LENGTH: Vehicle length may not be compatible with bridge approach geometry`);
        const remainingLife = parseFloat(capacity.remainingFatigueLife_years)||99;
        const fatigueCheckPassed = !capacity.fatigueSensitive || remainingLife > 0;
        if (!fatigueCheckPassed) conditions.push(`FATIGUE: Bridge fatigue life exhausted`);
        const scourCrit = parseFloat(capacity.scourCriticalDepth_m)||99;
        const scourCurr = parseFloat(capacity.currentScourDepth_m)||0;
        const scourMargin = scourCrit-scourCurr;
        const scourCheckPassed = scourMargin > 0;
        if (!scourCheckPassed) conditions.push(`SCOUR: Scour depth at or beyond critical`);
        const allPassed = [massCheckPassed,clearanceCheckPassed,widthCheckPassed,lengthCheckPassed,fatigueCheckPassed,scourCheckPassed].every(Boolean);
        const needsPermit = vehicle.permitRequired || conditions.length > 0;
        let recommendedAction;
        if (!allPassed)             recommendedAction = `REFUSE — ${conditions.length} engineering check(s) failed.`;
        else if (conditions.length) recommendedAction = `APPROVE WITH CONDITIONS — ${conditions.length} condition(s) apply.`;
        else if (needsPermit)       recommendedAction = `APPROVE WITH PERMIT — NHVR class ${vehicle.nhvrClass} requires permit.`;
        else                        recommendedAction = `APPROVE — vehicle within bridge capacity under general access.`;
        return {
            eligible: allPassed, permitRequired: needsPermit, nhvrClass: vehicle.nhvrClass||'GEN', recommendedAction,
            massCheckPassed, massCheckRequired: gvm, massCheckAvailable: massLimit, massCheckMargin: parseFloat(massMargin.toFixed(2)),
            clearanceCheckPassed, clearanceCheckRequired: height, clearanceCheckAvailable: clearance, clearanceCheckMargin: parseFloat(clearanceMargin.toFixed(3)),
            widthCheckPassed, widthCheckAvailable: carriageway, widthCheckMargin: parseFloat(widthMargin.toFixed(2)),
            lengthCheckPassed, fatigueCheckPassed, fatigueRemaining: remainingLife,
            scourCheckPassed, scourCheckMargin: parseFloat(scourMargin.toFixed(2)),
            conditionsList: conditions.join(' | '), warningsList: warnings.join(' | ')
        };
    });

    // ── getBridgesExceedingCapacity ────────────────────────────
    srv.on('getBridgesExceedingCapacity', async () => {
        const db = await cds.connect.to('db');
        const permits = await db.run(SELECT.from('nhvr.VehiclePermit').where({ permitStatus: { in: ['APPROVED','APPROVED_WITH_CONDITIONS'] } }));
        const results = [], seen = {};
        // Batch fetch capacities and bridges for all permit bridge_IDs
        const permitBridgeIds = [...new Set(permits.filter(p => p.bridge_ID && p.assessedGVM_t).map(p => p.bridge_ID))];
        const allCaps = permitBridgeIds.length ? await db.run(
            SELECT.from('nhvr.BridgeCapacity').columns('bridge_ID','grossMassLimit_t').where({ bridge_ID: { in: permitBridgeIds } })
        ) : [];
        const capMap = {};
        for (const c of allCaps) capMap[c.bridge_ID] = c;
        const allBridges = permitBridgeIds.length ? await db.run(
            SELECT.from('nhvr.Bridge').columns('ID','bridgeId','name','state','postingStatus').where({ ID: { in: permitBridgeIds } })
        ) : [];
        const bMap = {};
        for (const b of allBridges) bMap[b.ID] = b;
        for (const p of permits) {
            if (!p.assessedGVM_t) continue;
            const cap = capMap[p.bridge_ID];
            if (!cap || !cap.grossMassLimit_t) continue;
            const exceedance = parseFloat(p.assessedGVM_t)-parseFloat(cap.grossMassLimit_t);
            if (exceedance > 0) {
                const bridge = bMap[p.bridge_ID];
                const key = bridge ? bridge.bridgeId : p.bridge_ID;
                if (seen[key]) { seen[key].numberOfAffectedPermits++; if (exceedance>seen[key].exceedanceAmount_t) seen[key].exceedanceAmount_t=parseFloat(exceedance.toFixed(2)); }
                else {
                    const entry = { bridgeId: bridge?bridge.bridgeId:'', bridgeName: bridge?bridge.name:'', bridgeState: bridge?bridge.state:'',
                        postingStatus: bridge?bridge.postingStatus:'', approvedGVM_t: parseFloat(p.assessedGVM_t),
                        capacityGVM_t: parseFloat(cap.grossMassLimit_t), exceedanceAmount_t: parseFloat(exceedance.toFixed(2)),
                        numberOfAffectedPermits: 1, riskLevel: exceedance>10?'CRITICAL':exceedance>5?'HIGH':exceedance>2?'MEDIUM':'LOW' };
                    seen[key] = entry; results.push(entry);
                }
            }
        }
        return results;
    });

    srv.on('getNonCompliantBridgesOnRoutes', async () => {
        const db = await cds.connect.to('db');
        const routes = await db.run(SELECT.from('nhvr.ApprovedRoute').where({ routeStatus: 'ACTIVE', active: true }));
        if (!routes.length) return [];
        const routeIds = routes.map(r => r.ID);
        // Batch fetch all route-bridge links
        const allRouteBridges = await db.run(
            SELECT.from('nhvr.ApprovedRouteBridge').columns('route_ID','bridge_ID').where({ route_ID: { in: routeIds } })
        );
        const allBridgeIds = [...new Set(allRouteBridges.map(rb => rb.bridge_ID).filter(Boolean))];
        const allCaps = allBridgeIds.length ? await db.run(
            SELECT.from('nhvr.BridgeCapacity').columns('bridge_ID','grossMassLimit_t').where({ bridge_ID: { in: allBridgeIds } })
        ) : [];
        const capMap = {};
        for (const c of allCaps) capMap[c.bridge_ID] = c;
        const bridgeRows = allBridgeIds.length ? await db.run(
            SELECT.from('nhvr.Bridge').columns('ID','bridgeId','name','state').where({ ID: { in: allBridgeIds } })
        ) : [];
        const bridgeMap = {};
        for (const b of bridgeRows) bridgeMap[b.ID] = b;
        const vtIds = [...new Set(routes.filter(r => r.vehicleType_ID).map(r => r.vehicleType_ID))];
        const vtRows = vtIds.length ? await db.run(
            SELECT.from('nhvr.VehicleType').columns('ID','displayName').where({ ID: { in: vtIds } })
        ) : [];
        const vtMap = {};
        for (const v of vtRows) vtMap[v.ID] = v;
        // Group route bridges by route
        const rbByRoute = {};
        for (const rb of allRouteBridges) {
            if (!rbByRoute[rb.route_ID]) rbByRoute[rb.route_ID] = [];
            rbByRoute[rb.route_ID].push(rb);
        }
        const results = [];
        for (const route of routes) {
            const routeBridges = rbByRoute[route.ID] || [];
            for (const rb of routeBridges) {
                const cap = capMap[rb.bridge_ID];
                if (!cap || !cap.grossMassLimit_t) continue;
                const shortfall = parseFloat(route.routeGrossLimit_t||0)-parseFloat(cap.grossMassLimit_t);
                if (shortfall > 0) {
                    const bridge = bridgeMap[rb.bridge_ID];
                    const vt = route.vehicleType_ID ? vtMap[route.vehicleType_ID] : null;
                    results.push({ routeId: route.routeId, routeName: route.routeName,
                        bridgeId: bridge?bridge.bridgeId:'', bridgeName: bridge?bridge.name:'',
                        routeLimit_t: parseFloat(route.routeGrossLimit_t),
                        bridgeCurrentCapacity_t: parseFloat(cap.grossMassLimit_t),
                        shortfallAmount_t: parseFloat(shortfall.toFixed(2)),
                        affectedVehicleClasses: vt?vt.displayName:(route.vehicleType_ID||'Multiple'),
                        urgency: shortfall>10?'CRITICAL':shortfall>5?'HIGH':shortfall>2?'MEDIUM':'LOW' });
                }
            }
        }
        return results;
    });

    srv.on('getOverdueCapacityReviews', async (req) => {
        const minDays = parseInt(req.data.daysOverdue)||0;
        const db = await cds.connect.to('db');
        const caps = await db.run(SELECT.from('nhvr.BridgeCapacity').where({ nextRatingDue: { '!=': null } }));
        const today = new Date();
        // Batch fetch all bridges for capacity bridge_IDs
        const capBridgeIds = [...new Set(caps.filter(c => c.bridge_ID).map(c => c.bridge_ID))];
        const bridgeRows = capBridgeIds.length ? await db.run(
            SELECT.from('nhvr.Bridge').columns('ID','bridgeId','name','state').where({ ID: { in: capBridgeIds } })
        ) : [];
        const bridgeMap = {};
        for (const b of bridgeRows) bridgeMap[b.ID] = b;
        const results = [];
        for (const cap of caps) {
            if (!cap.nextRatingDue) continue;
            const days = Math.floor((today-new Date(cap.nextRatingDue))/86400000);
            if (days >= minDays) {
                const bridge = bridgeMap[cap.bridge_ID];
                results.push({ bridgeId: bridge?bridge.bridgeId:'', bridgeName: bridge?bridge.name:'',
                    bridgeState: bridge?bridge.state:'', lastRatingDate: cap.loadRatingDate,
                    nextRatingDue: cap.nextRatingDue, daysOverdue: days,
                    capacityStatus: cap.capacityStatus, ratedBy: cap.loadRatingEngineer||'' });
            }
        }
        results.sort((a,b) => b.daysOverdue-a.daysOverdue);
        return results;
    });

    srv.on('getActivePermitsForBridge', async (req) => {
        const { bridgeId } = req.data;
        const db = await cds.connect.to('db');
        const bridge = await getBridgeByKey(bridgeId, db);
        if (!bridge) return [];
        const permits = await db.run(
            SELECT.from('nhvr.VehiclePermit').where({ bridge_ID: bridge.ID, permitStatus: { in: ['APPROVED','APPROVED_WITH_CONDITIONS','PENDING'] } })
        );
        const results = [];
        for (const p of permits) {
            const vt = p.vehicleType_ID ? await db.run(SELECT.one.from('nhvr.VehicleType').where({ ID: p.vehicleType_ID })) : null;
            const conds = [p.speedCondition_kmh?`Speed ≤ ${p.speedCondition_kmh}km/h`:null,
                p.escortRequired?(p.escortConfig||'Escort required'):null,
                p.timeWindowAllowed||null, p.singleTripOnly?'Single trip only':null].filter(Boolean).join('; ');
            results.push({ permitId: p.permitId, vehicleTypeName: vt?vt.displayName:'',
                applicantName: p.applicantName||'', assessedGVM_t: p.assessedGVM_t,
                expiryDate: p.expiryDate, permitType: p.permitType,
                permitStatus: p.permitStatus, conditions: conds||'None' });
        }
        return results;
    });

    // ── LoadRatings CRUD hooks ─────────────────────────────────
    srv.before(['CREATE', 'UPDATE'], 'LoadRatings', async (req) => {
        const data = req.data;
        const errors = [];
        if (data.maxGrossMass_t !== undefined && data.maxGrossMass_t !== null) {
            if (isNaN(Number(data.maxGrossMass_t)) || Number(data.maxGrossMass_t) <= 0)
                errors.push('Max Gross Mass must be greater than 0 tonnes.');
        }
        if (data.maxAxleLoad_t !== undefined && data.maxAxleLoad_t !== null) {
            if (isNaN(Number(data.maxAxleLoad_t)) || Number(data.maxAxleLoad_t) <= 0)
                errors.push('Max Axle Load must be greater than 0 tonnes.');
        }
        if (data.assessmentDate) {
            const assessDate = new Date(data.assessmentDate);
            const today = new Date(); today.setHours(23,59,59,999);
            if (assessDate > today) errors.push('Assessment Date cannot be in the future.');
        }
        if (data.nextReviewDue && data.assessmentDate && new Date(data.nextReviewDue) <= new Date(data.assessmentDate))
            errors.push('Next Review Due date must be after the Assessment Date.');
        if (data.ratingFactor !== undefined && data.ratingFactor !== null) {
            if (isNaN(Number(data.ratingFactor)) || Number(data.ratingFactor) <= 0)
                errors.push('Rating Factor (RF) must be a positive number.');
        }
        if (errors.length) return req.error(400, errors.join('; '));
    });

    srv.after('CREATE', 'LoadRatings', async (result, req) => {
        try {
            const db = await cds.connect.to('db');
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                entityName: 'LoadRating', entityId: result.ID, action: 'CREATE',
                fieldName: 'maxGrossMass_t', newValue: String(result.maxGrossMass_t??''),
                changedBy: req.user?.id||'system', changedAt: new Date().toISOString(),
                notes: `Load rating created: ${result.ratingStandard||''} by ${result.assessedBy||''}`
            }));
        } catch (e) { LOG.warn('[NHVR] AuditLog write failed for LoadRating CREATE:', e.message); }
    });

    srv.after('UPDATE', 'LoadRatings', async (result, req) => {
        try {
            const db = await cds.connect.to('db');
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                entityName: 'LoadRating', entityId: req.params?.[0]?.ID||result.ID||'',
                action: 'UPDATE', fieldName: 'status', newValue: String(result.status??''),
                changedBy: req.user?.id||'system', changedAt: new Date().toISOString(), notes: 'Load rating updated'
            }));
        } catch (e) { LOG.warn('[NHVR] AuditLog write failed for LoadRating UPDATE:', e.message); }
    });

    // ── getDashboardKPIs ──────────────────────────────────────────
    srv.on('getDashboardKPIs', async (req) => {
        const db = await cds.connect.to('db');
        const { jurisdiction } = req.data;

        let bridgeFilter = jurisdiction ? { state: jurisdiction } : {};

        // Single query with conditional counts
        const bridges = await db.run(
            SELECT.from('nhvr.Bridge').where(bridgeFilter)
                .columns(
                    'condition', 'postingStatus', 'conditionScore',
                    'isActive', 'nextInspectionDue'
                )
        );

        const today = new Date().toISOString().split('T')[0];
        let total = 0, active = 0, closed = 0, critical = 0,
            overdueInspections = 0;
        const conditionDist = { GOOD: 0, FAIR: 0, POOR: 0, CRITICAL: 0 };

        for (const b of bridges) {
            total++;
            if (b.isActive !== false) active++;
            if (b.postingStatus === 'CLOSED') closed++;
            if (b.condition === 'CRITICAL') critical++;
            if (b.condition && conditionDist[b.condition] !== undefined) conditionDist[b.condition]++;
            if (b.nextInspectionDue && b.nextInspectionDue < today) overdueInspections++;
        }

        // Count active restrictions
        let restFilter = { status: 'ACTIVE' };
        const activeRestrictions = await db.run(
            SELECT.from('nhvr.Restriction').where(restFilter).columns('ID')
        );

        // Count permit-required restrictions
        const permitRequired = await db.run(
            SELECT.from('nhvr.Restriction').where({ status: 'ACTIVE', permitRequired: true }).columns('ID')
        );

        // Count open defects
        const defects = await db.run(
            SELECT.from('nhvr.BridgeDefect').where({ status: { '!=': 'CLOSED' } }).columns('ID')
        );

        return JSON.stringify({
            totalBridges: total,
            activeBridges: active,
            closedBridges: closed,
            criticalBridges: critical,
            activeRestrictions: activeRestrictions.length,
            permitRequired: permitRequired.length,
            openDefects: defects.length,
            overdueInspections: overdueInspections,
            conditionDistribution: Object.keys(conditionDist).map(k => ({ condition: k, count: conditionDist[k] }))
        });
    });

    // ── getConditionTrend ─────────────────────────────────────────
    srv.on('getConditionTrend', async (req) => {
        const db = await cds.connect.to('db');
        const { periods } = req.data;
        const numPeriods = periods || 12;

        // Get condition history grouped by month
        const history = await db.run(
            SELECT.from('nhvr.BridgeConditionHistory')
                .columns('changedAt', 'conditionScore', 'newCondition')
                .orderBy('changedAt')
        );

        // Group by month
        const monthMap = {};
        for (const h of history) {
            if (!h.changedAt) continue;
            const month = h.changedAt.substring(0, 7); // YYYY-MM
            if (!monthMap[month]) monthMap[month] = { scores: [], count: 0 };
            if (h.conditionScore !== null && h.conditionScore !== undefined) {
                monthMap[month].scores.push(h.conditionScore);
            }
            monthMap[month].count++;
        }

        // Get last N periods
        const allMonths = Object.keys(monthMap).sort().slice(-numPeriods);
        const trend = allMonths.map(function (month) {
            const scores = monthMap[month].scores;
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
            const min = scores.length ? Math.min(...scores) : null;
            const max = scores.length ? Math.max(...scores) : null;
            return { period: month, avgScore: avg, minScore: min, maxScore: max, count: monthMap[month].count };
        });

        return JSON.stringify(trend);
    });

    // ── Phase 6.4: Execute a scheduled report ─────────────────
    srv.on('executeScheduledReport', async (req) => {
        const db = await cds.connect.to('db');
        const { scheduleId } = req.data;

        const schedule = await db.run(SELECT.one.from('nhvr.ReportSchedule').where({ ID: scheduleId }));
        if (!schedule) return req.reject(404, 'Report schedule not found');
        if (!schedule.isActive) return req.reject(400, 'Report schedule is disabled');

        // Parse filters if present
        let filters = {};
        try { if (schedule.filters) filters = JSON.parse(schedule.filters); } catch (e) { /* ignore */ }

        // Execute the report based on reportKey
        let result;
        try {
            switch (schedule.reportKey) {
                case 'ASSET_REGISTER':
                    result = await srv.send('getAssetRegister', filters);
                    break;
                case 'CONDITION_DISTRIBUTION':
                    result = await srv.send('getConditionDistribution', filters);
                    break;
                case 'RESTRICTION_SUMMARY':
                    result = await srv.send('getRestrictionSummary', filters);
                    break;
                case 'NETWORK_KPIS':
                    result = await srv.send('getDashboardKPIs', { jurisdiction: filters.jurisdiction || '' });
                    break;
                case 'CONDITION_TREND':
                    result = await srv.send('getConditionTrend', { periods: filters.periods || 12, jurisdiction: filters.jurisdiction || '' });
                    break;
                default:
                    result = JSON.stringify({ message: 'Report type not yet implemented: ' + schedule.reportKey });
            }
        } catch (e) {
            result = JSON.stringify({ error: e.message });
        }

        // Update last run status
        await db.run(UPDATE('nhvr.ReportSchedule').where({ ID: scheduleId }).set({
            lastRunAt: new Date().toISOString(),
            lastRunStatus: result ? 'SUCCESS' : 'ERROR'
        }));

        return typeof result === 'string' ? result : JSON.stringify(result);
    });
};
