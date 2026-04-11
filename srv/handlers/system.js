'use strict';
const cds = require('@sap/cds');
const crypto = require('crypto');
const LOG = cds.log('nhvr-system');

const LITE_HIDDEN_FEATURES = ['defects','inspections','inspectionOrders','workOrders','permits','routeAssessment'];

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

    // ── Multi-tenant licensing ─────────────────────────────────
    // SECURITY FIX (F-S2-D7-001 P1): Removed x-tenant-code header fallback.
    // Tenant must come from XSUAA JWT custom attribute only — never from
    // a client-spoofable HTTP header. Default to NHVR_NATIONAL if not set.
    function _resolveTenantCode(req) {
        if (req.user?.attr?.tenantCode) return req.user.attr.tenantCode;
        return 'NHVR_NATIONAL';
    }

    function _resolveRole(req) {
        if (req.user.is('Admin'))         return 'ADMIN';
        if (req.user.is('BridgeManager')) return 'BRIDGE_MANAGER';
        return 'READ_ONLY';
    }

    srv.on('getCapabilityProfile', async (req) => {
        const db = await cds.connect.to('db');
        const tenantCode = _resolveTenantCode(req);
        const role = _resolveRole(req);
        const today = new Date().toISOString().slice(0, 10);
        let catalog;
        try {
            catalog = await db.run(
                SELECT.from('nhvr.FeatureCatalog')
                    .columns('capabilityCode','displayName','category','isCoreFeature','defaultEnabled','minRoleRequired')
                    .where({ isActive: true })
                    .orderBy('sortOrder')
            );
        } catch (e) {
            LOG.warn('FeatureCatalog not available:', e.message);
            const ALL_CAPS = ['BRIDGE_REGISTRY','RESTRICTIONS','MAP_VIEW','REPORTS','EXECUTIVE_DASHBOARD',
                'INSPECTIONS','DEFECTS','CAPACITY_RATINGS','MASS_UPLOAD','MASS_EDIT','ADMIN_CONFIG',
                'INTEGRATION_HUB','PERMITS','ROUTE_ASSESSMENT','FREIGHT_ROUTES','VEHICLE_COMBINATIONS',
                'BRIDGE_IQ','WORK_ORDERS','DATA_QUALITY'];
            return ALL_CAPS.map(c => ({ capabilityCode: c, displayName: c, category: 'CORE',
                isCoreFeature: true, isEnabled: true, canView: true, canEdit: true, canAdmin: true }));
        }
        // FeatureCatalog is empty — fail open (grant all access) so the app works
        // without needing CSV seed data. Admins can populate the catalog via BMS Admin.
        if (!catalog || !catalog.length) {
            const ALL_CAPS = ['BRIDGE_REGISTRY','RESTRICTIONS','MAP_VIEW','REPORTS','EXECUTIVE_DASHBOARD',
                'INSPECTIONS','DEFECTS','CAPACITY_RATINGS','MASS_UPLOAD','MASS_EDIT','ADMIN_CONFIG',
                'INTEGRATION_HUB','PERMITS','ROUTE_ASSESSMENT','FREIGHT_ROUTES','VEHICLE_COMBINATIONS',
                'BRIDGE_IQ','WORK_ORDERS','DATA_QUALITY'];
            return ALL_CAPS.map(c => ({ capabilityCode: c, displayName: c, category: 'CORE',
                isCoreFeature: true, isEnabled: true, canView: true, canEdit: true, canAdmin: true }));
        }
        const tenantRows = await db.run(
            SELECT.from('nhvr.TenantFeature').columns('capabilityCode','isEnabled','validFrom','validTo')
                .where({ 'tenant.tenantCode': tenantCode, 'tenant.isActive': true })
        ).catch(() => []);
        const tenantMap = {};
        (tenantRows || []).forEach(r => { tenantMap[r.capabilityCode] = r; });
        const grantRows = await db.run(
            SELECT.from('nhvr.TenantRoleCapability').columns('capabilityCode','canView','canEdit','canAdmin')
                .where({ role, 'tenant.tenantCode': tenantCode })
        ).catch(() => []);
        const grantMap = {};
        (grantRows || []).forEach(r => { grantMap[r.capabilityCode] = r; });
        const isAdminRole = (role === 'ADMIN');
        return catalog.map(feat => {
            const tf = tenantMap[feat.capabilityCode];
            const licensed = feat.isCoreFeature ? true : (tf ? !!tf.isEnabled : false);
            const withinDate = !tf || ((!tf.validFrom || tf.validFrom <= today) && (!tf.validTo || tf.validTo >= today));
            const isEnabled = licensed && withinDate;
            const grant = grantMap[feat.capabilityCode];
            return {
                capabilityCode: feat.capabilityCode, displayName: feat.displayName,
                category: feat.category, isCoreFeature: !!feat.isCoreFeature, isEnabled,
                canView:  isEnabled && (isAdminRole || !!(grant?.canView)),
                canEdit:  isEnabled && (isAdminRole || !!(grant?.canEdit)),
                canAdmin: isEnabled && (isAdminRole || !!(grant?.canAdmin))
            };
        });
    });

    srv.on('assignTenantCapabilities', async (req) => {
        const { tenantId, capabilities } = req.data;
        if (!tenantId || !capabilities || !capabilities.length)
            return req.error(400, 'tenantId and capabilities are required');
        const db = await cds.connect.to('db');

        // ── Feature dependency validation ──────────────────────────
        let catalog;
        try {
            catalog = await db.run(
                SELECT.from('nhvr.FeatureCatalog').columns('capabilityCode','isCoreFeature','dependsOn').where({ isActive: true })
            );
        } catch (e) {
            return req.error(500, 'Feature catalog not available: ' + e.message);
        }
        const catalogMap = {};
        catalog.forEach(c => { catalogMap[c.capabilityCode] = c; });

        // Build set of capabilities that will be enabled after this update
        const enabledSet = new Set();
        for (const cap of capabilities) {
            if (cap.isEnabled) enabledSet.add(cap.capabilityCode);
        }
        // Core features are always enabled
        catalog.filter(c => c.isCoreFeature).forEach(c => enabledSet.add(c.capabilityCode));

        // Validate dependencies
        for (const cap of capabilities) {
            if (!cap.isEnabled) continue;
            const def = catalogMap[cap.capabilityCode];
            if (def && def.dependsOn) {
                const deps = def.dependsOn.split(',').map(d => d.trim()).filter(Boolean);
                for (const dep of deps) {
                    if (!enabledSet.has(dep)) {
                        return req.reject(400,
                            `Cannot enable "${cap.capabilityCode}" — requires "${dep}" which is not enabled`);
                    }
                }
            }
        }

        let count = 0;
        const now = new Date().toISOString();
        for (const cap of capabilities) {
            const { capabilityCode, isEnabled, roleOverrides } = cap;
            const existing = await db.run(
                SELECT.from('nhvr.TenantFeature').columns('ID').where({ tenant_ID: tenantId, capabilityCode }).limit(1)
            );
            if (existing?.length) {
                await db.run(UPDATE('nhvr.TenantFeature').set({ isEnabled, modifiedAt: now }).where({ ID: existing[0].ID }));
            } else {
                await db.run(INSERT.into('nhvr.TenantFeature').entries({
                    tenant_ID: tenantId, capabilityCode, isEnabled, createdAt: now, modifiedAt: now
                }));
            }
            if (roleOverrides?.length) {
                for (const ro of roleOverrides) {
                    const eg = await db.run(
                        SELECT.from('nhvr.TenantRoleCapability').columns('ID')
                            .where({ tenant_ID: tenantId, capabilityCode, role: ro.role }).limit(1)
                    );
                    if (eg?.length) {
                        await db.run(UPDATE('nhvr.TenantRoleCapability').set({
                            canView: ro.canView, canEdit: ro.canEdit, canAdmin: ro.canAdmin, modifiedAt: now
                        }).where({ ID: eg[0].ID }));
                    } else {
                        await db.run(INSERT.into('nhvr.TenantRoleCapability').entries({
                            tenant_ID: tenantId, capabilityCode, role: ro.role,
                            canView: ro.canView, canEdit: ro.canEdit, canAdmin: ro.canAdmin,
                            createdAt: now, modifiedAt: now
                        }));
                    }
                    count++;
                }
            }
        }
        return { status: 'SUCCESS', count };
    });

    // Capability gate
    const ENTITY_CAPABILITY_MAP = {
        // INSPECTION group
        'InspectionOrders'        : 'INSPECTIONS',
        'MeasurementDocuments'    : 'INSPECTIONS',
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

        // WORK_ORDERS group
        'WorkOrders'              : 'WORK_ORDERS',

        // INTEGRATION group
        'IntegrationConfigs'      : 'INTEGRATION_HUB',
        'IntegrationLogs'         : 'INTEGRATION_HUB',
        'S4EquipmentMappings'     : 'INTEGRATION_HUB',

        // ANALYTICS group
        'BridgeDeteriorationProfiles' : 'BRIDGE_IQ',

        // REPORTS (admin scheduling only)
        'ReportSchedules'         : 'REPORTS',
    };

    async function _checkCapability(req, capabilityCode) {
        const tenantCode = _resolveTenantCode(req);
        const db = await cds.connect.to('db');
        const coreCheck = await db.run(
            SELECT.from('nhvr.FeatureCatalog').columns('isCoreFeature','defaultEnabled').where({ capabilityCode, isActive: true }).limit(1)
        ).catch(() => []);
        if (coreCheck?.length && coreCheck[0].isCoreFeature) return;
        // If FeatureCatalog is empty or doesn't exist, allow all
        if (!coreCheck?.length) return;
        // Check tenant has explicit feature config
        const tenantCheck = await db.run(
            SELECT.from('nhvr.Tenant').columns('ID').where({ tenantCode, isActive: true }).limit(1)
        ).catch(() => []);
        // No tenant configured → allow all (unconfigured environment)
        if (!tenantCheck?.length) return;
        const rows = await db.run(
            SELECT.from('nhvr.TenantFeature').columns('isEnabled')
                .where({ capabilityCode, tenant_ID: tenantCheck[0].ID }).limit(1)
        ).catch(() => []);
        if (rows?.length) {
            // Explicit config exists — respect it
            if (rows[0].isEnabled) return;
            return req.reject(403, `Capability '${capabilityCode}' is not licensed for your organisation.`);
        }
        // No TenantFeature row → fall back to catalog defaultEnabled
        if (coreCheck[0].defaultEnabled) return;
        return req.reject(403, `Capability '${capabilityCode}' is not licensed for your organisation.`);
    }

    Object.entries(ENTITY_CAPABILITY_MAP).forEach(([entityName, capCode]) => {
        srv.before(['READ','CREATE','UPDATE','DELETE'], entityName, (req) => _checkCapability(req, capCode));
    });
};
