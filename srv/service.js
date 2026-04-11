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

    function registerHandlers(handlerPaths, sharedHelpers) {
        handlerPaths.forEach(function (handlerPath) {
            require(handlerPath)(srv, sharedHelpers);
        });
    }

    registerHandlers([
        './handlers/bridges',
        './handlers/restrictions',
        './handlers/attributes',
        './handlers/inspections',
        './handlers/upload',
        './handlers/reports',
        './handlers/geo',
        './handlers/analytics-ingest',
        './handlers/analytics-report',
        './handlers/analytics-purge',
        './handlers/data-quality',
        './handlers/routing-engine',
        './handlers/restriction-feed'
    ], helpers);

    // System and integration handlers use their own internal dependency wiring.
    require('./handlers/system')(srv);
    require('./integration/handlers')(srv);
});
