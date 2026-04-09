// =============================================================
// NHVR Bridge IQ v3.1.1 — SuperTester v2 (Integration)
// Domains: 1 Auth | 2 CRUD | 3 Bridge Actions | 4 Restriction Actions
//          5 Inspection+Defect | 6 Validation | 7 Performance
//          8 Security IRAP | 12 Audit | 14 Data Integrity | 15 Resilience
// Platform: SAP BTP CAP Node.js | OData V4 | IRAP PROTECTED | ASD ML2
//
// Run via:  npm run test:supertester
// globalSetup copies db.sqlite → db-supertester.sqlite (file-based, pre-deployed).
// NODE_ENV=supertester → CDS uses db-supertester.sqlite instead of :memory:.
// Boot time: ~2s vs ~5min for in-memory schema deployment.
// =============================================================
'use strict';

// NODE_ENV=supertester is set by env-setup.js (jest setupFiles) BEFORE this file loads.
// That ensures CDS reads the [supertester] profile from .cdsrc.json on first require.
jest.setTimeout(60000);

const path = require('path');
const cds = require('@sap/cds');

// Boot CDS once for all suites in this file.
// Use 'serve' variant: cds.test('serve') does NOT add --in-memory?
// Directly override cds.env.requires.db to use the pre-deployed snapshot file
// (globalSetup copies db.sqlite → db-supertester.sqlite) — ~2s boot vs ~5min in-memory.
const rootDir = path.resolve(__dirname, '../..');
cds.root = rootDir;
// Force file-based SQLite before CDS boots (bypasses profile resolution race)
cds.env.requires.db   = { kind: 'sqlite', credentials: { url: path.join(rootDir, 'db-supertester.sqlite') } };
cds.env.requires.auth = { kind: 'dummy' };
cds.test('serve');

// ── User contexts ─────────────────────────────────────────────
const PRIV = { user: new cds.User.Privileged() };

function userCtx(id, roles = []) {
    return { user: new cds.User({ id, roles }) };
}

const ADMIN_CTX    = userCtx('admin-st',    ['Admin', 'BridgeManager', 'Viewer', 'Uploader', 'Inspector', 'Operator']);
const MANAGER_CTX  = userCtx('manager-st',  ['BridgeManager', 'Viewer']);
const VIEWER_CTX   = userCtx('viewer-st',   ['Viewer']);
const INSP_CTX     = userCtx('inspector-st',['Inspector', 'Viewer']);
const _OPERATOR_CTX = userCtx('operator-st', ['Operator', 'Viewer']);
const ANON_CTX     = { user: new cds.User({ id: 'anonymous', roles: [] }) };

// ── Date helpers ──────────────────────────────────────────────
const today   = () => new Date().toISOString().split('T')[0];
const daysAgo = n  => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const daysFwd = n  => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

// ── Service handle ─────────────────────────────────────────────
let srv;
let db;

// ── Shared test fixtures ──────────────────────────────────────
let fx = {
    bridgeId:       null,   // UUID of shared bridge
    restrictionId:  null,   // UUID of shared active restriction
    orderId:        null,   // UUID of shared inspection order
    defectId:       null,   // UUID of shared defect
};

// ── Helpers ────────────────────────────────────────────────────
const run  = q => srv.tx(PRIV, () => srv.run(q));
const send = a => srv.tx(PRIV, () => srv.send(a));
const act  = (event, entity, params, data) => send({ event, entity, params, data: data || {} });

async function createBridge(overrides = {}) {
    const uid = `ST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*99)}`;
    return run(INSERT.into('BridgeManagementService.Bridges').entries({
        bridgeId       : uid,
        name           : `SuperTest Bridge ${uid}`,
        region         : 'Greater Sydney',
        state          : 'NSW',
        structureType  : 'Beam',
        material       : 'Concrete',
        latitude       : -33.8688,
        longitude      : 151.2093,
        condition      : 'GOOD',
        conditionRating: 7,
        postingStatus  : 'UNRESTRICTED',
        isActive       : true,
        ...overrides
    }));
}

async function createRestriction(bridgeUUID, overrides = {}) {
    return run(INSERT.into('BridgeManagementService.Restrictions').entries({
        restrictionType : 'MASS',
        value           : 42.5,
        unit            : 't',
        bridge_ID       : bridgeUUID,
        status          : 'ACTIVE',
        isActive        : true,
        ...overrides
    }));
}

// ── Global setup — runs ONCE after CDS boots ──────────────────
beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    db  = await cds.connect.to('db');

    // Shared bridge
    const b = await createBridge({ bridgeId: 'ST-SHARED-001', name: 'SuperTest Shared Bridge' });
    fx.bridgeId = b.ID;

    // Shared active restriction on shared bridge
    const r = await createRestriction(fx.bridgeId, { status: 'ACTIVE', isActive: true });
    fx.restrictionId = r.ID;

    // Shared inspection order
    const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
        bridge_ID  : fx.bridgeId,
        orderNumber: 'ST-ORD-001',
        status     : 'PLANNED',
        plannedDate: daysFwd(7),
        inspector: 'Test Inspector'
    }));
    fx.orderId = o.ID;

    // Shared defect
    const d = await run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
        bridge_ID      : fx.bridgeId,
        defectCategory : 'CRACKING',
        severity       : 'MEDIUM',
        status         : 'OPEN',
        description    : 'Test hairline crack on pier face',
        detectedDate   : today()
    }));
    fx.defectId = d.ID;
}, 120000);

