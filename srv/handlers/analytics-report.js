/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Reporting Handlers
   Portable: works in any SAP CAP Node.js app
   6 reporting functions + aggregate-table queries
   ──────────────────────────────────────────────────────────────── */
'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('analytics-report');

// ── Known routes for underused-feature detection ────────────────
// Override via NHVR_ANALYTICS_KNOWN_ROUTES env or pass from config
const DEFAULT_KNOWN_ROUTES = [
    'Home', 'Dashboard', 'ExecutiveDashboard', 'Bridges', 'BridgeDetail',
    'BridgeNew', 'BridgeEdit', 'Restrictions', 'MapView', 'Reports',
    'AdminConfig', 'MassUpload', 'MassEdit', 'InspectionOrders',
    'InspectionCreate', 'FreightRoutes', 'FreightRouteDetail',
    'Permits', 'VehicleClasses', 'RouteAssessment', 'DataQuality',
    'RiskPrioritisation', 'AnalyticsDashboard'
];

function getKnownRoutes() {
    const envRoutes = process.env.NHVR_ANALYTICS_KNOWN_ROUTES;
    if (envRoutes) {
        try { return JSON.parse(envRoutes); } catch { /* ignore */ }
    }
    return DEFAULT_KNOWN_ROUTES;
}

// ── Helper: safe date range ─────────────────────────────────────
function parseDates(fromDate, toDate) {
    const now = new Date();
    const from = fromDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = toDate || now.toISOString().split('T')[0];
    return { from, to };
}

// ── Helper: days between two dates ──────────────────────────────
function daysBetween(from, to) {
    return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000));
}

