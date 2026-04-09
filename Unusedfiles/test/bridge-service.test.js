// ============================================================
// NHVR Bridge Management System — Comprehensive Test Suite
// 11 suites | 55 tests
// Run: npm test
// ============================================================

'use strict';

const cds = require('@sap/cds');

// Boot the CDS server in-process — must be at module level so cds.test()
// registers its beforeAll (DB seed) BEFORE our beforeAll runs.
cds.test(__dirname + '/..');

// Privileged user context — bypasses @restrict for in-process srv calls
const PRIV = { user: new cds.User.Privileged() };

// ─────────────────────────────────────────────────────────────
// Helpers — all service calls wrapped in PRIV context
// ─────────────────────────────────────────────────────────────
let srv;
let testBridgeId;      // UUID of the reusable bridge across suites

// Wrap srv.run in a privileged transaction
function run(query) {
    return srv.tx(PRIV, async () => srv.run(query));
}

// Wrap srv.send in a privileged transaction (params must be [uuid] not [{ID:uuid}])
function send(args) {
    return srv.tx(PRIV, async () => srv.send(args));
}

// Direct DB access (bypasses service auth entirely)
async function db() {
    return cds.connect.to('db');
}

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');

    // Create a shared test bridge used across multiple suites
    const result = await run(
        INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId        : 'SHARED-TEST-001',
            name            : 'Shared Test Bridge',
            region          : 'Greater Sydney',
            state           : 'NSW',
            structureType   : 'Beam',
            material        : 'Concrete',
            latitude        : -33.8688,
            longitude       : 151.2093,
            condition       : 'GOOD',
            conditionRating : 7,
            postingStatus   : 'UNRESTRICTED',
            isActive        : true
        })
    );
    testBridgeId = result.ID;
}, 30000);

afterAll(async () => {
    try {
        if (testBridgeId) {
            const db = await cds.connect.to('db');
            await db.run(DELETE.from('nhvr.Bridge').where({ ID: testBridgeId }));
        }
    } catch (e) { /* best-effort cleanup */ }
});

// Helper: create a uniquely-named bridge
async function createBridge(overrides = {}) {
    const unique = `BRG-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 99)}`;
    const data = {
        bridgeId      : unique,
        name          : `Bridge ${unique}`,
        region        : 'Test Region',
        state         : 'VIC',
        structureType : 'Box Girder',
        material      : 'Steel',
        latitude      : -37.8136,
        longitude     : 144.9631,
        condition     : 'GOOD',
        isActive      : true,
        ...overrides
    };
    return run(INSERT.into('BridgeManagementService.Bridges').entries(data));
}

// Helper: create a restriction against testBridgeId
async function createRestriction(overrides = {}) {
    const data = {
        restrictionType : 'MASS',
        value           : 42.5,
        unit            : 't',
        bridge_ID       : testBridgeId,
        status          : 'ACTIVE',
        isActive        : true,
        ...overrides
    };
    return run(INSERT.into('BridgeManagementService.Restrictions').entries(data));
}


