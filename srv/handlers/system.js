'use strict';
const cds = require('@sap/cds');
const crypto = require('crypto');
const LOG = cds.log('nhvr-system');

const LITE_HIDDEN_FEATURES = ['defects','inspections','permits','routeAssessment'];

module.exports = function registerSystemHandlers(srv) {

    function getCorrelationId(req) {
        return (req.headers && (
            req.headers['x-correlation-id'] ||
            req.headers['x-request-id'] ||
            req.headers['x-vcap-request-id']
        )) || `nhvr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }

    srv.before('*', (req) => {
        req.correlationId = getCorrelationId(req);
        if (LOG.info) LOG.info(`[${req.correlationId}] ${req.method || 'CALL'} ${req.target?.name || req.event}`);
    });

    srv.on('error', (err, req) => {
        const correlationId = (req && req.correlationId) || getCorrelationId(req || {});
        LOG.error(`[${correlationId}] Unhandled service error on ${req?.event || 'unknown event'}:`, {
            message: err.message,
            code: err.code || err.statusCode,
            stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
        });
    });

    srv.on('READ', 'RestrictionTypeConfigs', async (req, next) => next());

    srv.on('me', req => {
        const knownRoles = ['Admin', 'BridgeManager', 'Viewer'];
        const roles = knownRoles.filter(r => req.user.is(r));
        const appMode = process.env.NHVR_APP_MODE || 'full';
        return { id: req.user.id, roles, appMode };
    });

    srv.on('getAppConfig', () => {
        const mode = process.env.NHVR_APP_MODE || 'full';
        return {
            mode,
            liteFeatures : mode === 'lite' ? JSON.stringify(LITE_HIDDEN_FEATURES) : '[]',
            version      : process.env.npm_package_version || '3.2.1'
        };
    });

    srv.on('getSystemInfo', async () => {
        const mode      = process.env.NHVR_APP_MODE || 'production';
        const isTraining = mode === 'demo' || mode === 'training';
        const labels    = { demo: 'Training / Demo', training: 'Training', production: 'Production' };
        const { version } = require('../../package.json');
        return { mode, label: labels[mode] || 'Production', version, isTraining };
    });

    srv.on('healthCheck', async () => {
        let dbStatus = 'HEALTHY';
        try {
            const db = await cds.connect.to('db');
            try { await db.run('SELECT 1 FROM DUMMY'); }
            catch { await db.run('SELECT 1'); }
        } catch (e) { dbStatus = 'DEGRADED: ' + e.message; }
        return {
            status:    dbStatus === 'HEALTHY' ? 'UP' : 'DEGRADED',
            timestamp: new Date().toISOString(),
            version:   require('../../package.json').version || '1.1.0',
            database:  dbStatus,
            uptime:    Math.floor(process.uptime())
        };
    });

    srv.on('health', async (req) => {
        const correlationId = req.correlationId || getCorrelationId(req);
        try {
            await cds.run('SELECT 1 FROM DUMMY').catch(() =>
                cds.run(SELECT.one.from('nhvr.Bridge').columns('ID').limit(1))
            );
            LOG.info(`[${correlationId}] Health check: OK`);
            return { status: 'UP', version: require('../../package.json').version,
                     db: 'CONNECTED', timestamp: new Date().toISOString() };
        } catch (err) {
            LOG.warn(`[${correlationId}] Health check DB ping failed:`, err.message);
            return { status: 'DEGRADED', version: require('../../package.json').version,
                     db: 'UNAVAILABLE', timestamp: new Date().toISOString() };
        }
    });

    // ── Map API Config ─────────────────────────────────────────
    srv.on('getMapApiConfig', async (req) => {
        const db = await cds.connect.to('db');
        let config = null;
        try {
            config = await db.run(SELECT.one.from('nhvr.MapProviderConfig').where({ isActive: true }));
        } catch (e) { LOG.debug('[getMapApiConfig] Could not read MapProviderConfig:', e.message); }
        // API keys from environment — never from DB
        return {
            provider: config ? config.mapProvider : 'osm-leaflet',
            geocodeProvider: config ? config.geocodeProvider : 'nominatim',
            routingProvider: config ? config.routingProvider : 'osrm',
            center: config ? [config.defaultCenter_lat, config.defaultCenter_lng] : [-25, 134],
            zoom: config ? config.defaultZoom : 4,
            clusterEnabled: config ? config.clusterEnabled : true,
            clusterRadius: config ? config.clusterRadius : 50,
            // Keys from environment only
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ? '***configured***' : '',
            esriApiKey: process.env.ESRI_API_KEY ? '***configured***' : ''
        };
    });

    // ── BridgeInspections: BHI computation ────────────────────
    function computeBHI({ deckRating, superstructureRating, substructureRating, bearingRating, jointRating }) {
        const w = { superstructure: 0.30, substructure: 0.28, deck: 0.20, bearing: 0.12, joint: 0.10 };
        const bhi = ((superstructureRating||3)*w.superstructure + (substructureRating||3)*w.substructure +
                     (deckRating||3)*w.deck + (bearingRating||3)*w.bearing + (jointRating||3)*w.joint) * 20;
        return Math.round(bhi * 10) / 10;
    }

    srv.before('CREATE', 'BridgeInspections', (req) => {
        const data = req.data;
        if (data.deckRating || data.superstructureRating) data.bridgeHealthIndex = computeBHI(data);
        if (data.defectSeverity === 'CRITICAL' || data.defectSeverity === 'SEVERE') {
            data.followUpRequired = true;
            data.followUpPriority = 'P1';
        }
    });

    srv.after('CREATE', 'BridgeInspections', async (result) => {
        if (result.bridge_ID && result.bridgeHealthIndex != null) {
            try {
                const db = await cds.connect.to('db');
                await db.run(UPDATE('nhvr.Bridge').set({
                    bridgeHealthIndex:     result.bridgeHealthIndex,
                    bhiCalculationDate:    new Date().toISOString(),
                    bhiCalculationVersion: 'v2.1'
                }).where({ ID: result.bridge_ID }));
            } catch (e) { LOG.debug('[BHI] Could not update parent bridge BHI:', e.message); }
        }
    });

    srv.after('READ', 'FreightRoutes', async (routes) => {
        const arr = Array.isArray(routes) ? routes : (routes ? [routes] : []);
        for (const route of arr) {
            if (!route || !route.ID) continue;
            try {
                const db = await cds.connect.to('db');
                const assignments = await db.run(
                    SELECT.from('nhvr.BridgeRouteAssignment').where({ route_ID: route.ID }).columns('bridge_ID')
                );
                if (!assignments.length) continue;
                const bridgeIDs = assignments.map(a => a.bridge_ID);
                const bridges = await db.run(
                    SELECT.from('nhvr.Bridge').where({ ID: { in: bridgeIDs } }).columns('bridgeHealthIndex')
                );
                const bhiValues = bridges.map(b => b.bridgeHealthIndex).filter(v => v != null && !isNaN(v));
                if (bhiValues.length) {
                    route.criticalBHI      = Math.min(...bhiValues);
                    route.totalBridgeCount = bhiValues.length;
                    route.riskLevel = route.criticalBHI >= 70 ? 'LOW' : route.criticalBHI >= 55 ? 'MEDIUM'
                                    : route.criticalBHI >= 40 ? 'HIGH' : 'CRITICAL';
                }
            } catch (e) { LOG.debug('[FreightRoutes] Risk calc error:', e.message); }
        }
    });

    // Capability gate removed — all feature groups are now always available.
    // InspectionOrders, MeasurementDocuments, WorkOrders entries removed in
    // cut-down BIS variant (entities no longer exist).
    const ENTITY_CAPABILITY_MAP = {
        // INSPECTION group
        'InspectionRecords'       : 'INSPECTIONS',
        'SensorDevices'           : 'INSPECTIONS',
        'SensorReadings'          : 'INSPECTIONS',
        'BridgeInspectionMetrics' : 'INSPECTIONS',

        // DEFECTS (sub-group of INSPECTION)
        'BridgeDefects'           : 'DEFECTS',
        'DefectClassifications'   : 'DEFECTS',

        // CAPACITY_RATINGS (sub-group of INSPECTION)
        'BridgeRiskAssessments'   : 'CAPACITY_RATINGS',
        'BridgeInvestmentPlans'   : 'CAPACITY_RATINGS',
        'BridgeCulvertAssessments': 'CAPACITY_RATINGS',
        'LoadRatingCertificates'  : 'CAPACITY_RATINGS',

        // PERMITS group
        'VehiclePermits'          : 'PERMITS',
        'ApprovedRoutes'          : 'PERMITS',
        'RouteBridges'            : 'PERMITS',

        // ROUTE_ASSESSMENT group
        'ScourAssessments'        : 'ROUTE_ASSESSMENT',

        // FREIGHT_ROUTES group
        'FreightRoutes'           : 'FREIGHT_ROUTES',
        'FreightRouteBridges'     : 'FREIGHT_ROUTES',
        'BridgeRouteAssignments'  : 'FREIGHT_ROUTES',
        'GazetteNotices'          : 'FREIGHT_ROUTES',

        // VEHICLE_COMBINATIONS group
        'VehicleTypes'            : 'VEHICLE_COMBINATIONS',

        // INTEGRATION group
        'IntegrationConfigs'      : 'INTEGRATION_HUB',
        'IntegrationLogs'         : 'INTEGRATION_HUB',
        'S4EquipmentMappings'     : 'INTEGRATION_HUB',

        // ANALYTICS group
        'BridgeDeteriorationProfiles' : 'BRIDGE_IQ',

        // REPORTS (admin scheduling only)
        'ReportSchedules'         : 'REPORTS',
    };

    Object.entries(ENTITY_CAPABILITY_MAP).forEach(() => {});
};