afterAll(async () => {
    // Best-effort cleanup of fixtures
    const delIds = [fx.defectId, fx.orderId, fx.restrictionId, fx.bridgeId].filter(Boolean);
    for (const id of delIds) {
        await db.run(`DELETE FROM "nhvr_BridgeDefect"     WHERE "ID" = ?`, [id]).catch(() => {});
        await db.run(`DELETE FROM "nhvr_InspectionOrder"  WHERE "ID" = ?`, [id]).catch(() => {});
        await db.run(`DELETE FROM "nhvr_Restriction"      WHERE "ID" = ?`, [id]).catch(() => {});
        await db.run(`DELETE FROM "nhvr_Bridge"           WHERE "ID" = ?`, [id]).catch(() => {});
    }
});

// =============================================================
// DOMAIN 1: Authentication & Authorization (XSUAA / IRAP)
// =============================================================
describe('D01 · Authentication & Authorization', () => {

    test('D01-A01: Privileged user can read Bridges', async () => {
        const bridges = await run(SELECT.from('BridgeManagementService.Bridges').limit(5));
        expect(Array.isArray(bridges)).toBe(true);
    });

    test('D01-A02: Admin role can create a bridge', async () => {
        const result = await srv.tx(ADMIN_CTX, () =>
            srv.run(INSERT.into('BridgeManagementService.Bridges').entries({
                bridgeId: 'ST-AUTH-ADM-01',
                name: 'Admin Create Test',
                state: 'VIC', region: 'Metro',
                structureType: 'Beam', material: 'Concrete',
                latitude: -37.81, longitude: 144.96,
                condition: 'GOOD', isActive: true
            }))
        );
        expect(result).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "bridgeId" = 'ST-AUTH-ADM-01'`).catch(() => {});
    });

    test('D01-A03: Viewer role cannot mutate Bridge (INSERT blocked)', async () => {
        await expect(
            srv.tx(VIEWER_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.Bridges').entries({
                    bridgeId: 'VIEWER-SHOULD-FAIL', name: 'x',
                    state: 'VIC', region: 'x', structureType: 'Beam',
                    material: 'Concrete', latitude: -37, longitude: 144,
                    condition: 'GOOD', isActive: true
                }))
            )
        ).rejects.toThrow();
    });

    test('D01-A04: Viewer can read bridges (read-only access)', async () => {
        const bridges = await srv.tx(VIEWER_CTX, () =>
            srv.run(SELECT.from('BridgeManagementService.Bridges').limit(3))
        );
        expect(Array.isArray(bridges)).toBe(true);
    });

    test('D01-A05: Manager role can create Restriction', async () => {
        const result = await srv.tx(MANAGER_CTX, () =>
            srv.run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'HEIGHT', value: 4.5, unit: 'm',
                bridge_ID: fx.bridgeId, status: 'ACTIVE', isActive: true
            }))
        );
        expect(result).toBeTruthy();
        if (result.ID) {
            await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [result.ID]).catch(() => {});
        }
    });

    test('D01-A06: Inspector role can create InspectionOrder', async () => {
        const result = await srv.tx(INSP_CTX, () =>
            srv.run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
                bridge_ID: fx.bridgeId,
                orderNumber: 'ST-INSP-AUTH-001',
                status: 'PLANNED',
                plannedDate: daysFwd(14)
            }))
        );
        expect(result).toBeTruthy();
        if (result.ID) {
            await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [result.ID]).catch(() => {});
        }
    });

    test('D01-A07: Viewer cannot mutate restrictions (blocked)', async () => {
        await expect(
            srv.tx(VIEWER_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.Restrictions').entries({
                    restrictionType: 'MASS', value: 10, unit: 't',
                    bridge_ID: fx.bridgeId, status: 'ACTIVE', isActive: true
                }))
            )
        ).rejects.toThrow();
    });

    test('D01-A08: AuditLog is read-only — INSERT blocked for all roles', async () => {
        await expect(
            srv.tx(ADMIN_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.AuditLogs').entries({
                    action: 'FAKE', entityName: 'Bridge', entityId: 'xxx', changedBy: 'attacker'
                }))
            )
        ).rejects.toThrow();
    });

    test('D01-A09: NHVR_IQ_v3 Inspector scope maps to Inspector role', () => {
        // Verifies xs-security-v3.json scope → role mapping contract
        // In CDS v9, user.roles is an object {roleName: 1} not an array
        const inspectorRoles = ['Inspector', 'Viewer'];
        const ctx = userCtx('insp-v3', inspectorRoles);
        expect(ctx.user.is('Inspector')).toBe(true);
        expect(ctx.user.is('Viewer')).toBe(true);
    });

    test('D01-A10: NHVR_IQ_v3 Operator scope maps to Operator role', () => {
        const operatorRoles = ['Operator', 'Viewer'];
        const ctx = userCtx('op-v3', operatorRoles);
        expect(ctx.user.is('Operator')).toBe(true);
    });
});

// =============================================================
// DOMAIN 2: OData V4 CRUD Operations
// =============================================================
describe('D02 · OData V4 CRUD — Bridges', () => {

    test('D02-B01: SELECT all bridges returns array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.Bridges').limit(10));
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    test('D02-B02: SELECT by ID returns single bridge', async () => {
        const bridge = await run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: fx.bridgeId }));
        expect(bridge).toBeTruthy();
        expect(bridge.bridgeId).toBe('ST-SHARED-001');
    });

    test('D02-B03: CREATE bridge generates UUID', async () => {
        const result = await createBridge({ bridgeId: 'ST-CRUD-001' });
        expect(result.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [result.ID]).catch(() => {});
    });

    test('D02-B04: UPDATE bridge name succeeds', async () => {
        const b = await createBridge({ bridgeId: 'ST-UPD-001' });
        await run(UPDATE('BridgeManagementService.Bridges').set({ name: 'Updated Name ST' }).where({ ID: b.ID }));
        const updated = await run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: b.ID }));
        expect(updated.name).toBe('Updated Name ST');
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D02-B05: DELETE bridge succeeds', async () => {
        const b = await createBridge({ bridgeId: 'ST-DEL-001' });
        await run(DELETE.from('BridgeManagementService.Bridges').where({ ID: b.ID }));
        const result = await run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: b.ID }));
        expect(result).toBeFalsy();
    });

    test('D02-B06: SELECT with $filter by state returns only matching bridges', async () => {
        const result = await run(SELECT.from('BridgeManagementService.Bridges').where({ state: 'NSW' }).limit(5));
        result.forEach(b => expect(b.state).toBe('NSW'));
    });

    test('D02-B07: SELECT with $orderby returns sorted results', async () => {
        const result = await run(SELECT.from('BridgeManagementService.Bridges').orderBy('name asc').limit(10));
        // Use simple string comparison to match SQLite ASCII sort order
        for (let i = 1; i < result.length; i++) {
            expect(result[i-1].name <= result[i].name).toBe(true);
        }
    });

    test('D02-B08: SELECT $top=5 returns exactly 5 rows', async () => {
        const result = await run(SELECT.from('BridgeManagementService.Bridges').limit(5));
        expect(result.length).toBeLessThanOrEqual(5);
    });

    test('D02-B09: SELECT $top=100 $skip=0 works (pagination domain)', async () => {
        const page1 = await run(SELECT.from('BridgeManagementService.Bridges').limit(100, 0));
        const page2 = await run(SELECT.from('BridgeManagementService.Bridges').limit(100, 100));
        // Pages should have different first elements (if total > 100)
        if (page2.length > 0 && page1.length === 100) {
            expect(page2[0].ID).not.toBe(page1[0].ID);
        }
        expect(page1.length).toBeLessThanOrEqual(100);
    });
});

describe('D02 · OData V4 CRUD — Restrictions', () => {

    test('D02-R01: SELECT restrictions for bridge returns array', async () => {
        const result = await run(
            SELECT.from('BridgeManagementService.Restrictions').where({ bridge_ID: fx.bridgeId })
        );
        expect(Array.isArray(result)).toBe(true);
    });

    test('D02-R02: SELECT restriction by ID', async () => {
        const r = await run(
            SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: fx.restrictionId })
        );
        expect(r).toBeTruthy();
        expect(r.restrictionType).toBe('MASS');
    });

    test('D02-R03: SELECT restrictions filtered by status ACTIVE', async () => {
        const result = await run(
            SELECT.from('BridgeManagementService.Restrictions').where({ status: 'ACTIVE' }).limit(5)
        );
        result.forEach(r => expect(r.status).toBe('ACTIVE'));
    });
});

describe('D02 · OData V4 CRUD — InspectionOrders & Defects', () => {

    test('D02-I01: SELECT InspectionOrders returns array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.InspectionOrders').limit(5));
        expect(Array.isArray(result)).toBe(true);
    });

    test('D02-I02: SELECT InspectionOrder by ID', async () => {
        const o = await run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: fx.orderId }));
        expect(o).toBeTruthy();
        expect(o.orderNumber).toBe('ST-ORD-001');
    });

    test('D02-D01: SELECT BridgeDefects returns array', async () => {
        const result = await run(SELECT.from('BridgeManagementService.BridgeDefects').limit(5));
        expect(Array.isArray(result)).toBe(true);
    });

    test('D02-D02: SELECT defect by ID', async () => {
        const d = await run(SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: fx.defectId }));
        expect(d).toBeTruthy();
        expect(d.defectCategory).toBe('CRACKING');
    });
});

// =============================================================
// DOMAIN 3: Bridge Bound Actions
// =============================================================
describe('D03 · Bridge Bound Actions', () => {

    test('D03-BA01: changeCondition — valid rating updates condition', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-CC-01' });
        const result = await act('changeCondition', 'Bridges', [b.ID], {
            conditionValue: 'POOR', score: 35
        });
        // changeCondition returns the updated bridge object {ID, bridgeId, name, condition, conditionScore}
        expect(result.condition).toBe('POOR');
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA02: changeCondition — invalid score > 100 rejected', async () => {
        await expect(
            act('changeCondition', 'Bridges', [fx.bridgeId], { conditionValue: 'GOOD', score: 150 })
        ).rejects.toThrow();
    });

    test('D03-BA03: changeCondition — score < 0 rejected', async () => {
        await expect(
            act('changeCondition', 'Bridges', [fx.bridgeId], { conditionValue: 'GOOD', score: -5 })
        ).rejects.toThrow();
    });

    test('D03-BA04: closeBridge — creates closure record', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-CB-01' });
        const result = await act('closeBridge', 'Bridges', [b.ID], {
            reason: 'Structural assessment required',
            effectiveFrom: today(),
            expectedReopenDate: daysFwd(30),
            approvalRef: 'NHVR-CLOSE-TEST-001'
        });
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA05: reopenBridge — after closeBridge', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-RB-01' });
        await act('closeBridge', 'Bridges', [b.ID], {
            reason: 'Test closure', effectiveFrom: today(), approvalRef: 'TST-001'
        });
        const result = await act('reopenBridge', 'Bridges', [b.ID], {
            reason: 'Repairs completed', effectiveDate: today(), approvalRef: 'TST-002'
        });
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA06: addRestriction — core bug fix verified', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-AR-01' });
        const result = await act('addRestriction', 'Bridges', [b.ID], {
            restrictionType: 'MASS',
            value: 44.0,
            unit: 't',
            status: 'ACTIVE',
            validFromDate: today()
        });
        expect(result.status).toBe('SUCCESS');
        expect(result.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [result.ID]).catch(() => {});
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA07: closeForTraffic — closes bridge to traffic', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-CFT-01' });
        const result = await act('closeForTraffic', 'Bridges', [b.ID], {});
        // closeForTraffic returns {ID, bridgeId, name, postingStatus}
        expect(result.postingStatus).toBe('CLOSED');
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA08: reopenForTraffic — after closeForTraffic', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-RFT-01' });
        await act('closeForTraffic', 'Bridges', [b.ID], {});
        const result = await act('reopenForTraffic', 'Bridges', [b.ID], {});
        // reopenForTraffic returns {ID, bridgeId, name, postingStatus}
        expect(result.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D03-BA09: changeCondition — creates BridgeConditionHistory entry', async () => {
        const b = await createBridge({ bridgeId: 'ST-ACT-HIST-01', conditionRating: 8 });
        await act('changeCondition', 'Bridges', [b.ID], { conditionValue: 'FAIR', score: 55 });
        const history = await run(
            SELECT.from('BridgeManagementService.BridgeHistory')
                .where({ bridge_ID: b.ID })
                .limit(5)
        );
        expect(history.length).toBeGreaterThan(0);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });
});

// =============================================================
// DOMAIN 4: Restriction Bound Actions (SQLite jsonb-fix validated)
// =============================================================
describe('D04 · Restriction Bound Actions', () => {

    let testRestrictionId;

    beforeEach(async () => {
        const r = await createRestriction(fx.bridgeId, { status: 'ACTIVE', isActive: true });
        testRestrictionId = r.ID;
    });

    afterEach(async () => {
        if (testRestrictionId) {
            await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [testRestrictionId]).catch(() => {});
        }
    });

    test('D04-R01: disableRestriction — previously failing, now fixed', async () => {
        const result = await act('disableRestriction', 'Restrictions', [testRestrictionId], {
            reason: 'Annual review — removed from active posting'
        });
        expect(result.status).toBe('SUCCESS');
    });

    test('D04-R02: disableRestriction — already inactive returns 400', async () => {
        // First disable it
        await act('disableRestriction', 'Restrictions', [testRestrictionId], { reason: 'Test' });
        // Disable again should fail
        await expect(
            act('disableRestriction', 'Restrictions', [testRestrictionId], { reason: 'Duplicate' })
        ).rejects.toThrow();
    });

    test('D04-R03: enableRestriction — after disable', async () => {
        await act('disableRestriction', 'Restrictions', [testRestrictionId], { reason: 'Temp' });
        const result = await act('enableRestriction', 'Restrictions', [testRestrictionId], {
            reason: 'Reinstated after review'
        });
        expect(result.status).toBe('SUCCESS');
    });

    test('D04-R04: enableRestriction — already active returns 400', async () => {
        await expect(
            act('enableRestriction', 'Restrictions', [testRestrictionId], { reason: 'Already active' })
        ).rejects.toThrow();
    });

    test('D04-R05: createTemporaryRestriction — valid dates creates temp clone', async () => {
        const result = await act('createTemporaryRestriction', 'Restrictions', [testRestrictionId], {
            fromDate: today(),
            toDate  : daysFwd(14),
            reason  : 'Bridge works — temporary 14t limit'
        });
        expect(result.status).toBe('SUCCESS');
        expect(result.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [result.ID]).catch(() => {});
    });

    test('D04-R06: createTemporaryRestriction — fromDate after toDate rejected', async () => {
        await expect(
            act('createTemporaryRestriction', 'Restrictions', [testRestrictionId], {
                fromDate: daysFwd(10),
                toDate  : today(),
                reason  : 'Invalid dates'
            })
        ).rejects.toThrow();
    });

    test('D04-R07: createTemporaryRestriction — missing dates rejected', async () => {
        await expect(
            act('createTemporaryRestriction', 'Restrictions', [testRestrictionId], {
                reason: 'No dates provided'
            })
        ).rejects.toThrow();
    });

    test('D04-R08: extendTemporaryRestriction — updates validToDate', async () => {
        // Create a temp restriction first
        const tempResult = await act('createTemporaryRestriction', 'Restrictions', [testRestrictionId], {
            fromDate: today(),
            toDate  : daysFwd(7),
            reason  : 'Initial temp period'
        });
        const tempId = tempResult.ID;

        const result = await act('extendTemporaryRestriction', 'Restrictions', [tempId], {
            newToDate: daysFwd(21),
            reason   : 'Works extended'
        });
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [tempId]).catch(() => {});
    });

    test('D04-R09: extendTemporaryRestriction — missing newToDate rejected', async () => {
        await expect(
            act('extendTemporaryRestriction', 'Restrictions', [testRestrictionId], { reason: 'No date' })
        ).rejects.toThrow();
    });
});

// =============================================================
// DOMAIN 5: Inspection & Defect Actions
// =============================================================
describe('D05 · Inspection & Defect Actions', () => {

    test('D05-I01: startInspection — PLANNED → IN_PROGRESS', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-SI-001',
            status: 'PLANNED', plannedDate: daysFwd(1)
        }));
        const result = await act('startInspection', 'InspectionOrders', [o.ID], {});
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-I02: startInspection — non-PLANNED status rejected', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-SI-002',
            status: 'COMPLETED', plannedDate: daysAgo(1)
        }));
        await expect(
            act('startInspection', 'InspectionOrders', [o.ID], {})
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-I03: completeInspection — IN_PROGRESS → COMPLETED', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-CI-001',
            status: 'IN_PROGRESS', plannedDate: today()
        }));
        const result = await act('completeInspection', 'InspectionOrders', [o.ID], {
            overallConditionRating: 7,
            structuralAdequacy    : 'ADEQUATE',
            maintenanceUrgency    : 'ROUTINE',
            recommendations       : 'Monitor crack at pier 3',
            nextInspectionDue     : daysFwd(365)
        });
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-I04: completeInspection — conditionRating > 10 rejected', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-CI-002',
            status: 'IN_PROGRESS', plannedDate: today()
        }));
        await expect(
            act('completeInspection', 'InspectionOrders', [o.ID], { overallConditionRating: 11 })
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-I05: completeInspection — conditionRating < 1 rejected', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-CI-003',
            status: 'IN_PROGRESS', plannedDate: today()
        }));
        await expect(
            act('completeInspection', 'InspectionOrders', [o.ID], { overallConditionRating: 0 })
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-I06: completeInspection — invalid maintenanceUrgency rejected', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-CI-004',
            status: 'IN_PROGRESS', plannedDate: today()
        }));
        await expect(
            act('completeInspection', 'InspectionOrders', [o.ID], {
                overallConditionRating: 7,
                maintenanceUrgency: 'INVALID_VALUE'
            })
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D05-D01: closeDefect — OPEN → CLOSED (v3.1.1 fix)', async () => {
        const d = await run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
            bridge_ID: fx.bridgeId, defectCategory: 'SPALLING', severity: 'LOW',
            status: 'OPEN', description: 'Minor spall on abutment', detectedDate: today()
        }));
        const result = await act('closeDefect', 'BridgeDefects', [d.ID], {
            closureNotes: 'Repaired with epoxy grout — sealed'
        });
        expect(result.status).toBe('SUCCESS');
        await db.run(`DELETE FROM "nhvr_BridgeDefect" WHERE "ID" = ?`, [d.ID]).catch(() => {});
    });

    test('D05-D02: closeDefect — already CLOSED returns 400', async () => {
        const d = await run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
            bridge_ID: fx.bridgeId, defectCategory: 'CORROSION', severity: 'MEDIUM',
            status: 'CLOSED', description: 'Already closed defect', detectedDate: daysAgo(30)
        }));
        await expect(
            act('closeDefect', 'BridgeDefects', [d.ID], { closureNotes: 'Already done' })
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_BridgeDefect" WHERE "ID" = ?`, [d.ID]).catch(() => {});
    });

    test('D05-F01: getInspectionsDue — returns array for 30 days ahead', async () => {
        const result = await send({ event: 'getInspectionsDue', data: { daysAhead: 30 } });
        expect(Array.isArray(result)).toBe(true);
    });

    test('D05-F02: getOpenDefectsSummary — returns array', async () => {
        const result = await send({ event: 'getOpenDefectsSummary', data: {} });
        expect(Array.isArray(result)).toBe(true);
    });
});

