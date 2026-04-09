// ============================================================
// NHVR Bridge Asset & Restriction Management
// CAP Service — thin orchestrator
// Domain logic lives in srv/handlers/
// ============================================================
'use strict';

const cds = require('@sap/cds');

module.exports = cds.service.impl(async function (srv) {
    // Common helpers shared across handler modules
    const helpers = require('./handlers/common')(srv);

    // Domain handler modules
    require('./handlers/system')(srv);
    require('./handlers/bridges')(srv, helpers);
    require('./handlers/restrictions')(srv, helpers);
    require('./handlers/attributes')(srv, helpers);
    require('./handlers/inspections')(srv, helpers);
    require('./handlers/upload')(srv, helpers);
    require('./handlers/reports')(srv, helpers);
    require('./handlers/geo')(srv, helpers);

    // Usage Analytics module (portable — works in any CAP app)
    require('./handlers/analytics-ingest')(srv, helpers);
    require('./handlers/analytics-report')(srv, helpers);
    require('./handlers/analytics-purge')(srv, helpers);

    // Data Quality (Phase C11)
    require('./handlers/data-quality')(srv, helpers);

    // Infrastructure — Routing Engine + Restriction Feeds (Phase D17/D18)
    require('./handlers/routing-engine')(srv, helpers);
    require('./handlers/restriction-feed')(srv, helpers);

    // Integration suite — S/4HANA, BANC, ESRI
    require('./integration/handlers')(srv);
});
