'use strict';

// ============================================================
// Feature Isolation Integration Tests
// Verifies that disabling a capability in TenantFeature actually
// blocks entity access (403) while core entities remain open.
// ============================================================

const cds = require('@sap/cds');
cds.test(__dirname + '/..');

const PRIV = { user: new cds.User.Privileged() };

// Tenant and feature IDs from seed data (nhvr-Tenant.csv / nhvr-TenantFeature.csv)
const NHVR_TENANT_ID   = 't-nhvr-national';
const NSW_TENANT_ID     = 't-nsw-rms';

let srv, db;

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    db  = await cds.connect.to('db');
}, 30000);

// ── Helpers ────────────────────────────────────────────────────

/** Disable a capability for a tenant via direct DB update */
async function disableCapability(tenantId, capabilityCode) {
    await db.run(
        UPDATE('nhvr.TenantFeature')
            .set({ isEnabled: false })
            .where({ capabilityCode, tenant_ID: tenantId })
    );
}

/** Re-enable a capability for a tenant */
async function enableCapability(tenantId, capabilityCode) {
    await db.run(
        UPDATE('nhvr.TenantFeature')
            .set({ isEnabled: true })
            .where({ capabilityCode, tenant_ID: tenantId })
    );
}

/** Attempt a READ on a service entity and return { ok, status, data, error } */
async function tryRead(entityName) {
    try {
        const data = await srv.tx(PRIV, async (tx) => {
            return tx.run(SELECT.from(`BridgeManagementService.${entityName}`).limit(1));
        });
        return { ok: true, status: 200, data };
    } catch (e) {
        return { ok: false, status: e.code || e.statusCode || 500, error: e.message };
    }
}

// ================================================================
// 1. Capability gate enforcement
//    Disable INSPECTIONS for NHVR_NATIONAL, verify gated entities
//    return 403.
// ================================================================
describe('Capability gate enforcement', () => {

    afterEach(async () => {
        // Always restore INSPECTIONS for the national tenant
        await enableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        await enableCapability(NHVR_TENANT_ID, 'DEFECTS');
        await enableCapability(NHVR_TENANT_ID, 'PERMITS');
        await enableCapability(NHVR_TENANT_ID, 'WORK_ORDERS');
        await enableCapability(NHVR_TENANT_ID, 'FREIGHT_ROUTES');
        await enableCapability(NHVR_TENANT_ID, 'INTEGRATION_HUB');
    });

    test('Disabling INSPECTIONS blocks InspectionOrders access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        const result = await tryRead('InspectionOrders');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('INSPECTIONS');
    });

    test('Disabling INSPECTIONS blocks InspectionRecords access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        const result = await tryRead('InspectionRecords');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
    });

    test('Disabling DEFECTS blocks BridgeDefects access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'DEFECTS');
        const result = await tryRead('BridgeDefects');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('DEFECTS');
    });

    test('Disabling PERMITS blocks VehiclePermits access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'PERMITS');
        const result = await tryRead('VehiclePermits');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('PERMITS');
    });

    test('Disabling WORK_ORDERS blocks WorkOrders access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'WORK_ORDERS');
        const result = await tryRead('WorkOrders');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('WORK_ORDERS');
    });

    test('Disabling FREIGHT_ROUTES blocks FreightRoutes access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'FREIGHT_ROUTES');
        const result = await tryRead('FreightRoutes');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('FREIGHT_ROUTES');
    });

    test('Disabling INTEGRATION_HUB blocks IntegrationConfigs access', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INTEGRATION_HUB');
        const result = await tryRead('IntegrationConfigs');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('INTEGRATION_HUB');
    });

    test('Re-enabling a capability restores access', async () => {
        // Disable then re-enable INSPECTIONS
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        const blocked = await tryRead('InspectionOrders');
        expect(blocked.ok).toBe(false);
        expect(blocked.status).toBe(403);

        await enableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        const restored = await tryRead('InspectionOrders');
        expect(restored.ok).toBe(true);
    });
});