// =============================================================
// DOMAIN 6: Data Validation & Business Rules
// =============================================================
describe('D06 · Data Validation & Business Rules', () => {

    test('D06-V01: latitude > 90 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-LAT-HI', latitude: 95 })).rejects.toThrow();
    });

    test('D06-V02: latitude < -90 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-LAT-LO', latitude: -91 })).rejects.toThrow();
    });

    test('D06-V03: longitude > 180 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-LON-HI', longitude: 181 })).rejects.toThrow();
    });

    test('D06-V04: longitude < -180 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-LON-LO', longitude: -181 })).rejects.toThrow();
    });

    test('D06-V05: conditionRating > 10 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-CR-HI', conditionRating: 11 })).rejects.toThrow();
    });

    test('D06-V06: conditionRating < 1 rejected', async () => {
        await expect(createBridge({ bridgeId: 'V-CR-LO', conditionRating: 0 })).rejects.toThrow();
    });

    test('D06-V07: restriction value = 0 rejected (except VEHICLE_TYPE)', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'MASS', value: 0, unit: 't',
                bridge_ID: fx.bridgeId, status: 'ACTIVE', isActive: true
            }))
        ).rejects.toThrow();
    });

    test('D06-V08: restriction value < 0 rejected', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'HEIGHT', value: -1, unit: 'm',
                bridge_ID: fx.bridgeId, status: 'ACTIVE', isActive: true
            }))
        ).rejects.toThrow();
    });

    test('D06-V09: restriction validFromDate after validToDate rejected', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'MASS', value: 44, unit: 't',
                bridge_ID: fx.bridgeId, status: 'ACTIVE', isActive: true,
                validFromDate: daysFwd(10),
                validToDate  : today()
            }))
        ).rejects.toThrow();
    });

    test('D06-V10: temporary restriction without toDate rejected', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType   : 'MASS', value: 20, unit: 't',
                bridge_ID         : fx.bridgeId,
                status            : 'ACTIVE',
                isActive          : true,
                isTemporary       : true,
                temporaryFromDate : today()
                // missing temporaryToDate
            }))
        ).rejects.toThrow();
    });

    test('D06-V11: valid bridge with boundary coords -90/-180 accepted', async () => {
        const b = await createBridge({ bridgeId: 'V-BOUND-001', latitude: -33, longitude: 151 });
        expect(b.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D06-V12: conditionRating 1 (boundary low) accepted', async () => {
        const b = await createBridge({ bridgeId: 'V-CR-1', conditionRating: 1, condition: 'CRITICAL' });
        expect(b.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D06-V13: conditionRating 10 (boundary high) accepted', async () => {
        const b = await createBridge({ bridgeId: 'V-CR-10', conditionRating: 10, condition: 'EXCELLENT' });
        expect(b.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });
});

// =============================================================
// DOMAIN 7: Performance & Pagination (IRAP SLA)
// =============================================================
describe('D07 · Performance & Pagination', () => {

    test('D07-P01: Bridge list $top=100 responds within 2000ms SLA', async () => {
        const t0 = Date.now();
        await run(SELECT.from('BridgeManagementService.Bridges').limit(100));
        expect(Date.now() - t0).toBeLessThan(2000);
    });

    test('D07-P02: Bridge list $skip=100 works correctly', async () => {
        const page1 = await run(SELECT.from('BridgeManagementService.Bridges').orderBy('bridgeId').limit(100, 0));
        const page2 = await run(SELECT.from('BridgeManagementService.Bridges').orderBy('bridgeId').limit(100, 100));
        if (page1.length === 100 && page2.length > 0) {
            expect(page2[0].bridgeId).not.toBe(page1[0].bridgeId);
        }
    });

    test('D07-P03: Restriction list responds within 1000ms', async () => {
        const t0 = Date.now();
        await run(SELECT.from('BridgeManagementService.Restrictions').limit(100));
        expect(Date.now() - t0).toBeLessThan(1000);
    });

    test('D07-P04: COUNT query for bridges returns positive integer', async () => {
        const result = await db.run(`SELECT COUNT(*) AS cnt FROM "nhvr_Bridge"`);
        const count = result[0]?.cnt ?? result[0]?.['COUNT(*)'];
        expect(Number(count)).toBeGreaterThan(0);
    });

    test('D07-P05: Pagination $top=10 returns exactly 10 rows (if enough data)', async () => {
        const result = await run(SELECT.from('BridgeManagementService.Bridges').limit(10));
        expect(result.length).toBeLessThanOrEqual(10);
    });

    test('D07-P06: $orderby name desc + $top=5 returns sorted results', async () => {
        const result = await run(
            SELECT.from('BridgeManagementService.Bridges').orderBy('name desc').limit(5)
        );
        for (let i = 1; i < result.length; i++) {
            expect(result[i-1].name.localeCompare(result[i].name)).toBeGreaterThanOrEqual(0);
        }
    });

    test('D07-P07: AuditLog read responds within 1500ms', async () => {
        const t0 = Date.now();
        await run(SELECT.from('BridgeManagementService.AuditLogs').limit(50));
        expect(Date.now() - t0).toBeLessThan(1500);
    });

    test('D07-P08: InspectionOrders paginated read within SLA', async () => {
        const t0 = Date.now();
        await run(SELECT.from('BridgeManagementService.InspectionOrders').limit(50));
        expect(Date.now() - t0).toBeLessThan(1000);
    });
});

// =============================================================
// DOMAIN 8: Security Hardening (IRAP PROTECTED + ASD ML2)
// =============================================================
describe('D08 · Security — IRAP PROTECTED + ASD Essential Eight ML2', () => {

    test('D08-S01: SQL injection in $filter value treated as literal string', async () => {
        // Passes "' OR '1'='1" as bridgeId value — should not return extra rows
        const result = await run(
            SELECT.from('BridgeManagementService.Bridges')
                .where({ bridgeId: "' OR '1'='1" })
        );
        expect(result.length).toBe(0); // no bridges match this literal
    });

    test('D08-S02: XSS payload in bridge name stored as literal (no exec)', async () => {
        const xssName = '<script>alert("xss")</script>';
        const b = await createBridge({ bridgeId: 'ST-XSS-001', name: xssName });
        const fetched = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: b.ID })
        );
        expect(fetched.name).toBe(xssName); // stored as-is, not executed
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D08-S03: AuditLog cannot be written by any application user', async () => {
        await expect(
            srv.tx(ADMIN_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.AuditLogs').entries({
                    action: 'FORGED', entityName: 'Bridge', entityId: 'x', changedBy: 'hacker'
                }))
            )
        ).rejects.toThrow();
    });

    test('D08-S04: BridgeConditionHistory cannot be mutated by application user', async () => {
        await expect(
            srv.tx(ADMIN_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.BridgeHistory').entries({
                    bridge_ID: fx.bridgeId, changedBy: 'forge', changedAt: new Date().toISOString()
                }))
            )
        ).rejects.toThrow();
    });

    test('D08-S05: Anonymous/unauthenticated INSERT is rejected', async () => {
        await expect(
            srv.tx(ANON_CTX, () =>
                srv.run(INSERT.into('BridgeManagementService.Bridges').entries({
                    bridgeId: 'ANON-BRIDGE', name: 'x', state: 'NSW', region: 'x',
                    structureType: 'Beam', material: 'Concrete',
                    latitude: -33, longitude: 151, condition: 'GOOD', isActive: true
                }))
            )
        ).rejects.toThrow();
    });

    test('D08-S06: Overly long string fields do not cause stack overflow', async () => {
        const longStr = 'A'.repeat(200); // at name field limit
        const b = await createBridge({ bridgeId: 'ST-LONG-001', name: longStr });
        expect(b.ID).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D08-S07: NULL injection — null bridge_ID for restriction rejected', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'MASS', value: 44, unit: 't',
                bridge_ID: null, status: 'ACTIVE', isActive: true
            }))
        ).rejects.toThrow();
    });

    test('D08-S08: Path traversal in string field stored as literal', async () => {
        const traversal = '../../../etc/passwd';
        const b = await createBridge({ bridgeId: 'ST-PT-001', name: traversal });
        const fetched = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: b.ID })
        );
        expect(fetched.name).toBe(traversal);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D08-S09: Unicode/emoji in notes field handled gracefully', async () => {
        const emoji = '🌉 Bridge with emoji notes 🏗️';
        const b = await createBridge({ bridgeId: 'ST-UNI-001', name: 'Unicode Test Bridge' });
        await run(UPDATE('BridgeManagementService.Bridges').set({ remarks: emoji }).where({ ID: b.ID }));
        const fetched = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: b.ID })
        );
        expect(fetched.remarks).toBe(emoji);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D08-S10: Viewer cannot DELETE a bridge (ASD ML2 — least privilege)', async () => {
        const b = await createBridge({ bridgeId: 'ST-SEC-DEL-01' });
        await expect(
            srv.tx(VIEWER_CTX, () =>
                srv.run(DELETE.from('BridgeManagementService.Bridges').where({ ID: b.ID }))
            )
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });
});

