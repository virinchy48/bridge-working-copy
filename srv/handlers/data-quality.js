'use strict';
const cds = require('@sap/cds');
const LOG = cds.log('nhvr-dq');

module.exports = function registerDataQualityHandlers(srv, _helpers) {

    srv.on('calculateDataQuality', async (req) => {
        const db = await cds.connect.to('db');
        const { bridgeId } = req.data;
        if (!bridgeId) return req.reject(400, 'bridgeId is required');

        const bridge = await db.run(
            SELECT.one.from('nhvr.Bridge').where({ ID: bridgeId })
        );
        if (!bridge) return req.reject(404, 'Bridge not found');

        const score = _scoreBridge(bridge);
        score.bridge_ID = bridgeId;
        score.calculatedAt = new Date().toISOString();

        // Upsert
        const existing = await db.run(
            SELECT.one.from('nhvr.DataQualityScore').where({ bridge_ID: bridgeId })
        );
        if (existing) {
            await db.run(UPDATE('nhvr.DataQualityScore').where({ ID: existing.ID }).set(score));
        } else {
            await db.run(INSERT.into('nhvr.DataQualityScore').entries(score));
        }

        LOG.info('DQ score calculated', { bridgeId: bridge.bridgeId, overall: score.overallScore });
        return JSON.stringify(score);
    });

    srv.on('calculateAllDataQuality', async (req) => {
        const db = await cds.connect.to('db');
        const bridges = await db.run(
            SELECT.from('nhvr.Bridge').columns(
                'ID', 'bridgeId', 'name', 'latitude', 'longitude',
                'condition', 'conditionRating', 'conditionScore',
                'yearBuilt', 'structureType', 'material', 'state',
                'assetOwner', 'inspectionDate', 'postingStatus',
                'clearanceHeightM', 'deckWidthM', 'spanLengthM'
            )
        );
        var processed = 0;
        for (const bridge of bridges) {
            const score = _scoreBridge(bridge);
            score.bridge_ID = bridge.ID;
            score.calculatedAt = new Date().toISOString();

            const existing = await db.run(
                SELECT.one.from('nhvr.DataQualityScore').where({ bridge_ID: bridge.ID })
            );
            if (existing) {
                await db.run(UPDATE('nhvr.DataQualityScore').where({ ID: existing.ID }).set(score));
            } else {
                await db.run(INSERT.into('nhvr.DataQualityScore').entries(score));
            }
            processed++;
        }
        LOG.info('Bulk DQ scoring complete', { processed: processed, total: bridges.length });
        return JSON.stringify({ processed: processed, total: bridges.length });
    });

    // ── Scoring logic ────────────────────────────────────────────
    function _scoreBridge(b) {
        var missing = [];
        var stale = [];

        // Completeness: check required fields
        var required = [
            'latitude', 'longitude', 'condition', 'conditionRating',
            'yearBuilt', 'structureType', 'material', 'state',
            'assetOwner', 'postingStatus'
        ];
        var filled = 0;
        required.forEach(function (f) {
            if (b[f] !== null && b[f] !== undefined && b[f] !== '') {
                filled++;
            } else {
                missing.push(f);
            }
        });
        var completeness = Math.round(filled / required.length * 100 * 100) / 100;

        // Accuracy: basic validation for Australian bridge data
        var accuracyPenalties = 0;
        if (b.latitude && (b.latitude < -44 || b.latitude > -10)) {
            accuracyPenalties++;
            missing.push('latitude_out_of_AU_range');
        }
        if (b.longitude && (b.longitude < 112 || b.longitude > 154)) {
            accuracyPenalties++;
            missing.push('longitude_out_of_AU_range');
        }
        if (b.conditionRating && (b.conditionRating < 1 || b.conditionRating > 10)) {
            accuracyPenalties++;
        }
        if (b.yearBuilt && (b.yearBuilt < 1800 || b.yearBuilt > 2030)) {
            accuracyPenalties++;
        }
        var accuracy = Math.max(0, 100 - accuracyPenalties * 25);

        // Timeliness: inspection currency
        var timeliness = 100;
        if (b.inspectionDate) {
            var daysSince = Math.floor(
                (Date.now() - new Date(b.inspectionDate).getTime()) / 86400000
            );
            if (daysSince > 730) {
                timeliness = 20;
                stale.push('inspectionDate_over_2yr');
            } else if (daysSince > 365) {
                timeliness = 60;
                stale.push('inspectionDate_over_1yr');
            } else {
                timeliness = 100;
            }
        } else {
            timeliness = 0;
            stale.push('no_inspection_date');
        }

        var overall = Math.round(
            (completeness * 0.4 + accuracy * 0.3 + timeliness * 0.3) * 100
        ) / 100;

        return {
            overallScore: overall,
            completeness: completeness,
            accuracy: accuracy,
            timeliness: timeliness,
            missingFields: JSON.stringify(missing),
            staleFields: JSON.stringify(stale),
            calculatedAt: new Date().toISOString()
        };
    }
};