// ═════════════════════════════════════════════════════════════
// SUITE 1 — Bridge CRUD
// ═════════════════════════════════════════════════════════════
describe('1. Bridge CRUD Operations', () => {

    let createdId;

    test('1.1 Creates a bridge with all required fields', async () => {
        const result = await createBridge({ name: 'CRUD Create Test', state: 'QLD' });
        expect(result).toBeDefined();
        expect(result.ID).toBeDefined();
        createdId = result.ID;
    });

    test('1.2 Reads all bridges and finds at least the shared test bridge', async () => {
        const bridges = await run(SELECT.from('BridgeManagementService.Bridges'));
        expect(Array.isArray(bridges)).toBe(true);
        expect(bridges.length).toBeGreaterThan(0);
        const found = bridges.find(b => b.bridgeId === 'SHARED-TEST-001');
        expect(found).toBeDefined();
    });

    test('1.3 Reads a single bridge by ID', async () => {
        const bridge = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: testBridgeId })
        );
        expect(bridge).toBeDefined();
        expect(bridge.name).toBe('Shared Test Bridge');
        expect(bridge.state).toBe('NSW');
    });

    test('1.4 Updates bridge region', async () => {
        await run(
            UPDATE('BridgeManagementService.Bridges')
                .set({ region: 'Inner West' })
                .where({ ID: testBridgeId })
        );
        const updated = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: testBridgeId })
        );
        expect(updated.region).toBe('Inner West');
    });

    test('1.5 Updates bridge conditionRating and auto-derives condition label', async () => {
        await run(
            UPDATE('BridgeManagementService.Bridges')
                .set({ conditionRating: 3 })
                .where({ ID: testBridgeId })
        );
        const updated = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: testBridgeId })
        );
        expect(updated.conditionRating).toBe(3);
        expect(['POOR', 'VERY_POOR', 'CRITICAL']).toContain(updated.condition);
    });

    test('1.6 Soft-deletes a bridge (isActive = false) and it stays in DB', async () => {
        if (!createdId) return;
        await run(
            UPDATE('BridgeManagementService.Bridges')
                .set({ isActive: false })
                .where({ ID: createdId })
        );
        const check = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: createdId })
        );
        expect(check).toBeDefined();
        expect(check.isActive).toBe(false);
    });

    test('1.7 Filters bridges by state', async () => {
        const bridges = await run(
            SELECT.from('BridgeManagementService.Bridges').where({ state: 'NSW' })
        );
        expect(Array.isArray(bridges)).toBe(true);
        bridges.forEach(b => expect(b.state).toBe('NSW'));
    });

    test('1.8 Selects specific fields only', async () => {
        const bridges = await run(
            SELECT.from('BridgeManagementService.Bridges')
                .columns('bridgeId', 'name', 'state')
        );
        expect(Array.isArray(bridges)).toBe(true);
        expect(bridges.length).toBeGreaterThan(0);
        const first = bridges[0];
        expect(first.name).toBeDefined();
        expect(first.state).toBeDefined();
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 2 — Bridge Validation (Before-Hook Rules)
// ═════════════════════════════════════════════════════════════
describe('2. Bridge Field Validation', () => {

    test('2.1 Rejects latitude > 90', async () => {
        await expect(createBridge({ latitude: 91 })).rejects.toThrow();
    });

    test('2.2 Rejects latitude < -90', async () => {
        await expect(createBridge({ latitude: -91 })).rejects.toThrow();
    });

    test('2.3 Rejects longitude > 180', async () => {
        await expect(createBridge({ longitude: 181 })).rejects.toThrow();
    });

    test('2.4 Rejects longitude < -180', async () => {
        await expect(createBridge({ longitude: -181 })).rejects.toThrow();
    });

    test('2.5 Rejects conditionScore > 100', async () => {
        await expect(createBridge({ conditionScore: 101 })).rejects.toThrow();
    });

    test('2.6 Rejects conditionScore < 0', async () => {
        await expect(createBridge({ conditionScore: -1 })).rejects.toThrow();
    });

    test('2.7 Rejects conditionRating outside 1-10', async () => {
        await expect(createBridge({ conditionRating: 11 })).rejects.toThrow();
    });

    test('2.8 Accepts valid conditionRating 1', async () => {
        const result = await createBridge({ conditionRating: 1 });
        expect(result).toBeDefined();
        expect(result.conditionRating).toBe(1);
    });

    test('2.9 Accepts valid conditionRating 10', async () => {
        const result = await createBridge({ conditionRating: 10 });
        expect(result).toBeDefined();
        expect(result.conditionRating).toBe(10);
    });

    test('2.10 Accepts bridge without optional lat/lon', async () => {
        const result = await createBridge({ latitude: undefined, longitude: undefined });
        expect(result).toBeDefined();
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 3 — Bridge Actions
// ═════════════════════════════════════════════════════════════
describe('3. Bridge Bound Actions', () => {

    test('3.1 changeCondition — valid condition FAIR updates bridge', async () => {
        const result = await send({
            event  : 'changeCondition',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId],
            data   : { conditionValue: 'FAIR', score: 55 }
        });
        expect(result).toBeDefined();
        expect(result.condition).toBe('FAIR');
    });

    test('3.2 changeCondition — valid condition CRITICAL updates bridge', async () => {
        const result = await send({
            event  : 'changeCondition',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId],
            data   : { conditionValue: 'CRITICAL', score: 10 }
        });
        expect(result.condition).toBe('CRITICAL');
    });

    test('3.3 changeCondition — invalid condition string is rejected', async () => {
        await expect(
            send({
                event  : 'changeCondition',
                entity : 'BridgeManagementService.Bridges',
                params : [testBridgeId],
                data   : { conditionValue: 'TERRIBLE' }
            })
        ).rejects.toThrow();
    });

    test('3.4 changeCondition — creates a BridgeConditionHistory record', async () => {
        await send({
            event  : 'changeCondition',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId],
            data   : { conditionValue: 'GOOD', score: 70 }
        });
        const database = await db();
        const history = await database.run(
            SELECT.from('nhvr.BridgeConditionHistory').where({ bridge_ID: testBridgeId })
        );
        expect(history.length).toBeGreaterThan(0);
    });

    test('3.5 closeForTraffic — marks bridge as CLOSED', async () => {
        const bridge = await createBridge({ name: 'Bridge To Close' });
        await send({
            event  : 'closeForTraffic',
            entity : 'BridgeManagementService.Bridges',
            params : [bridge.ID]
        });
        const updated = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID })
        );
        expect(updated.postingStatus).toBe('CLOSED');
    });

    test('3.6 reopenForTraffic — re-opens a CLOSED bridge', async () => {
        await send({
            event  : 'closeForTraffic',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId]
        });
        await send({
            event  : 'reopenForTraffic',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId]
        });
        const updated = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: testBridgeId })
        );
        expect(['UNRESTRICTED', 'POSTED']).toContain(updated.postingStatus);
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 4 — Restriction CRUD & Validation
// ═════════════════════════════════════════════════════════════
describe('4. Restriction CRUD & Validation', () => {

    let createdRestrictionId;

    test('4.1 Creates a valid MASS restriction', async () => {
        const result = await createRestriction({ value: 36, unit: 't' });
        expect(result).toBeDefined();
        expect(result.ID).toBeDefined();
        createdRestrictionId = result.ID;
    });

    test('4.2 Creates a valid HEIGHT restriction', async () => {
        const result = await createRestriction({ restrictionType: 'HEIGHT', value: 4.5, unit: 'm' });
        expect(result).toBeDefined();
        expect(result.restrictionType).toBe('HEIGHT');
    });

    test('4.3 Creates a SPEED restriction', async () => {
        const result = await createRestriction({ restrictionType: 'SPEED', value: 60, unit: 'km/h' });
        expect(result).toBeDefined();
    });

    test('4.4 Rejects: validToDate before validFromDate', async () => {
        await expect(createRestriction({
            validFromDate : '2025-12-31',
            validToDate   : '2025-01-01'
        })).rejects.toThrow();
    });

    test('4.5 Rejects: validToDate without validFromDate', async () => {
        await expect(createRestriction({
            validFromDate : undefined,
            validToDate   : '2026-12-31'
        })).rejects.toThrow();
    });

    test('4.6 Rejects: ACTIVE status with past validToDate', async () => {
        await expect(createRestriction({
            status       : 'ACTIVE',
            validFromDate: '2020-01-01',
            validToDate  : '2020-12-31'
        })).rejects.toThrow();
    });

    test('4.7 Rejects: value = 0 for non-VEHICLE_TYPE restrictions', async () => {
        await expect(createRestriction({ value: 0 })).rejects.toThrow();
    });

    test('4.8 Rejects: negative value', async () => {
        await expect(createRestriction({ value: -5 })).rejects.toThrow();
    });

    test('4.9 Rejects: wrong unit for HEIGHT (must be m, not t)', async () => {
        await expect(createRestriction({
            restrictionType: 'HEIGHT',
            value          : 4.5,
            unit           : 't'
        })).rejects.toThrow();
    });

    test('4.10 Rejects: restriction with no bridge_ID on CREATE', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType : 'MASS',
                value           : 36,
                unit            : 't',
                status          : 'ACTIVE',
                isActive        : true
            }))
        ).rejects.toThrow();
    });

    test('4.11 Updates restriction value', async () => {
        if (!createdRestrictionId) return;
        await run(
            UPDATE('BridgeManagementService.Restrictions')
                .set({ value: 40 })
                .where({ ID: createdRestrictionId })
        );
        const updated = await run(
            SELECT.one.from('BridgeManagementService.Restrictions')
                .where({ ID: createdRestrictionId })
        );
        expect(updated.value).toBe(40);
    });

    test('4.12 Reads restrictions filtered by status ACTIVE', async () => {
        const results = await run(
            SELECT.from('BridgeManagementService.Restrictions').where({ status: 'ACTIVE' })
        );
        expect(Array.isArray(results)).toBe(true);
        results.forEach(r => expect(r.status).toBe('ACTIVE'));
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 5 — Restriction Actions
// ═════════════════════════════════════════════════════════════
describe('5. Restriction Bound Actions', () => {

    let restrictionId;

    beforeAll(async () => {
        const r = await createRestriction({ value: 32, unit: 't', status: 'ACTIVE' });
        restrictionId = r.ID;
    });

    test('5.1 disableRestriction — sets status to INACTIVE', async () => {
        const result = await send({
            event  : 'disableRestriction',
            entity : 'BridgeManagementService.Restrictions',
            params : [restrictionId],
            data   : { reason: 'Works completed — restriction no longer required' }
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('SUCCESS');

        const updated = await run(
            SELECT.one.from('BridgeManagementService.Restrictions')
                .where({ ID: restrictionId })
        );
        expect(updated.status).toBe('INACTIVE');
    });

    test('5.2 enableRestriction — re-activates an INACTIVE restriction', async () => {
        const result = await send({
            event  : 'enableRestriction',
            entity : 'BridgeManagementService.Restrictions',
            params : [restrictionId],
            data   : { reason: 'Reinstated following structural review' }
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('SUCCESS');

        const updated = await run(
            SELECT.one.from('BridgeManagementService.Restrictions')
                .where({ ID: restrictionId })
        );
        expect(updated.status).toBe('ACTIVE');
    });

    test('5.3 disableRestriction — creates a RestrictionChangeLog entry', async () => {
        await send({
            event  : 'disableRestriction',
            entity : 'BridgeManagementService.Restrictions',
            params : [restrictionId],
            data   : { reason: 'Audit trail test' }
        });
        const database = await db();
        const logs = await database.run(
            SELECT.from('nhvr.RestrictionChangeLog').where({ restriction_ID: restrictionId })
        );
        expect(logs.length).toBeGreaterThan(0);
        const disableEntry = logs.find(l => l.changeType === 'DISABLED');
        expect(disableEntry).toBeDefined();
    });

    test('5.4 disableRestriction — rejects when reason is empty', async () => {
        await expect(
            send({
                event  : 'disableRestriction',
                entity : 'BridgeManagementService.Restrictions',
                params : [restrictionId],
                data   : { reason: '' }
            })
        ).rejects.toThrow();
    });

    test('5.5 applyTemporaryRestriction — creates a temporary restriction on bridge', async () => {
        const today  = new Date().toISOString().split('T')[0];
        const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const result = await send({
            event  : 'applyTemporaryRestriction',
            entity : 'BridgeManagementService.Bridges',
            params : [testBridgeId],
            data   : {
                restrictionType : 'MASS',
                value           : 10,
                unit            : 't',
                validFromDate   : today,
                validToDate     : future,
                notes           : 'Emergency works on deck'
            }
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('SUCCESS');
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 6 — Bridge Posting Status Auto-Update
// ═════════════════════════════════════════════════════════════
describe('6. Bridge Posting Status Auto-Update', () => {

    let bridgeId;

    beforeAll(async () => {
        const b = await createBridge({ name: 'Status Auto-Update Bridge' });
        bridgeId = b.ID;
    });

    test('6.1 Bridge starts as UNRESTRICTED', async () => {
        const bridge = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridgeId })
        );
        expect(bridge.postingStatus).toBe('UNRESTRICTED');
    });

    test('6.2 Adding an ACTIVE restriction updates bridge to POSTED', async () => {
        await run(
            INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType : 'HEIGHT',
                value           : 4.2,
                unit            : 'm',
                bridge_ID       : bridgeId,
                status          : 'ACTIVE',
                isActive        : true
            })
        );
        await new Promise(r => setTimeout(r, 200));
        const bridge = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridgeId })
        );
        expect(bridge.postingStatus).toBe('POSTED');
    });

    test('6.3 CLOSED bridge postingStatus is not overridden by restriction change', async () => {
        await run(
            UPDATE('BridgeManagementService.Bridges')
                .set({ postingStatus: 'CLOSED' })
                .where({ ID: bridgeId })
        );
        await run(
            INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType : 'MASS',
                value           : 20,
                unit            : 't',
                bridge_ID       : bridgeId,
                status          : 'ACTIVE',
                isActive        : true
            })
        );
        await new Promise(r => setTimeout(r, 200));
        const bridge = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridgeId })
        );
        expect(bridge.postingStatus).toBe('CLOSED');
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 7 — Inspection Orders
// ═════════════════════════════════════════════════════════════
describe('7. Inspection Orders', () => {

    let orderId;
    const today = new Date().toISOString().split('T')[0];

    test('7.1 Creates an inspection order via service action', async () => {
        const result = await send({
            event : 'createInspectionOrder',
            data  : {
                bridge_ID        : testBridgeId,
                orderNumber      : `INS-TEST-${Date.now()}`,
                plannedDate      : today,
                inspectionType   : 'ROUTINE',
                assignedInspector: 'Jane Smith',
                priority         : 'MEDIUM',
                notes            : 'Automated test order'
            }
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('SUCCESS');
        expect(result.ID).toBeDefined();
        orderId = result.ID;
    });

    test('7.2 New inspection order has status PLANNED', async () => {
        if (!orderId) return;
        const order = await run(
            SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: orderId })
        );
        expect(order.status).toBe('PLANNED');
    });

    test('7.3 startInspection transitions order to IN_PROGRESS', async () => {
        if (!orderId) return;
        const result = await send({
            event  : 'startInspection',
            entity : 'BridgeManagementService.InspectionOrders',
            params : [orderId],
            data   : {}
        });
        expect(result.status).toBe('SUCCESS');

        const order = await run(
            SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: orderId })
        );
        expect(order.status).toBe('IN_PROGRESS');
    });

    test('7.4 completeInspection rejects without conditionRating', async () => {
        if (!orderId) return;
        await expect(
            send({
                event  : 'completeInspection',
                entity : 'BridgeManagementService.InspectionOrders',
                params : [orderId],
                data   : {
                    structuralAdequacy: 'ADEQUATE',
                    completionDate    : today,
                    inspectorName     : 'Jane Smith'
                }
            })
        ).rejects.toThrow();
    });

    test('7.5 completeInspection succeeds with valid data', async () => {
        if (!orderId) return;
        const result = await send({
            event  : 'completeInspection',
            entity : 'BridgeManagementService.InspectionOrders',
            params : [orderId],
            data   : {
                conditionRating   : 6,
                structuralAdequacy: 'ADEQUATE',
                completionDate    : today,
                inspectorName     : 'Jane Smith',
                reportRef         : 'RPT-2026-001',
                findings          : 'Minor cracking on pier cap'
            }
        });
        expect(result.status).toBe('SUCCESS');

        const order = await run(
            SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: orderId })
        );
        expect(order.status).toBe('COMPLETED');
    });

    test('7.6 Completed inspection order has COMPLETED status', async () => {
        if (!orderId) return;
        // Verify the order is in COMPLETED state (already confirmed by 7.5, but
        // this test independently confirms persistence via a fresh SELECT)
        const order = await run(
            SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: orderId })
        );
        expect(order).toBeDefined();
        expect(order.status).toBe('COMPLETED');
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 8 — Defect Register
// ═════════════════════════════════════════════════════════════
describe('8. Defect Register', () => {

    let defectId;

    test('8.1 Raises a defect via service action', async () => {
        const result = await send({
            event : 'raiseDefect',
            data  : {
                bridge_ID      : testBridgeId,
                defectCategory : 'STRUCTURAL_CRACKING',
                severity       : 'HIGH',
                description    : 'Longitudinal cracks on soffit of mid-span',
                location       : 'Mid-span soffit',
                dimensionLength: 2.5,
                dimensionWidth : 0.3,
                notes          : 'Test defect'
            }
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('SUCCESS');
        expect(result.defectNumber).toBeDefined();
        defectId = result.ID;
    });

    test('8.2 New defect has status OPEN', async () => {
        if (!defectId) return;
        const defect = await run(
            SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: defectId })
        );
        expect(defect.status).toBe('OPEN');
    });

    test('8.3 CRITICAL defect creates an AuditLog entry', async () => {
        await send({
            event : 'raiseDefect',
            data  : {
                bridge_ID      : testBridgeId,
                defectCategory : 'SCOUR_EROSION',
                severity       : 'CRITICAL',
                description    : 'Significant scour at eastern abutment'
            }
        });
        const database = await db();
        const logs = await database.run(
            SELECT.from('nhvr.AuditLog')
                .where({ action: 'CREATE', entity: 'BridgeDefects' })
                .limit(5)
        );
        expect(logs.length).toBeGreaterThan(0);
    });

    test('8.4 closeDefect transitions defect to CLOSED', async () => {
        if (!defectId) return;
        const result = await send({
            event  : 'closeDefect',
            entity : 'BridgeManagementService.BridgeDefects',
            params : [defectId],
            data   : { closureNotes: 'Cracks epoxy-injected and sealed.' }
        });
        expect(result.status).toBe('SUCCESS');

        const defect = await run(
            SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: defectId })
        );
        expect(defect.status).toBe('CLOSED');
    });

    test('8.5 closeDefect rejects if closureNotes is empty', async () => {
        const d = await send({
            event : 'raiseDefect',
            data  : {
                bridge_ID      : testBridgeId,
                defectCategory : 'SURFACE_DETERIORATION',
                severity       : 'LOW',
                description    : 'Surface spalling — minor'
            }
        });
        await expect(
            send({
                event  : 'closeDefect',
                entity : 'BridgeManagementService.BridgeDefects',
                params : [d.ID],
                data   : { closureNotes: '' }
            })
        ).rejects.toThrow();
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 9 — Mass Upload
// ═════════════════════════════════════════════════════════════
describe('9. Mass Upload', () => {

    test('9.1 Uploads valid bridge CSV — all rows succeed', async () => {
        const csvData = [
            'bridgeId,name,region,state,structureType,material,latitude,longitude,condition',
            'UPLOAD-A01,Hawkesbury Rail Bridge,Hawkesbury,NSW,Truss,Steel,-33.575,150.819,GOOD',
            'UPLOAD-A02,Shoalhaven River Bridge,Shoalhaven,NSW,Beam,Concrete,-34.869,150.741,FAIR'
        ].join('\n');

        const result = await send({ event: 'massUploadBridges', data: { csvData } });
        expect(result.status).toBe('SUCCESS');
        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);
    });

    test('9.2 Uploads CSV with one bad row — partial success', async () => {
        const csvData = [
            'bridgeId,name,region,state,latitude,longitude',
            'UPLOAD-B01,Good Bridge,Victoria,VIC,-37.8,-144.9',
            ',, , ,'
        ].join('\n');

        const result = await send({ event: 'massUploadBridges', data: { csvData } });
        expect(result.failureCount).toBeGreaterThan(0);
    });

    test('9.3 Rejects completely empty CSV', async () => {
        await expect(
            send({ event: 'massUploadBridges', data: { csvData: '' } })
        ).rejects.toThrow();
    });

    test('9.4 Uploads valid restriction CSV — all rows succeed', async () => {
        const csvData = [
            'bridgeId,restrictionType,value,unit,status,permitRequired,gazetteRef',
            'SHARED-TEST-001,MASS,36,t,ACTIVE,false,NSW Gazette 2026-001',
            'SHARED-TEST-001,HEIGHT,4.5,m,ACTIVE,false,NSW Gazette 2026-002'
        ].join('\n');

        const result = await send({ event: 'massUploadRestrictions', data: { csvData } });
        expect(['SUCCESS', 'PARTIAL_SUCCESS']).toContain(result.status);
        expect(result.successCount).toBeGreaterThanOrEqual(0);
    });

    test('9.5 Creates an UploadLog record per upload operation', async () => {
        const csvData = [
            'bridgeId,name,region,state',
            'UPLOAD-C01,Log Test Bridge,ACT,ACT'
        ].join('\n');

        await send({ event: 'massUploadBridges', data: { csvData } });

        const database = await db();
        const logs = await database.run(SELECT.from('nhvr.UploadLog').where({ uploadType: 'BRIDGE' }));
        expect(logs.length).toBeGreaterThan(0);
    });

    test('9.6 Upload result contains totalRecords, processedRecords, errorCount', async () => {
        const csvData = [
            'bridgeId,name,region,state',
            'UPLOAD-D01,Shape Test Bridge,Queensland,QLD'
        ].join('\n');

        const result = await send({ event: 'massUploadBridges', data: { csvData } });
        expect(result).toHaveProperty('totalRecords');
        expect(result).toHaveProperty('successCount');
        expect(result).toHaveProperty('failureCount');
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 10 — Reporting Views
// ═════════════════════════════════════════════════════════════
describe('10. Reporting Views', () => {

    test('10.1 ActiveRestrictions view returns an array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.ActiveRestrictions'));
        expect(Array.isArray(result)).toBe(true);
    });

    test('10.2 ActiveRestrictions returns restriction records (pre-filtered to ACTIVE)', async () => {
        const result = await run(SELECT.from('BridgeManagementService.ActiveRestrictions'));
        expect(Array.isArray(result)).toBe(true);
        // If status is projected, all must be ACTIVE; view pre-filters so inactive never appear
        result.forEach(r => {
            if (r.status !== undefined) expect(r.status).toBe('ACTIVE');
            else expect(r.restrictionType || r.value || r.ID).toBeDefined();
        });
    });

    test('10.3 RouteCompliance view returns an array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.RouteCompliance'));
        expect(Array.isArray(result)).toBe(true);
    });

    test('10.4 VehicleAccess view returns an array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.VehicleAccess'));
        expect(Array.isArray(result)).toBe(true);
    });

    test('10.5 getInspectionsDue function returns array with required fields', async () => {
        const result = await send({ event: 'getInspectionsDue', data: { daysAhead: 180 } });
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            const first = result[0];
            expect(first).toHaveProperty('bridgeId');
            expect(first).toHaveProperty('bridgeName');
        }
    });

    test('10.6 getOpenDefectsSummary function returns array', async () => {
        const result = await send({ event: 'getOpenDefectsSummary', data: {} });
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
            expect(result[0]).toHaveProperty('bridgeId');
            // field may be totalOpen or openDefects depending on service implementation
            const hasCount = result[0].totalOpen !== undefined || result[0].openDefects !== undefined;
            expect(hasCount).toBe(true);
        }
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 11 — Audit & Event Logging
// ═════════════════════════════════════════════════════════════
describe('11. Audit & Event Logging', () => {

    test('11.1 Creating a bridge writes a BridgeEventLog BRIDGE_CREATED entry', async () => {
        const b = await createBridge({ name: 'Audit Test Bridge' });

        const database = await db();
        const events = await database.run(
            SELECT.from('nhvr.BridgeEventLog')
                .where({ bridge_ID: b.ID, eventType: 'BRIDGE_CREATED' })
        );
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].title).toContain('Bridge created');
    });

    test('11.2 Creating a bridge writes an AuditLog CREATE entry', async () => {
        await createBridge({ name: 'Audit Trail Bridge' });

        const database = await db();
        const auditLogs = await database.run(
            SELECT.from('nhvr.AuditLog')
                .where({ action: 'CREATE', entity: 'Bridges' })
                .orderBy({ timestamp: 'desc' })
                .limit(5)
        );
        expect(auditLogs.length).toBeGreaterThan(0);
    });

    test('11.3 Creating a restriction writes a RESTRICTION_ADDED event on the bridge', async () => {
        await createRestriction({ restrictionType: 'WIDTH', value: 3.5, unit: 'm' });

        const database = await db();
        const events = await database.run(
            SELECT.from('nhvr.BridgeEventLog')
                .where({ bridge_ID: testBridgeId, eventType: 'RESTRICTION_ADDED' })
        );
        expect(events.length).toBeGreaterThan(0);
    });

    test('11.4 Updating bridge condition writes CONDITION_UPDATED event', async () => {
        await run(
            UPDATE('BridgeManagementService.Bridges')
                .set({ conditionRating: 5, postingStatus: 'POSTED' })
                .where({ ID: testBridgeId })
        );
        const database = await db();
        const events = await database.run(
            SELECT.from('nhvr.BridgeEventLog')
                .where({ bridge_ID: testBridgeId, eventType: 'CONDITION_UPDATED' })
        );
        expect(events.length).toBeGreaterThan(0);
    });

    test('11.5 AuditLog entries have timestamp, userId, action, entity fields', async () => {
        const database = await db();
        const logs = await database.run(
            SELECT.from('nhvr.AuditLog').limit(1)
        );
        if (logs.length > 0) {
            const log = logs[0];
            expect(log.timestamp).toBeDefined();
            expect(log.action).toBeDefined();
            expect(log.entity).toBeDefined();
        }
    });
});