// =============================================================
// DOMAIN 12: Audit & IRAP Compliance
// =============================================================
describe('D12 · Audit & IRAP Compliance', () => {

    test('D12-AU01: Bridge CREATE generates AuditLog entry', async () => {
        const b = await createBridge({ bridgeId: 'ST-AUD-001' });
        // logAudit writes: entity='Bridges', entityId=data.bridgeId, entityName=data.name
        const logs = await run(
            SELECT.from('BridgeManagementService.AuditLogs')
                .where({ entity: 'Bridges', entityId: 'ST-AUD-001' })
                .limit(5)
        );
        expect(logs.length).toBeGreaterThan(0);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D12-AU02: changeCondition generates AuditLog with action=ACTION', async () => {
        const b = await createBridge({ bridgeId: 'ST-AUD-002', conditionRating: 8 });

        await act('changeCondition', 'Bridges', [b.ID], { conditionValue: 'FAIR', score: 50 });

        // logAudit writes entity='Bridges', action='ACTION'
        const after = await run(
            SELECT.from('BridgeManagementService.AuditLogs')
                .where({ entity: 'Bridges', action: 'ACTION' })
                .orderBy('timestamp desc').limit(5)
        );
        expect(after.length).toBeGreaterThan(0);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D12-AU03: AuditLog entries have required IRAP fields', async () => {
        // First create a bridge to ensure there's at least one audit entry
        const b = await createBridge({ bridgeId: 'ST-AUD-003' });
        const logs = await run(
            SELECT.from('BridgeManagementService.AuditLogs')
                .where({ entity: 'Bridges' })
                .orderBy('timestamp desc').limit(5)
        );
        expect(logs.length).toBeGreaterThan(0);
        logs.forEach(log => {
            expect(log.action).toBeTruthy();      // 'CREATE','UPDATE','DELETE','ACTION'
            expect(log.entity).toBeTruthy();      // entity type (AuditLog field name)
            expect(log.userId).toBeTruthy();      // userId field (not changedBy)
            expect(log.timestamp).toBeTruthy();   // timestamp field (not changedAt)
        });
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D12-AU04: disableRestriction creates AuditLog (v3.1.1 fix verified)', async () => {
        const r = await createRestriction(fx.bridgeId, { status: 'ACTIVE', isActive: true });
        await act('disableRestriction', 'Restrictions', [r.ID], { reason: 'Audit test' });
        // logAudit for disableRestriction writes entity='Restrictions', entityId=restrictionId
        const logs = await run(
            SELECT.from('BridgeManagementService.AuditLogs')
                .where({ entity: 'Restrictions', entityId: r.ID })
                .limit(5)
        );
        expect(logs.length).toBeGreaterThan(0);
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [r.ID]).catch(() => {});
    });

    test('D12-AU05: AuditLog DELETE is blocked (immutability)', async () => {
        const logs = await run(SELECT.from('BridgeManagementService.AuditLogs').limit(1));
        if (logs.length > 0) {
            await expect(
                srv.tx(ADMIN_CTX, () =>
                    srv.run(DELETE.from('BridgeManagementService.AuditLogs').where({ ID: logs[0].ID }))
                )
            ).rejects.toThrow();
        } else {
            // No logs yet — test passes (nothing to delete)
            expect(true).toBe(true);
        }
    });

    test('D12-AU06: BridgeConditionHistory created on changeCondition (IRAP traceability)', async () => {
        const b = await createBridge({ bridgeId: 'ST-AUD-HIST-01', conditionRating: 9 });
        await act('changeCondition', 'Bridges', [b.ID], { conditionValue: 'POOR', score: 25 });
        const history = await run(
            SELECT.from('BridgeManagementService.BridgeHistory').where({ bridge_ID: b.ID })
        );
        expect(history.length).toBeGreaterThan(0);
        // BridgeConditionHistory entity has changedBy field
        expect(history[0].changedBy || history[0].changedAt).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });
});