// ================================================================
// 2. Core entity bypass
//    Core entities (Bridges, Restrictions, Routes) must ALWAYS be
//    accessible regardless of any TenantFeature toggle.
// ================================================================
describe('Core entity bypass — always accessible', () => {

    afterAll(async () => {
        // Restore everything just in case
        await enableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        await enableCapability(NHVR_TENANT_ID, 'DEFECTS');
    });

    test('Bridges readable even when INSPECTIONS is disabled', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        const result = await tryRead('Bridges');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
    });

    test('Restrictions readable even when DEFECTS is disabled', async () => {
        await disableCapability(NHVR_TENANT_ID, 'DEFECTS');
        const result = await tryRead('Restrictions');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
    });

    test('Routes readable even when multiple features are disabled', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        await disableCapability(NHVR_TENANT_ID, 'DEFECTS');
        const result = await tryRead('Routes');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
    });

    test('VehicleClasses readable regardless of feature state', async () => {
        // VehicleClasses is not in ENTITY_CAPABILITY_MAP — should always work
        const result = await tryRead('VehicleClasses');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.data)).toBe(true);
    });
});

// ================================================================
// 3. Dependency validation via assignTenantCapabilities action
//    Trying to enable DEFECTS without INSPECTIONS must be rejected.
// ================================================================
describe('Feature dependency validation via assignTenantCapabilities', () => {

    test('Enabling DEFECTS without INSPECTIONS is rejected', async () => {
        try {
            await srv.tx(PRIV, async (tx) => {
                return tx.send({
                    event: 'assignTenantCapabilities',
                    data: {
                        tenantId: NHVR_TENANT_ID,
                        capabilities: [
                            { capabilityCode: 'INSPECTIONS', isEnabled: false },
                            { capabilityCode: 'DEFECTS',     isEnabled: true  }
                        ]
                    }
                });
            });
            // Should not reach here
            expect('should have thrown').toBe('but did not');
        } catch (e) {
            expect(e.message || e.toString()).toMatch(/requires.*INSPECTIONS|INSPECTIONS.*not enabled/i);
        }
    });

    test('Enabling CAPACITY_RATINGS without INSPECTIONS is rejected', async () => {
        try {
            await srv.tx(PRIV, async (tx) => {
                return tx.send({
                    event: 'assignTenantCapabilities',
                    data: {
                        tenantId: NHVR_TENANT_ID,
                        capabilities: [
                            { capabilityCode: 'INSPECTIONS',     isEnabled: false },
                            { capabilityCode: 'CAPACITY_RATINGS', isEnabled: true  }
                        ]
                    }
                });
            });
            expect('should have thrown').toBe('but did not');
        } catch (e) {
            expect(e.message || e.toString()).toMatch(/requires.*INSPECTIONS|INSPECTIONS.*not enabled/i);
        }
    });

    test('Enabling BRIDGE_IQ without INSPECTIONS is rejected', async () => {
        try {
            await srv.tx(PRIV, async (tx) => {
                return tx.send({
                    event: 'assignTenantCapabilities',
                    data: {
                        tenantId: NHVR_TENANT_ID,
                        capabilities: [
                            { capabilityCode: 'INSPECTIONS', isEnabled: false },
                            { capabilityCode: 'BRIDGE_IQ',   isEnabled: true  }
                        ]
                    }
                });
            });
            expect('should have thrown').toBe('but did not');
        } catch (e) {
            expect(e.message || e.toString()).toMatch(/requires.*INSPECTIONS|INSPECTIONS.*not enabled/i);
        }
    });

    test('Enabling DEFECTS with INSPECTIONS also enabled succeeds', async () => {
        const result = await srv.tx(PRIV, async (tx) => {
            return tx.send({
                event: 'assignTenantCapabilities',
                data: {
                    tenantId: NHVR_TENANT_ID,
                    capabilities: [
                        { capabilityCode: 'INSPECTIONS', isEnabled: true },
                        { capabilityCode: 'DEFECTS',     isEnabled: true }
                    ]
                }
            });
        });
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        expect(parsed.status).toBe('SUCCESS');
    });
});

