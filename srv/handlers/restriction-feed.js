// ============================================================
// PHASE D18 — Restriction Feed Source
// Poll external TMC / jurisdiction feeds for restriction data
// ============================================================
'use strict';

module.exports = function registerRestrictionFeedHandlers(srv, _helpers) {
    const cds = require('@sap/cds');

    srv.on('pollRestrictionFeed', async (req) => {
        const db = await cds.connect.to('db');
        const { sourceCode } = req.data;

        const source = await db.run(SELECT.one.from('nhvr.RestrictionFeedSource').where({ sourceCode: sourceCode, isEnabled: true }));
        if (!source) return req.reject(404, 'Feed source not found or disabled');

        // Update poll timestamp
        await db.run(UPDATE('nhvr.RestrictionFeedSource').where({ ID: source.ID }).set({
            lastPollAt: new Date().toISOString(),
            lastStatus: 'POLLING'
        }));

        try {
            // Fetch from external feed
            var resp = await fetch(source.feedUrl, { signal: AbortSignal.timeout(30000) });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();

            // Parse and create restrictions (format-specific logic)
            var created = 0;
            // Stub: return raw data count — real implementation parses TMC format
            await db.run(UPDATE('nhvr.RestrictionFeedSource').where({ ID: source.ID }).set({
                lastStatus: 'SUCCESS',
                lastErrorMessage: null
            }));

            return JSON.stringify({
                source: sourceCode,
                status: 'SUCCESS',
                itemsReceived: Array.isArray(data) ? data.length : 0,
                restrictionsCreated: created
            });
        } catch (e) {
            await db.run(UPDATE('nhvr.RestrictionFeedSource').where({ ID: source.ID }).set({
                lastStatus: 'ERROR',
                lastErrorMessage: e.message
            }));
            return JSON.stringify({ source: sourceCode, status: 'ERROR', error: e.message });
        }
    });
};