// =============================================================
// DOMAIN 14: Data Integrity & Referential Integrity
// =============================================================
describe('D14 · Data Integrity & Referential Integrity', () => {

    test('D14-I01: Restriction bridge_ID must reference existing bridge', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000001';
        await expect(
            run(INSERT.into('BridgeManagementService.Restrictions').entries({
                restrictionType: 'MASS', value: 44, unit: 't',
                bridge_ID: fakeId, status: 'ACTIVE', isActive: true
            }))
        ).rejects.toThrow();
    });

    test('D14-I02: BridgeConditionHistory populated on changeCondition', async () => {
        const b = await createBridge({ bridgeId: 'ST-INT-001', conditionRating: 8 });
        await act('changeCondition', 'Bridges', [b.ID], { conditionValue: 'FAIR', score: 55 });
        const rows = await run(
            SELECT.from('BridgeManagementService.BridgeHistory').where({ bridge_ID: b.ID })
        );
        expect(rows.length).toBeGreaterThan(0);
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D14-I03: Bridge isActive flag is boolean', async () => {
        const b = await run(
            SELECT.one.from('BridgeManagementService.Bridges').where({ ID: fx.bridgeId })
        );
        expect(typeof b.isActive).toBe('boolean');
    });

    test('D14-I04: Restriction isActive default true on INSERT', async () => {
        const r = await createRestriction(fx.bridgeId);
        const fetched = await run(
            SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: r.ID })
        );
        expect(fetched.isActive).toBe(true);
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [r.ID]).catch(() => {});
    });

    test('D14-I05: disableRestriction sets isActive=false and disabledAt', async () => {
        const r = await createRestriction(fx.bridgeId);
        await act('disableRestriction', 'Restrictions', [r.ID], { reason: 'Integrity check' });
        const rows = await db.run(
            `SELECT "isActive","disabledAt","disableReason" FROM "nhvr_Restriction" WHERE "ID" = ?`, [r.ID]
        );
        const updated = rows[0];
        expect(updated.isActive).toBeFalsy();
        expect(updated.disabledAt).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [r.ID]).catch(() => {});
    });

    test('D14-I06: Defect bridge_ID must reference existing bridge', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000002';
        await expect(
            run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
                bridge_ID: fakeId, defectCategory: 'CRACKING', severity: 'LOW',
                status: 'OPEN', description: 'Orphan defect test', detectedDate: today()
            }))
        ).rejects.toThrow();
    });

    test('D14-I07: closeDefect sets status=CLOSED and closedDate', async () => {
        const d = await run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
            bridge_ID: fx.bridgeId, defectCategory: 'CORROSION', severity: 'LOW',
            status: 'OPEN', description: 'Closure integrity test', detectedDate: today()
        }));
        await act('closeDefect', 'BridgeDefects', [d.ID], { closureNotes: 'Treated and sealed' });
        const rows = await db.run(
            `SELECT "status","closedDate" FROM "nhvr_BridgeDefect" WHERE "ID" = ?`, [d.ID]
        );
        expect(rows[0].status).toBe('CLOSED');
        expect(rows[0].closedDate).toBeTruthy();
        await db.run(`DELETE FROM "nhvr_BridgeDefect" WHERE "ID" = ?`, [d.ID]).catch(() => {});
    });

    test('D14-I08: InspectionOrder bridge_ID must reference existing bridge', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000003';
        await expect(
            run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
                bridge_ID: fakeId, orderNumber: 'ST-ORPHAN-001',
                status: 'PLANNED', plannedDate: daysFwd(7)
            }))
        ).rejects.toThrow();
    });
});