module.exports = function registerAnalyticsReportHandlers(srv, _helpers) {

    // ────────────────────────────────────────────────────────────
    // 1. getAnalyticsSummary — headline KPIs + top routes/actions
    // ────────────────────────────────────────────────────────────
    srv.on('getAnalyticsSummary', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const granularity = req.data.granularity || 'daily';

        try {
            // Headline KPIs from raw data for accuracy
            const [sessions] = await db.run(
                SELECT.from('nhvr.AnalyticsSession')
                    .columns('count(DISTINCT pseudoUserId) as uniqueUsers', 'count(*) as totalSessions')
                    .where('startedAt >=', from, 'and startedAt <=', to + 'T23:59:59Z')
            );

            const [events] = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('count(*) as totalEvents')
                    .where('timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
            );

            const [errors] = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('count(*) as totalErrors')
                    .where('category =', 'error', 'and timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
            );

            // Top 10 routes
            const topRoutes = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('targetRoute', 'count(*) as cnt')
                    .where('eventType =', 'page_view', 'and timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('targetRoute')
                    .orderBy('cnt desc')
                    .limit(10)
            );

            // Top 10 actions
            const topActions = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('eventType', 'count(*) as cnt')
                    .where('category NOT IN', ['session', 'navigation', 'error', 'performance'],
                           'and timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('eventType')
                    .orderBy('cnt desc')
                    .limit(10)
            );

            // Top errors
            const topErrors = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('eventType', 'errorCode', 'count(*) as cnt')
                    .where('category =', 'error', 'and timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('eventType', 'errorCode')
                    .orderBy('cnt desc')
                    .limit(10)
            );

            // Avg session duration
            const avgDuration = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('sessionId', 'min(timestamp) as firstSeen', 'max(timestamp) as lastSeen')
                    .where('timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('sessionId')
            );
            let avgSessionMs = 0;
            if (avgDuration.length > 0) {
                const durations = avgDuration.map(s => new Date(s.lastSeen) - new Date(s.firstSeen)).filter(d => d > 0);
                avgSessionMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
            }

            return JSON.stringify({
                period: { from, to, granularity },
                kpis: {
                    uniqueUsers:     sessions?.uniqueUsers || 0,
                    totalSessions:   sessions?.totalSessions || 0,
                    totalEvents:     events?.totalEvents || 0,
                    totalErrors:     errors?.totalErrors || 0,
                    avgSessionMs:    avgSessionMs,
                    daysInPeriod:    daysBetween(from, to)
                },
                topRoutes:  topRoutes || [],
                topActions: topActions || [],
                topErrors:  topErrors || []
            });
        } catch (err) {
            LOG.error('getAnalyticsSummary failed', err.message);
            return JSON.stringify({ error: 'Failed to generate summary' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 2. getFeatureAdoption — per-event counts with trend
    // ────────────────────────────────────────────────────────────
    srv.on('getFeatureAdoption', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const days = daysBetween(from, to);

        try {
            // Current period
            const current = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('eventType', 'category', 'count(*) as cnt',
                             'count(DISTINCT pseudoUserId) as users')
                    .where('timestamp >=', from, 'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('eventType', 'category')
                    .orderBy('cnt desc')
            );

            // Previous equal-length period
            const prevFrom = new Date(new Date(from).getTime() - days * 86400000).toISOString().split('T')[0];
            const previous = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('eventType', 'count(*) as cnt')
                    .where('timestamp >=', prevFrom, 'and timestamp <', from)
                    .groupBy('eventType')
            );
            const prevMap = {};
            for (const p of previous) prevMap[p.eventType] = p.cnt;

            const features = current.map(c => {
                const prev = prevMap[c.eventType] || 0;
                const change = prev > 0 ? Math.round(((c.cnt - prev) / prev) * 100) : (c.cnt > 0 ? 100 : 0);
                return {
                    eventType:   c.eventType,
                    category:    c.category,
                    count:       c.cnt,
                    uniqueUsers: c.users,
                    prevCount:   prev,
                    trendPct:    change,
                    trend:       change > 10 ? 'up' : change < -10 ? 'down' : 'stable'
                };
            });

            return JSON.stringify({ period: { from, to, comparedTo: prevFrom }, features });
        } catch (err) {
            LOG.error('getFeatureAdoption failed', err.message);
            return JSON.stringify({ error: 'Failed to generate feature adoption' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 3. getUnderusedFeatures — routes below threshold
    // ────────────────────────────────────────────────────────────
    srv.on('getUnderusedFeatures', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const threshold = req.data.threshold || 5;

        try {
            const routeUsage = await db.run(
                SELECT.from('nhvr.AnalyticsEvent')
                    .columns('targetRoute', 'count(*) as cnt',
                             'count(DISTINCT pseudoUserId) as users')
                    .where('eventType =', 'page_view',
                           'and timestamp >=', from,
                           'and timestamp <=', to + 'T23:59:59Z')
                    .groupBy('targetRoute')
            );
            const usageMap = {};
            for (const r of routeUsage) usageMap[r.targetRoute] = r;

            const knownRoutes = getKnownRoutes();
            const underused = knownRoutes.map(route => {
                const usage = usageMap[route] || { cnt: 0, users: 0 };
                return {
                    route,
                    pageViews:   usage.cnt,
                    uniqueUsers: usage.users,
                    underused:   usage.cnt < threshold
                };
            }).filter(r => r.underused).sort((a, b) => a.pageViews - b.pageViews);

            return JSON.stringify({ period: { from, to }, threshold, underused });
        } catch (err) {
            LOG.error('getUnderusedFeatures failed', err.message);
            return JSON.stringify({ error: 'Failed to detect underused features' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 4. getWorkflowFunnels — step completion / dropoff
    // ────────────────────────────────────────────────────────────
    srv.on('getWorkflowFunnels', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const wfType = req.data.workflowType || null;

        try {
            const params = ['workflow', from, to + 'T23:59:59Z'];
            let wfFilter = '';
            if (wfType) {
                wfFilter = ` AND metadata LIKE ?`;
                params.push(`%"type":"${String(wfType).replace(/[^a-zA-Z0-9_-]/g, '')}"%`);
            }

            const workflows = await db.run(
                `SELECT workflowId, workflowTotal,
                        MAX(CASE WHEN eventType = 'workflow_complete' THEN 1 ELSE 0 END) as completed,
                        MAX(CASE WHEN eventType = 'workflow_abandon' THEN 1 ELSE 0 END) as abandoned,
                        MAX(workflowStep) as lastStep
                 FROM nhvr_AnalyticsEvent
                 WHERE category = ? AND timestamp >= ? AND timestamp <= ?${wfFilter} AND workflowId IS NOT NULL
                 GROUP BY workflowId, workflowTotal`,
                params
            );

            const total = workflows.length;
            const completedCount = workflows.filter(w => w.completed === 1).length;
            const abandonedCount = workflows.filter(w => w.abandoned === 1).length;
            const inProgress = total - completedCount - abandonedCount;

            // Per-step analysis
            const maxSteps = Math.max(...workflows.map(w => w.workflowTotal || 1), 1);
            const stepCounts = [];
            for (let s = 1; s <= maxSteps; s++) {
                const reached = workflows.filter(w => w.lastStep >= s).length;
                stepCounts.push({
                    step: s,
                    reached,
                    reachedPct: total > 0 ? Math.round((reached / total) * 100) : 0,
                    dropoff: s > 1 ? (stepCounts[s - 2]?.reached || total) - reached : 0
                });
            }

            return JSON.stringify({
                period: { from, to },
                workflowType: wfType,
                summary: { total, completedCount, abandonedCount, inProgress,
                           completionRate: total > 0 ? Math.round((completedCount / total) * 100) : 0 },
                steps: stepCounts
            });
        } catch (err) {
            LOG.error('getWorkflowFunnels failed', err.message);
            return JSON.stringify({ error: 'Failed to generate workflow funnels' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 5. getErrorTrends — time-series by error type
    // ────────────────────────────────────────────────────────────
    srv.on('getErrorTrends', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);

        try {
            const trends = await db.run(
                `SELECT DATE(timestamp) as dt, eventType, errorCode,
                        COUNT(*) as cnt
                 FROM nhvr_AnalyticsEvent
                 WHERE category = 'error'
                   AND timestamp >= ?
                   AND timestamp <= ?
                 GROUP BY DATE(timestamp), eventType, errorCode
                 ORDER BY dt ASC`,
                [from, to + 'T23:59:59Z']
            );

            // 7-day rolling average for spike detection
            const dailyTotals = {};
            for (const t of trends) {
                dailyTotals[t.dt] = (dailyTotals[t.dt] || 0) + t.cnt;
            }
            const dates = Object.keys(dailyTotals).sort();
            const spikes = [];
            for (let i = 7; i < dates.length; i++) {
                const avg7d = dates.slice(i - 7, i).reduce((sum, d) => sum + dailyTotals[d], 0) / 7;
                if (avg7d > 0 && dailyTotals[dates[i]] > avg7d * 2) {
                    spikes.push({ date: dates[i], count: dailyTotals[dates[i]], avg7d: Math.round(avg7d), severity: 'spike' });
                }
            }

            return JSON.stringify({ period: { from, to }, trends, spikes });
        } catch (err) {
            LOG.error('getErrorTrends failed', err.message);
            return JSON.stringify({ error: 'Failed to generate error trends' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 6. getPerformanceHotspots — slow routes / actions
    // ────────────────────────────────────────────────────────────
    srv.on('getPerformanceHotspots', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const thresholdMs = req.data.thresholdMs || 3000;

        try {
            const safeThreshold = Number(thresholdMs) || 3000;
            const hotspots = await db.run(
                `SELECT targetRoute, eventType,
                        COUNT(*) as cnt,
                        CAST(AVG(durationMs) AS INTEGER) as avgMs,
                        MAX(durationMs) as maxMs,
                        MIN(durationMs) as minMs
                 FROM nhvr_AnalyticsEvent
                 WHERE durationMs IS NOT NULL
                   AND durationMs > 0
                   AND timestamp >= ?
                   AND timestamp <= ?
                 GROUP BY targetRoute, eventType
                 HAVING AVG(durationMs) > ?
                 ORDER BY avgMs DESC
                 LIMIT 20`,
                [from, to + 'T23:59:59Z', safeThreshold]
            );

            // Check for week-over-week regression
            const days = daysBetween(from, to);
            const prevFrom = new Date(new Date(from).getTime() - days * 86400000).toISOString().split('T')[0];
            const prevHotspots = await db.run(
                `SELECT targetRoute, eventType,
                        CAST(AVG(durationMs) AS INTEGER) as avgMs
                 FROM nhvr_AnalyticsEvent
                 WHERE durationMs IS NOT NULL AND durationMs > 0
                   AND timestamp >= ? AND timestamp < ?
                 GROUP BY targetRoute, eventType`,
                [prevFrom, from]
            );
            const prevMap = {};
            for (const p of prevHotspots) prevMap[`${p.targetRoute}|${p.eventType}`] = p.avgMs;

            const results = hotspots.map(h => {
                const prevAvg = prevMap[`${h.targetRoute}|${h.eventType}`] || 0;
                const regression = prevAvg > 0 ? Math.round(((h.avgMs - prevAvg) / prevAvg) * 100) : 0;
                return {
                    ...h,
                    prevAvgMs:     prevAvg,
                    regressionPct: regression,
                    regressed:     regression > 50
                };
            });

            return JSON.stringify({ period: { from, to }, thresholdMs, hotspots: results });
        } catch (err) {
            LOG.error('getPerformanceHotspots failed', err.message);
            return JSON.stringify({ error: 'Failed to detect performance hotspots' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 7. getAnalyticsByRole — cohort analysis grouped by userRole
    // ────────────────────────────────────────────────────────────
    srv.on('getAnalyticsByRole', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        try {
            const { AnalyticsEvent } = db.entities('nhvr');
            const rows = await SELECT.from(AnalyticsEvent)
                .columns('userRole',
                    { func: 'count', args: ['*'], as: 'eventCount' },
                    { func: 'count', args: [{ func: 'distinct', args: ['pseudoUserId'] }], as: 'uniqueUsers' },
                    { func: 'count', args: [{ func: 'distinct', args: ['sessionId'] }], as: 'sessions' },
                    { func: 'avg', args: ['durationMs'], as: 'avgDurationMs' }
                )
                .where({ timestamp: { '>=': from }, and: { timestamp: { '<=': to } } })
                .groupBy('userRole')
                .orderBy({ eventCount: 'desc' });

            const total = rows.reduce((s, r) => s + (r.eventCount || 0), 0);
            const results = rows.map(r => ({
                role: r.userRole || 'unknown',
                eventCount: r.eventCount || 0,
                uniqueUsers: r.uniqueUsers || 0,
                sessions: r.sessions || 0,
                avgDurationMs: Math.round(r.avgDurationMs || 0),
                pctOfTotal: total > 0 ? Math.round((r.eventCount / total) * 1000) / 10 : 0
            }));

            return JSON.stringify({ period: { from, to }, roles: results, totalEvents: total });
        } catch (err) {
            LOG.error('getAnalyticsByRole failed', err.message);
            return JSON.stringify({ error: 'Failed to generate role cohort analysis' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 8. getAnalyticsByTenant — cohort analysis grouped by tenant
    // ────────────────────────────────────────────────────────────
    srv.on('getAnalyticsByTenant', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        try {
            const { AnalyticsEvent } = db.entities('nhvr');
            const rows = await SELECT.from(AnalyticsEvent)
                .columns('tenantCode',
                    { func: 'count', args: ['*'], as: 'eventCount' },
                    { func: 'count', args: [{ func: 'distinct', args: ['pseudoUserId'] }], as: 'uniqueUsers' },
                    { func: 'count', args: [{ func: 'distinct', args: ['sessionId'] }], as: 'sessions' },
                    { func: 'avg', args: ['durationMs'], as: 'avgDurationMs' },
                    { func: 'sum', args: [{ xpr: [{ ref: ['errorCode'] }, 'is not null'] }], as: 'errorCount' }
                )
                .where({ timestamp: { '>=': from }, and: { timestamp: { '<=': to } } })
                .groupBy('tenantCode')
                .orderBy({ eventCount: 'desc' });

            const results = rows.map(r => ({
                tenant: r.tenantCode || 'default',
                eventCount: r.eventCount || 0,
                uniqueUsers: r.uniqueUsers || 0,
                sessions: r.sessions || 0,
                avgDurationMs: Math.round(r.avgDurationMs || 0),
                errorCount: r.errorCount || 0
            }));

            return JSON.stringify({ period: { from, to }, tenants: results });
        } catch (err) {
            LOG.error('getAnalyticsByTenant failed', err.message);
            return JSON.stringify({ error: 'Failed to generate tenant cohort analysis' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 9. exportAnalyticsCSV — CSV download of analytics summary
    // ────────────────────────────────────────────────────────────
    srv.on('exportAnalyticsCSV', async (req) => {
        const db = await cds.connect.to('db');
        const { from, to } = parseDates(req.data.fromDate, req.data.toDate);
        const reportType = req.data.reportType || 'summary';
        try {
            const { AnalyticsDailyAgg } = db.entities('nhvr');
            let rows;
            if (reportType === 'by_role') {
                rows = await SELECT.from(AnalyticsDailyAgg)
                    .columns('aggDate', 'userRole', 'category', 'eventType', 'eventCount', 'uniqueUsers', 'uniqueSessions', 'avgDurationMs', 'errorCount')
                    .where({ aggDate: { '>=': from }, and: { aggDate: { '<=': to } } })
                    .orderBy('aggDate', 'userRole');
            } else if (reportType === 'by_tenant') {
                rows = await SELECT.from(AnalyticsDailyAgg)
                    .columns('aggDate', 'tenantCode', 'category', 'eventType', 'eventCount', 'uniqueUsers', 'uniqueSessions', 'avgDurationMs', 'errorCount')
                    .where({ aggDate: { '>=': from }, and: { aggDate: { '<=': to } } })
                    .orderBy('aggDate', 'tenantCode');
            } else {
                rows = await SELECT.from(AnalyticsDailyAgg)
                    .columns('aggDate', 'category', 'eventType', 'targetRoute', 'eventCount', 'uniqueUsers', 'uniqueSessions', 'avgDurationMs', 'maxDurationMs', 'errorCount')
                    .where({ aggDate: { '>=': from }, and: { aggDate: { '<=': to } } })
                    .orderBy('aggDate', 'category');
            }

            if (!rows || rows.length === 0) {
                return JSON.stringify({ csvData: '', rowCount: 0 });
            }

            const headers = Object.keys(rows[0]);
            const csvLines = [headers.join(',')];
            for (const row of rows) {
                csvLines.push(headers.map(h => {
                    const v = row[h];
                    if (v === null || v === undefined) return '';
                    const s = String(v);
                    return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
                }).join(','));
            }

            return JSON.stringify({ csvData: csvLines.join('\n'), rowCount: rows.length, reportType, period: { from, to } });
        } catch (err) {
            LOG.error('exportAnalyticsCSV failed', err.message);
            return JSON.stringify({ error: 'Failed to export analytics CSV' });
        }
    });

    // ────────────────────────────────────────────────────────────
    // 10. executeAnalyticsReport — scheduled report trigger
    // ────────────────────────────────────────────────────────────
    srv.on('executeAnalyticsReport', async (req) => {
        const db = await cds.connect.to('db');
        const { scheduleId } = req.data;
        try {
            const { ReportSchedule } = db.entities('nhvr');
            const schedule = await SELECT.one.from(ReportSchedule).where({ ID: scheduleId });
            if (!schedule) return JSON.stringify({ error: 'Schedule not found' });
            if (!schedule.isActive) return JSON.stringify({ error: 'Schedule is disabled' });

            // Calculate date range from schedule filters or default to last 30 days
            const now = new Date();
            const toDate = now.toISOString().split('T')[0];
            const fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

            // Run summary report
            const { AnalyticsDailyAgg } = db.entities('nhvr');
            const rows = await SELECT.from(AnalyticsDailyAgg)
                .columns('aggDate', 'category', 'eventType', 'eventCount', 'uniqueUsers', 'avgDurationMs', 'errorCount')
                .where({ aggDate: { '>=': fromDate }, and: { aggDate: { '<=': toDate } } })
                .orderBy('aggDate');

            // Update last run
            await UPDATE(ReportSchedule).set({ lastRunAt: now.toISOString(), lastRunStatus: 'SUCCESS' }).where({ ID: scheduleId });

            const totalEvents = rows.reduce((s, r) => s + (r.eventCount || 0), 0);
            const totalUsers = new Set(rows.map(r => r.uniqueUsers)).size;

            return JSON.stringify({
                scheduleId,
                reportKey: schedule.reportKey,
                period: { from: fromDate, to: toDate },
                summary: { totalRows: rows.length, totalEvents, uniqueUserGroups: totalUsers },
                status: 'SUCCESS'
            });
        } catch (err) {
            LOG.error('executeAnalyticsReport failed', err.message);
            return JSON.stringify({ error: 'Failed to execute scheduled report' });
        }
    });
};
