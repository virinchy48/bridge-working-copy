/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Rollup & Purge Handlers
   Portable: works in any SAP CAP Node.js app
   ──────────────────────────────────────────────────────────────── */
'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('analytics-purge');

module.exports = function registerAnalyticsPurgeHandlers(srv, _helpers) {

    // ────────────────────────────────────────────────────────────
    // runAnalyticsRollup — aggregate raw → daily → weekly → monthly
    // ────────────────────────────────────────────────────────────
    srv.on('runAnalyticsRollup', async (req) => {
        const db = await cds.connect.to('db');
        let dailyRows = 0, weeklyRows = 0, monthlyRows = 0;

        try {
            // ── Daily rollup (raw events → AnalyticsDailyAgg) ──
            const dailyData = await db.run(
                `SELECT DATE(timestamp) as aggDate, tenantCode, environment,
                        category, eventType, targetRoute, userRole,
                        COUNT(*) as eventCount,
                        COUNT(DISTINCT pseudoUserId) as uniqueUsers,
                        COUNT(DISTINCT sessionId) as uniqueSessions,
                        CAST(AVG(durationMs) AS INTEGER) as avgDurationMs,
                        MAX(durationMs) as maxDurationMs,
                        SUM(CASE WHEN category = 'error' THEN 1 ELSE 0 END) as errorCount,
                        SUM(COALESCE(resultCount, 0)) as totalResultCount
                 FROM nhvr_AnalyticsEvent
                 WHERE DATE(timestamp) < DATE('now')
                   AND DATE(timestamp) NOT IN (
                       SELECT DISTINCT aggDate FROM nhvr_AnalyticsDailyAgg
                   )
                 GROUP BY DATE(timestamp), tenantCode, environment,
                          category, eventType, targetRoute, userRole`
            );

            if (dailyData.length > 0) {
                const entries = dailyData.map(d => ({
                    ID:               cds.utils.uuid(),
                    aggDate:          d.aggDate,
                    tenantCode:       d.tenantCode || 'DEFAULT',
                    environment:      d.environment || 'production',
                    category:         d.category,
                    eventType:        d.eventType,
                    targetRoute:      d.targetRoute,
                    userRole:         d.userRole,
                    eventCount:       d.eventCount,
                    uniqueUsers:      d.uniqueUsers,
                    uniqueSessions:   d.uniqueSessions,
                    avgDurationMs:    d.avgDurationMs,
                    maxDurationMs:    d.maxDurationMs,
                    errorCount:       d.errorCount,
                    totalResultCount: d.totalResultCount
                }));
                await db.run(INSERT.into('nhvr.AnalyticsDailyAgg').entries(entries));
                dailyRows = entries.length;
            }

            // ── Weekly rollup (daily → AnalyticsWeeklyAgg) ──
            // Monday anchor: day_of_week = 1 (ISO)
            const weeklyData = await db.run(
                `SELECT CASE
                     WHEN CAST(strftime('%w', aggDate) AS INTEGER) = 0
                     THEN DATE(aggDate, '-6 days')
                     ELSE DATE(aggDate, '-' || (CAST(strftime('%w', aggDate) AS INTEGER) - 1) || ' days')
                 END as weekStartDate,
                 tenantCode, environment, category, eventType, targetRoute, userRole,
                 SUM(eventCount) as eventCount,
                 SUM(uniqueUsers) as uniqueUsers,
                 SUM(uniqueSessions) as uniqueSessions,
                 CAST(AVG(avgDurationMs) AS INTEGER) as avgDurationMs,
                 MAX(maxDurationMs) as maxDurationMs,
                 SUM(errorCount) as errorCount,
                 SUM(totalResultCount) as totalResultCount
                 FROM nhvr_AnalyticsDailyAgg
                 WHERE aggDate < DATE('now', '-7 days')
                 GROUP BY weekStartDate, tenantCode, environment,
                          category, eventType, targetRoute, userRole
                 HAVING weekStartDate NOT IN (
                     SELECT DISTINCT weekStartDate FROM nhvr_AnalyticsWeeklyAgg
                 )`
            );

            if (weeklyData.length > 0) {
                const entries = weeklyData.map(w => ({
                    ID:               cds.utils.uuid(),
                    weekStartDate:    w.weekStartDate,
                    tenantCode:       w.tenantCode || 'DEFAULT',
                    environment:      w.environment || 'production',
                    category:         w.category,
                    eventType:        w.eventType,
                    targetRoute:      w.targetRoute,
                    userRole:         w.userRole,
                    eventCount:       w.eventCount,
                    uniqueUsers:      w.uniqueUsers,
                    uniqueSessions:   w.uniqueSessions,
                    avgDurationMs:    w.avgDurationMs,
                    maxDurationMs:    w.maxDurationMs,
                    errorCount:       w.errorCount,
                    totalResultCount: w.totalResultCount
                }));
                await db.run(INSERT.into('nhvr.AnalyticsWeeklyAgg').entries(entries));
                weeklyRows = entries.length;
            }

            // ── Monthly rollup (weekly → AnalyticsMonthlyAgg) ──
            const monthlyData = await db.run(
                `SELECT SUBSTR(weekStartDate, 1, 7) as aggMonth,
                 tenantCode, environment, category, eventType, targetRoute, userRole,
                 SUM(eventCount) as eventCount,
                 SUM(uniqueUsers) as uniqueUsers,
                 SUM(uniqueSessions) as uniqueSessions,
                 CAST(AVG(avgDurationMs) AS INTEGER) as avgDurationMs,
                 MAX(maxDurationMs) as maxDurationMs,
                 SUM(errorCount) as errorCount,
                 SUM(totalResultCount) as totalResultCount
                 FROM nhvr_AnalyticsWeeklyAgg
                 WHERE SUBSTR(weekStartDate, 1, 7) < SUBSTR(DATE('now'), 1, 7)
                 GROUP BY aggMonth, tenantCode, environment,
                          category, eventType, targetRoute, userRole
                 HAVING aggMonth NOT IN (
                     SELECT DISTINCT aggMonth FROM nhvr_AnalyticsMonthlyAgg
                 )`
            );

            if (monthlyData.length > 0) {
                const entries = monthlyData.map(m => ({
                    ID:               cds.utils.uuid(),
                    aggMonth:         m.aggMonth,
                    tenantCode:       m.tenantCode || 'DEFAULT',
                    environment:      m.environment || 'production',
                    category:         m.category,
                    eventType:        m.eventType,
                    targetRoute:      m.targetRoute,
                    userRole:         m.userRole,
                    eventCount:       m.eventCount,
                    uniqueUsers:      m.uniqueUsers,
                    uniqueSessions:   m.uniqueSessions,
                    avgDurationMs:    m.avgDurationMs,
                    maxDurationMs:    m.maxDurationMs,
                    errorCount:       m.errorCount,
                    totalResultCount: m.totalResultCount
                }));
                await db.run(INSERT.into('nhvr.AnalyticsMonthlyAgg').entries(entries));
                monthlyRows = entries.length;
            }

            LOG.info(`Rollup complete: ${dailyRows} daily, ${weeklyRows} weekly, ${monthlyRows} monthly`);
            return { dailyRows, weeklyRows, monthlyRows };
        } catch (err) {
            LOG.error('Rollup failed', err.message);
            req.error(500, 'Rollup failed: ' + err.message);
        }
    });

    // ────────────────────────────────────────────────────────────
    // purgeAnalyticsData — retention-based cleanup
    // ────────────────────────────────────────────────────────────
    srv.on('purgeAnalyticsData', async (req) => {
        const db = await cds.connect.to('db');

        try {
            // Load config
            const cfgRows = await db.run(
                SELECT.from('nhvr.AnalyticsConfig').where({ configKey: 'GLOBAL' }).limit(1)
            );
            const cfg = cfgRows[0] || {
                retentionDays: 90,
                dailyRetentionDays: 365,
                weeklyRetentionDays: 730,
                monthlyRetentionDays: 1825
            };

            function daysAgo(d) {
                const dt = new Date();
                dt.setDate(dt.getDate() - d);
                return dt.toISOString().split('T')[0];
            }

            const rawCutoff     = daysAgo(cfg.retentionDays || 90);
            const dailyCutoff   = daysAgo(cfg.dailyRetentionDays || 365);
            const weeklyCutoff  = daysAgo(cfg.weeklyRetentionDays || 730);
            const monthlyCutoff = daysAgo(cfg.monthlyRetentionDays || 1825).substring(0, 7); // "YYYY-MM"
            const sessionCutoff = rawCutoff;

            const rawPurged = await db.run(
                `DELETE FROM nhvr_AnalyticsEvent WHERE timestamp < ?`, [rawCutoff]
            );
            const dailyPurged = await db.run(
                `DELETE FROM nhvr_AnalyticsDailyAgg WHERE aggDate < ?`, [dailyCutoff]
            );
            const weeklyPurged = await db.run(
                `DELETE FROM nhvr_AnalyticsWeeklyAgg WHERE weekStartDate < ?`, [weeklyCutoff]
            );
            const monthlyPurged = await db.run(
                `DELETE FROM nhvr_AnalyticsMonthlyAgg WHERE aggMonth < ?`, [monthlyCutoff]
            );
            const sessionsPurged = await db.run(
                `DELETE FROM nhvr_AnalyticsSession WHERE lastSeenAt < ?`, [sessionCutoff]
            );

            const result = {
                rawPurged:      typeof rawPurged === 'number' ? rawPurged : (rawPurged?.changes || 0),
                dailyPurged:    typeof dailyPurged === 'number' ? dailyPurged : (dailyPurged?.changes || 0),
                weeklyPurged:   typeof weeklyPurged === 'number' ? weeklyPurged : (weeklyPurged?.changes || 0),
                monthlyPurged:  typeof monthlyPurged === 'number' ? monthlyPurged : (monthlyPurged?.changes || 0),
                sessionsPurged: typeof sessionsPurged === 'number' ? sessionsPurged : (sessionsPurged?.changes || 0)
            };

            LOG.info('Purge complete:', result);
            return result;
        } catch (err) {
            LOG.error('Purge failed', err.message);
            req.error(500, 'Purge failed: ' + err.message);
        }
    });
};