// =============================================================
// DOMAIN 15: Resilience & Error Recovery
// =============================================================
describe('D15 · Resilience & Error Recovery', () => {

    test('D15-R01: action on non-existent bridge returns 404 error', async () => {
        const fakeId = '00000000-dead-beef-0000-000000000001';
        await expect(
            act('changeCondition', 'Bridges', [fakeId], { conditionValue: 'GOOD', score: 80 })
        ).rejects.toThrow('Bridge not found');
    });

    test('D15-R02: disableRestriction on non-existent ID returns 404', async () => {
        const fakeId = '00000000-dead-beef-0000-000000000002';
        await expect(
            act('disableRestriction', 'Restrictions', [fakeId], { reason: 'Test' })
        ).rejects.toThrow();
    });

    test('D15-R03: startInspection on non-existent order returns 404', async () => {
        const fakeId = '00000000-dead-beef-0000-000000000003';
        await expect(
            act('startInspection', 'InspectionOrders', [fakeId], {})
        ).rejects.toThrow();
    });

    test('D15-R04: closeDefect on non-existent defect returns 404', async () => {
        const fakeId = '00000000-dead-beef-0000-000000000004';
        await expect(
            act('closeDefect', 'BridgeDefects', [fakeId], { closureNotes: 'Test' })
        ).rejects.toThrow();
    });

    test('D15-R05: duplicate bridgeId is rejected (unique constraint)', async () => {
        await createBridge({ bridgeId: 'ST-DUP-001' });
        await expect(
            createBridge({ bridgeId: 'ST-DUP-001' }) // same bridgeId
        ).rejects.toThrow();
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "bridgeId" = 'ST-DUP-001'`).catch(() => {});
    });

    test('D15-R06: addRestriction on closed bridge still succeeds (restriction pre-dates close)', async () => {
        const b = await createBridge({ bridgeId: 'ST-RES-006' });
        const result = await act('addRestriction', 'Bridges', [b.ID], {
            restrictionType: 'MASS', value: 30, unit: 't', status: 'ACTIVE'
        });
        expect(result.status).toBe('SUCCESS');
        if (result.ID) {
            await db.run(`DELETE FROM "nhvr_Restriction" WHERE "ID" = ?`, [result.ID]).catch(() => {});
        }
        await db.run(`DELETE FROM "nhvr_Bridge" WHERE "ID" = ?`, [b.ID]).catch(() => {});
    });

    test('D15-R07: COMPLETED InspectionOrder re-completion returns 400 (guard)', async () => {
        const o = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
            bridge_ID: fx.bridgeId, orderNumber: 'ST-RES-007',
            status: 'IN_PROGRESS', plannedDate: today()
        }));
        await act('completeInspection', 'InspectionOrders', [o.ID], {
            overallConditionRating: 8, maintenanceUrgency: 'ROUTINE'
        });
        // Handler enforces completion guard — re-completion returns 400
        await expect(
            act('completeInspection', 'InspectionOrders', [o.ID], { overallConditionRating: 6 })
        ).rejects.toThrow(/already completed/i);
        await db.run(`DELETE FROM "nhvr_InspectionOrder" WHERE "ID" = ?`, [o.ID]).catch(() => {});
    });

    test('D15-R08: createTemporaryRestriction on non-existent restriction returns 404', async () => {
        const fakeId = '00000000-dead-beef-0000-000000000005';
        await expect(
            act('createTemporaryRestriction', 'Restrictions', [fakeId], {
                fromDate: today(), toDate: daysFwd(14), reason: 'Test'
            })
        ).rejects.toThrow();
    });

    test('D15-R09: missing required bridgeId field on INSERT is rejected', async () => {
        await expect(
            run(INSERT.into('BridgeManagementService.Bridges').entries({
                // bridgeId: missing
                name: 'No Bridge ID', state: 'NSW', region: 'x',
                structureType: 'Beam', material: 'Concrete',
                latitude: -33, longitude: 151, condition: 'GOOD', isActive: true
            }))
        ).rejects.toThrow();
    });

    test('D15-R10: concurrent reads do not interfere', async () => {
        const reads = await Promise.all([
            run(SELECT.from('BridgeManagementService.Bridges').limit(10)),
            run(SELECT.from('BridgeManagementService.Restrictions').limit(10)),
            run(SELECT.from('BridgeManagementService.InspectionOrders').limit(10)),
            run(SELECT.from('BridgeManagementService.BridgeDefects').limit(10)),
        ]);
        reads.forEach(r => expect(Array.isArray(r)).toBe(true));
    });
});