// ================================================================
// 4. Cascade behavior
//    Disabling INSPECTIONS must also block BRIDGE_IQ entities
//    (BridgeDeteriorationProfiles) because BRIDGE_IQ depends on
//    INSPECTIONS. Note: the gate checks each entity's OWN
//    capability code, so we test that both INSPECTIONS-gated and
//    BRIDGE_IQ-gated entities are blocked when their respective
//    capabilities are disabled.
// ================================================================
describe('Cascade behavior — disabling upstream blocks downstream entities', () => {

    afterEach(async () => {
        await enableCapability(NHVR_TENANT_ID, 'INSPECTIONS');
        await enableCapability(NHVR_TENANT_ID, 'BRIDGE_IQ');
        await enableCapability(NHVR_TENANT_ID, 'DEFECTS');
        await enableCapability(NHVR_TENANT_ID, 'CAPACITY_RATINGS');
    });

    test('Disabling BRIDGE_IQ blocks BridgeDeteriorationProfiles', async () => {
        await disableCapability(NHVR_TENANT_ID, 'BRIDGE_IQ');
        const result = await tryRead('BridgeDeteriorationProfiles');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('BRIDGE_IQ');
    });

    test('Disabling INSPECTIONS blocks all INSPECTION-gated entities simultaneously', async () => {
        await disableCapability(NHVR_TENANT_ID, 'INSPECTIONS');

        const inspOrders = await tryRead('InspectionOrders');
        expect(inspOrders.ok).toBe(false);
        expect(inspOrders.status).toBe(403);

        const inspRecords = await tryRead('InspectionRecords');
        expect(inspRecords.ok).toBe(false);
        expect(inspRecords.status).toBe(403);

        const sensors = await tryRead('SensorDevices');
        expect(sensors.ok).toBe(false);
        expect(sensors.status).toBe(403);
    });

    test('Disabling CAPACITY_RATINGS blocks BridgeRiskAssessments', async () => {
        await disableCapability(NHVR_TENANT_ID, 'CAPACITY_RATINGS');
        const result = await tryRead('BridgeRiskAssessments');
        expect(result.ok).toBe(false);
        expect(result.status).toBe(403);
        expect(result.error).toContain('CAPACITY_RATINGS');
    });

    test('Disabling DEFECTS blocks DefectClassifications but not InspectionOrders', async () => {
        await disableCapability(NHVR_TENANT_ID, 'DEFECTS');

        const defectClass = await tryRead('DefectClassifications');
        expect(defectClass.ok).toBe(false);
        expect(defectClass.status).toBe(403);

        // INSPECTIONS is still enabled, so InspectionOrders should work
        const inspOrders = await tryRead('InspectionOrders');
        expect(inspOrders.ok).toBe(true);
    });
});

// ================================================================
// 5. NSW tenant pre-existing restrictions
//    NSW_RMS has FREIGHT_ROUTES and INTEGRATION_HUB disabled in
//    seed data. Verify those entities are blocked for NSW context.
// ================================================================
describe('Pre-seeded tenant restrictions (NSW_RMS)', () => {

    test('NSW tenant has FREIGHT_ROUTES disabled in seed data', async () => {
        const row = await db.run(
            SELECT.one.from('nhvr.TenantFeature')
                .where({ tenant_ID: NSW_TENANT_ID, capabilityCode: 'FREIGHT_ROUTES' })
        );
        expect(row).toBeDefined();
        expect(row.isEnabled).toBeFalsy();
    });

    test('NSW tenant has INTEGRATION_HUB disabled in seed data', async () => {
        const row = await db.run(
            SELECT.one.from('nhvr.TenantFeature')
                .where({ tenant_ID: NSW_TENANT_ID, capabilityCode: 'INTEGRATION_HUB' })
        );
        expect(row).toBeDefined();
        expect(row.isEnabled).toBeFalsy();
    });

    test('NSW tenant has BRIDGE_IQ disabled in seed data', async () => {
        const row = await db.run(
            SELECT.one.from('nhvr.TenantFeature')
                .where({ tenant_ID: NSW_TENANT_ID, capabilityCode: 'BRIDGE_IQ' })
        );
        expect(row).toBeDefined();
        expect(row.isEnabled).toBeFalsy();
    });

    test('NSW tenant still has core features enabled', async () => {
        const bridge = await db.run(
            SELECT.one.from('nhvr.TenantFeature')
                .where({ tenant_ID: NSW_TENANT_ID, capabilityCode: 'BRIDGE_REGISTRY' })
        );
        expect(bridge).toBeDefined();
        expect(bridge.isEnabled).toBeTruthy();

        const restr = await db.run(
            SELECT.one.from('nhvr.TenantFeature')
                .where({ tenant_ID: NSW_TENANT_ID, capabilityCode: 'RESTRICTIONS' })
        );
        expect(restr).toBeDefined();
        expect(restr.isEnabled).toBeTruthy();
    });
});
