'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-notify');

module.exports = function registerNotificationHandlers(srv, h) {

    // ── generateNotifications ────────────────────────────────────
    // Scans business data for actionable conditions and creates
    // Notification records. Idempotent — skips if a matching
    // notification (same relatedEntity + relatedId + category)
    // already exists and is not dismissed.
    srv.on('generateNotifications', async (req) => {
        const db = await cds.connect.to('db');
        var created = 0;

        // Load enabled rules
        const rules = await db.run(
            SELECT.from('nhvr.NotificationRule').where({ isEnabled: true })
        );
        const ruleMap = {};
        for (const r of rules) { ruleMap[r.ruleCode] = r; }

        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);

        // ── Rule: PERMIT_EXPIRING (30 days) ──────────────────────
        const permitRule = ruleMap['PERMIT_EXPIRING'];
        if (permitRule) {
            const thresholdDays = permitRule.thresholdDays || 30;
            const cutoff = new Date(today.getTime() + thresholdDays * 86400000)
                .toISOString().slice(0, 10);
            const permits = await db.run(
                SELECT.from('nhvr.VehiclePermit')
                    .where('validToDate >=', todayStr)
                    .and('validToDate <=', cutoff)
                    .and({ status: 'ACTIVE' })
            );
            for (const p of permits) {
                var exists = await db.run(
                    SELECT.one.from('nhvr.Notification').where({
                        relatedEntity: 'VehiclePermit',
                        relatedId: p.ID,
                        category: 'PERMIT_EXPIRING',
                        isDismissed: false
                    })
                );
                if (!exists) {
                    await db.run(INSERT.into('nhvr.Notification').entries({
                        recipientRole: permitRule.recipientRoles || 'BridgeManager',
                        title: 'Permit expiring: ' + (p.permitNumber || p.ID),
                        message: 'Permit ' + (p.permitNumber || '') + ' expires on ' + p.validToDate,
                        category: 'PERMIT_EXPIRING',
                        severity: 'WARNING',
                        relatedEntity: 'VehiclePermit',
                        relatedId: p.ID
                    }));
                    created++;
                }
            }
        }

        // ── Rule: INSPECTION_OVERDUE ─────────────────────────────
        const inspRule = ruleMap['INSPECTION_OVERDUE'];
        if (inspRule) {
            const thresholdDays = inspRule.thresholdDays || 365;
            const cutoff = new Date(today.getTime() - thresholdDays * 86400000)
                .toISOString().slice(0, 10);
            const bridges = await db.run(
                SELECT.from('nhvr.Bridge')
                    .columns('ID', 'bridgeId', 'name', 'inspectionDate')
                    .where('inspectionDate <', cutoff)
                    .and({ isActive: true })
            );
            for (const b of bridges) {
                var exists = await db.run(
                    SELECT.one.from('nhvr.Notification').where({
                        relatedEntity: 'Bridge',
                        relatedId: b.ID,
                        category: 'INSPECTION_OVERDUE',
                        isDismissed: false
                    })
                );
                if (!exists) {
                    await db.run(INSERT.into('nhvr.Notification').entries({
                        recipientRole: inspRule.recipientRoles || 'BridgeManager',
                        title: 'Inspection overdue: ' + b.bridgeId,
                        message: 'Bridge ' + b.name + ' (' + b.bridgeId + ') last inspected ' + (b.inspectionDate || 'never'),
                        category: 'INSPECTION_OVERDUE',
                        severity: 'HIGH',
                        relatedEntity: 'Bridge',
                        relatedId: b.ID
                    }));
                    created++;
                }
            }
        }

        // ── Rule: RESTRICTION_EXPIRING (7 days) ──────────────────
        const restRule = ruleMap['RESTRICTION_EXPIRING'];
        if (restRule) {
            const thresholdDays = restRule.thresholdDays || 7;
            var cutoff = new Date(today.getTime() + thresholdDays * 86400000)
                .toISOString().slice(0, 10);
            const restrictions = await db.run(
                SELECT.from('nhvr.Restriction')
                    .columns('ID', 'restrictionType', 'bridge_ID', 'validToDate')
                    .where('validToDate >=', todayStr)
                    .and('validToDate <=', cutoff)
                    .and({ isActive: true })
            );
            for (const r of restrictions) {
                var exists = await db.run(
                    SELECT.one.from('nhvr.Notification').where({
                        relatedEntity: 'Restriction',
                        relatedId: r.ID,
                        category: 'RESTRICTION_EXPIRING',
                        isDismissed: false
                    })
                );
                if (!exists) {
                    await db.run(INSERT.into('nhvr.Notification').entries({
                        recipientRole: restRule.recipientRoles || 'BridgeManager',
                        title: 'Restriction expiring: ' + r.restrictionType,
                        message: 'Restriction ' + r.restrictionType + ' expires on ' + r.validToDate,
                        category: 'RESTRICTION_EXPIRING',
                        severity: 'WARNING',
                        relatedEntity: 'Restriction',
                        relatedId: r.ID
                    }));
                    created++;
                }
            }
        }

        LOG.info('Notification generation complete', { created: created });
        return JSON.stringify({ created: created });
    });

    // ── getMyNotifications ───────────────────────────────────────
    srv.on('getMyNotifications', async (req) => {
        const db = await cds.connect.to('db');
        var userRoles = [];
        if (req.user && req.user.is) {
            var knownRoles = ['Admin', 'BridgeManager', 'Executive', 'Viewer', 'Inspector', 'Operator'];
            for (var i = 0; i < knownRoles.length; i++) {
                if (req.user.is(knownRoles[i])) userRoles.push(knownRoles[i]);
            }
        }
        if (userRoles.length === 0) userRoles.push('Viewer');

        // Build OR condition for recipientRole matching any of user's roles
        var conditions = userRoles.map(function (r) { return { recipientRole: r }; });

        var notifications = await db.run(
            SELECT.from('nhvr.Notification')
                .where({ isDismissed: false })
                .and({ or: conditions })
                .orderBy('createdAt desc')
                .limit(100)
        );

        return JSON.stringify(notifications);
    });

    // ── markNotificationRead ─────────────────────────────────────
    srv.on('markNotificationRead', async (req) => {
        const db = await cds.connect.to('db');
        const { notificationId } = req.data;
        if (!notificationId) return req.reject(400, 'notificationId is required');

        await db.run(
            UPDATE('nhvr.Notification').where({ ID: notificationId }).set({ isRead: true })
        );
        return { status: 'OK' };
    });

    // ── dismissNotification ──────────────────────────────────────
    srv.on('dismissNotification', async (req) => {
        const db = await cds.connect.to('db');
        const { notificationId } = req.data;
        if (!notificationId) return req.reject(400, 'notificationId is required');

        await db.run(
            UPDATE('nhvr.Notification').where({ ID: notificationId }).set({ isDismissed: true })
        );
        return { status: 'OK' };
    });
};
