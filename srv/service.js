// ============================================================
// NHVR Bridge Asset & Restriction Management
// CAP Service — thin orchestrator
// Domain logic lives in srv/handlers/
// ============================================================
'use strict';

const cds = require('@sap/cds');

module.exports = cds.service.impl(async function (srv) {
    // Common helpers shared across handler modules
    const h = require('./handlers/common')(srv);

    // Domain handler modules
    require('./handlers/system')(srv);
    require('./handlers/bridges')(srv, h);
    require('./handlers/restrictions')(srv, h);
    require('./handlers/attributes')(srv, h);
    require('./handlers/inspections')(srv, h);
    require('./handlers/upload')(srv, h);
    require('./handlers/reports')(srv, h);
    require('./handlers/geo')(srv, h);

    // Usage Analytics module (portable — works in any CAP app)
    require('./handlers/analytics-ingest')(srv, h);
    require('./handlers/analytics-report')(srv, h);
    require('./handlers/analytics-purge')(srv, h);

    // Data Quality (Phase C11)
    require('./handlers/data-quality')(srv, h);

    // Infrastructure — Routing Engine + Restriction Feeds (Phase D17/D18)
    require('./handlers/routing-engine')(srv, h);
    require('./handlers/restriction-feed')(srv, h);

    // Integration suite — S/4HANA, BANC, ESRI
    require('./integration/handlers')(srv);
});
