'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('bnac');

module.exports = function registerBnacHandlers(srv, helpers) {
    const { logAudit } = helpers;

    // ── Audit stamp on BnacConfig writes ──────────────────────────
    srv.before(['CREATE', 'UPDATE'], 'BnacConfig', async (req) => {
        const now  = new Date().toISOString();
        const user = req.user?.id || 'system';
        if (req.event === 'CREATE') {
            req.data.createdAt = now;
            req.data.createdBy = user;
        }
        req.data.modifiedAt = now;
        req.data.modifiedBy = user;
    });

    // ── bnacMassLoad action ───────────────────────────────────────
    srv.on('bnacMassLoad', async (req) => {
        const db = await cds.connect.to('db');

        // Parse payload
        let rows;
        try {
            rows = JSON.parse(req.data.payload);
            if (!Array.isArray(rows)) throw new Error('Payload must be a JSON array');
        } catch (e) {
            return req.error(400, `Invalid payload: ${e.message}`);
        }

        // Resolve active environment
        const currentEnv = process.env.BMS_ENVIRONMENT
            || (process.env.NODE_ENV || 'dev').toUpperCase()
            || 'DEV';

        const envConfigs = await db.run(
            SELECT.from('nhvr.BnacEnvironmentConfig').where({ environment: currentEnv, isActive: true })
        );
        const envConfig = envConfigs[0];

        if (!envConfig) {
            return req.error(500,
                `No active BNAC base URL configured for environment: "${currentEnv}". ` +
                `Configure it in BMS Admin > BNAC Configuration.`
            );
        }

        const baseURL = envConfig.baseURL.endsWith('/')
            ? envConfig.baseURL
            : envConfig.baseURL + '/';

        // Process rows
        let successCount = 0, failCount = 0;
        const errors = [];

        for (const row of rows) {
            const { bridgeId, bnacObjectId } = row;
            if (!bridgeId || !bnacObjectId) {
                errors.push({ row, error: 'Missing bridgeId or bnacObjectId' });
                failCount++;
                continue;
            }
            try {
                const computedURL = `${baseURL}${encodeURIComponent(bnacObjectId)}`;
                const updated = await db.run(
                    UPDATE('nhvr.Bridge').set({ bnacObjectId, bnacURL: computedURL }).where({ bridgeId })
                );
                if (updated === 0) {
                    errors.push({ row, error: `Bridge not found: ${bridgeId}` });
                    failCount++;
                } else {
                    successCount++;
                }
            } catch (e) {
                errors.push({ row, error: e.message });
                failCount++;
            }
        }

        // Write audit log
        try {
            await db.run(INSERT.into('nhvr.BnacMassLoadLog').entries({
                loadedAt:     new Date().toISOString(),
                loadedBy:     req.user?.id || 'system',
                fileName:     req.data.fileName || 'manual-upload',
                totalRows:    rows.length,
                successCount,
                failCount,
                errors:       JSON.stringify(errors)
            }));
        } catch (e) {
            LOG.warn('Failed to write BNAC mass-load audit log:', e.message);
        }

        await logAudit('BNAC_MASS_LOAD', 'Bridges', null, 'BNAC Mass Load',
            `Loaded ${successCount} of ${rows.length} BNAC IDs. ${failCount} failed.`, null, req);

        return {
            success: failCount === 0,
            message: `Loaded ${successCount} of ${rows.length} records. ${failCount} failed.`,
            detail:  JSON.stringify(errors)
        };
    });

    // ── Recompute bnacURL on every Bridge READ ────────────────────
    srv.after('READ', 'Bridges', async (bridges) => {
        if (!Array.isArray(bridges) || bridges.length === 0) return;
        // Only recompute if at least one bridge has a bnacObjectId
        if (!bridges.some(b => b.bnacObjectId)) return;

        try {
            const db  = await cds.connect.to('db');
            const env = process.env.BMS_ENVIRONMENT || 'DEV';
            const envConfigs = await db.run(
                SELECT.from('nhvr.BnacEnvironmentConfig').where({ environment: env, isActive: true })
            );
            if (!envConfigs[0]) return;

            const baseURL = envConfigs[0].baseURL.endsWith('/')
                ? envConfigs[0].baseURL
                : envConfigs[0].baseURL + '/';

            for (const bridge of bridges) {
                if (bridge.bnacObjectId) {
                    bridge.bnacURL = `${baseURL}${encodeURIComponent(bridge.bnacObjectId)}`;
                }
            }
        } catch (e) {
            LOG.warn('Failed to recompute bnacURL:', e.message);
        }
    });
};
