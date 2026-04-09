'use strict';
/* ────────────────────────────────────────────────────────────────
   Unit Tests — Bridge Handlers + Common Helpers
   Covers: CREATE validation, Bridge actions, RBAC, Audit logging,
           and common.js helper functions.
   Framework: Jest + @cap-js/cds-test (SQLite in-memory)
   ──────────────────────────────────────────────────────────────── */

const cds = require('@sap/cds');
cds.test(__dirname + '/../..');

const PRIV    = { user: new cds.User.Privileged() };
function userCtx(id, roles) { return { user: new cds.User({ id, roles }) }; }
const ADMIN   = userCtx('admin',   ['Admin', 'BridgeManager', 'Viewer', 'Inspector', 'Operator']);
const MANAGER = userCtx('manager', ['BridgeManager', 'Viewer']);
const VIEWER  = userCtx('viewer',  ['Viewer']);

let srv, db;

function run(query, auth)  { return srv.tx(auth || PRIV, async () => srv.run(query)); }
function send(args, auth)  { return srv.tx(auth || PRIV, async () => srv.send(args)); }

// CDS v9 wraps @assert.range violations in a MULTIPLE_ERRORS wrapper.
// This helper checks both the top-level message and nested details.
function expectErrorMatching(promise, pattern) {
    return promise.then(
        () => { throw new Error('Expected rejection but resolved'); },
        (err) => {
            const msg = err.message || '';
            const details = (err.details || []).map(d => d.message || '').join(' ');
            const combined = msg + ' ' + details;
            expect(combined).toMatch(pattern);
        }
    );
}

// ── Unique ID helper to avoid conflicts between tests ──────────
const TS = Date.now();
let seq = 0;
function uid(prefix) { return `${prefix || 'T'}-${TS}-${++seq}`; }

// ── Minimal valid bridge payload ────────────────────────────────
function validBridge(overrides = {}) {
    return {
        bridgeId:    uid('BRG'),
        name:        `Test Bridge ${seq}`,
        state:       'QLD',
        region:      'South-East',
        condition:   'GOOD',
        latitude:    -27.47,
        longitude:   153.02,
        yearBuilt:   2005,
        ...overrides
    };
}

// Track created bridge IDs for cleanup
const createdBridgeUUIDs = [];

// ── Setup ───────────────────────────────────────────────────────
beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    db  = await cds.connect.to('db');
}, 30000);

afterAll(async () => {
    // Clean up test data
    if (createdBridgeUUIDs.length) {
        try {
            await db.tx(PRIV, async () => {
                for (const uuid of createdBridgeUUIDs) {
                    await db.run(DELETE.from('nhvr.BridgeConditionHistory').where({ bridge_ID: uuid }));
                    await db.run(DELETE.from('nhvr.BridgeEventLog').where({ bridge_ID: uuid }));
                    await db.run(DELETE.from('nhvr.Restriction').where({ bridge_ID: uuid }));
                    await db.run(DELETE.from('nhvr.Bridge').where({ ID: uuid }));
                }
            });
        } catch (e) { /* best-effort cleanup */ }
    }
});

// Helper: create a bridge and track its UUID
async function createBridge(overrides = {}, auth) {
    const data = validBridge(overrides);
    const _result = await run(INSERT.into('Bridges').entries(data), auth || ADMIN);
    // Fetch back to get UUID
    const bridge = await db.tx(PRIV, () =>
        db.run(SELECT.one.from('nhvr.Bridge').where({ bridgeId: data.bridgeId }))
    );
    if (bridge) createdBridgeUUIDs.push(bridge.ID);
    return bridge;
}

// ══════════════════════════════════════════════════════════════════
// SUITE 1: Bridge CREATE Validation (15 tests)
// ══════════════════════════════════════════════════════════════════
describe('Bridge CREATE Validation', () => {

    // TC-U-B-C01: Happy path
    test('TC-U-B-C01 — happy path creates bridge with UUID and defaults', async () => {
        const data = validBridge();
        await run(INSERT.into('Bridges').entries(data), ADMIN);
        const bridge = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').where({ bridgeId: data.bridgeId }))
        );
        expect(bridge).toBeTruthy();
        expect(bridge.ID).toBeTruthy();               // UUID generated
        expect(bridge.ID.length).toBe(36);             // UUID format
        expect(bridge.postingStatus).toBe('UNRESTRICTED'); // default
        expect(bridge.isActive).toBe(true);            // default
        createdBridgeUUIDs.push(bridge.ID);
    });

    // TC-U-B-C02: Missing bridgeId
    test('TC-U-B-C02 — missing bridgeId returns 400', async () => {
        const data = validBridge({ bridgeId: undefined });
        delete data.bridgeId;
        await expect(
            run(INSERT.into('Bridges').entries(data), ADMIN)
        ).rejects.toThrow();
    });

    // TC-U-B-C03: Missing name
    test('TC-U-B-C03 — missing name returns 400', async () => {
        const data = validBridge({ name: '' });
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(data), ADMIN),
            /name|ASSERT_MANDATORY|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C04: Duplicate bridgeId
    test('TC-U-B-C04 — duplicate bridgeId returns error', async () => {
        const sharedId = uid('DUP');
        await createBridge({ bridgeId: sharedId });
        await expect(
            run(INSERT.into('Bridges').entries(validBridge({ bridgeId: sharedId })), ADMIN)
        ).rejects.toThrow(/already exists|unique/i);
    });

    // TC-U-B-C05: Invalid latitude > 90
    test('TC-U-B-C05 — latitude > 90 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ latitude: 91 })), ADMIN),
            /latitude|range|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C06: Invalid latitude < -90
    test('TC-U-B-C06 — latitude < -90 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ latitude: -91 })), ADMIN),
            /latitude|range|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C07: Invalid longitude > 180
    test('TC-U-B-C07 — longitude > 180 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ longitude: 181 })), ADMIN),
            /longitude|range|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C08: Invalid condition enum
    test('TC-U-B-C08 — invalid condition enum returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ condition: 'TERRIBLE' })), ADMIN),
            /condition|must be one of|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C09: conditionRating > 10
    test('TC-U-B-C09 — conditionRating > 10 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ conditionRating: 11 })), ADMIN),
            /conditionRating|range|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C10: conditionRating < 1
    test('TC-U-B-C10 — conditionRating < 1 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ conditionRating: 0 })), ADMIN),
            /conditionRating|range|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C11: yearBuilt < 1800
    test('TC-U-B-C11 — yearBuilt < 1800 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ yearBuilt: 1799 })), ADMIN),
            /yearBuilt|Year.*Built|range|1800|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C12: yearBuilt > 2100
    test('TC-U-B-C12 — yearBuilt > 2100 returns 400', async () => {
        await expectErrorMatching(
            run(INSERT.into('Bridges').entries(validBridge({ yearBuilt: 2101 })), ADMIN),
            /yearBuilt|Year.*Built|range|2100|MULTIPLE_ERRORS/i
        );
    });

    // TC-U-B-C13: XSS payload stored as literal
    test('TC-U-B-C13 — XSS in name is stored as literal text', async () => {
        const xss = '<script>alert("xss")</script>';
        const bridge = await createBridge({ name: xss });
        expect(bridge).toBeTruthy();
        expect(bridge.name).toBe(xss); // stored as-is, not executed
    });

    // TC-U-B-C14: SQL fragment in bridgeId handled safely
    test('TC-U-B-C14 — SQL fragment in bridgeId handled safely', async () => {
        const sqlFrag = "'; DROP TABLE--";
        // Should either succeed (stored safely) or reject — never cause SQL error
        try {
            const bridge = await createBridge({ bridgeId: sqlFrag });
            expect(bridge).toBeTruthy();
            expect(bridge.bridgeId).toBe(sqlFrag);
        } catch (e) {
            // Rejected is also acceptable — key is no unhandled SQL error
            expect(e.message).not.toMatch(/SQLITE_ERROR|syntax error/i);
        }
    });

    // TC-U-B-C15: Unicode preserved
    test('TC-U-B-C15 — Unicode in name preserved exactly', async () => {
        const bridge = await createBridge({ name: 'Bridge 日本語 🌉' });
        expect(bridge).toBeTruthy();
        expect(bridge.name).toBe('Bridge 日本語 🌉');
    });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 2: Bridge Actions (8 tests)
// ══════════════════════════════════════════════════════════════════
describe('Bridge Actions', () => {
    let testBridgeUUID;

    beforeAll(async () => {
        const bridge = await createBridge({ condition: 'FAIR', conditionScore: 50 });
        testBridgeUUID = bridge.ID;
    });

    // TC-U-B-A01: changeCondition happy path
    test('TC-U-B-A01 — changeCondition sets new condition and score', async () => {
        const result = await send({
            event: 'changeCondition',
            entity: 'Bridges',
            data: { conditionValue: 'GOOD', score: 70 },
            params: [{ ID: testBridgeUUID }]
        }, ADMIN);
        expect(result).toBeTruthy();
        expect(result.condition).toBe('GOOD');
    });

    // TC-U-B-A02: changeCondition invalid condition
    test('TC-U-B-A02 — changeCondition with invalid condition returns 400', async () => {
        await expect(
            send({
                event: 'changeCondition',
                entity: 'Bridges',
                data: { conditionValue: 'BROKEN', score: 50 },
                params: [{ ID: testBridgeUUID }]
            }, ADMIN)
        ).rejects.toThrow(/invalid condition|must be one of/i);
    });

    // TC-U-B-A03: changeCondition score > 100
    test('TC-U-B-A03 — changeCondition with score > 100 returns 400', async () => {
        await expect(
            send({
                event: 'changeCondition',
                entity: 'Bridges',
                data: { conditionValue: 'GOOD', score: 101 },
                params: [{ ID: testBridgeUUID }]
            }, ADMIN)
        ).rejects.toThrow(/conditionScore|between 0 and 100/i);
    });

    // TC-U-B-A04: closeBridge sets CLOSED and writes audit
    test('TC-U-B-A04 — closeBridge sets postingStatus=CLOSED', async () => {
        const bridge = await createBridge({ condition: 'POOR' });
        const result = await send({
            event: 'closeBridge',
            entity: 'Bridges',
            data: {
                reason: 'Structural damage',
                effectiveFrom: '2026-04-01',
                expectedReopenDate: '2026-06-01',
                approvalRef: 'APR-001'
            },
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result.status).toBe('SUCCESS');

        // Verify bridge is now CLOSED
        const updated = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').columns('postingStatus').where({ ID: bridge.ID }))
        );
        expect(updated.postingStatus).toBe('CLOSED');
    });

    // TC-U-B-A05: reopenBridge after close restores status
    test('TC-U-B-A05 — reopenBridge after close restores status', async () => {
        const bridge = await createBridge({ postingStatus: 'CLOSED' });
        // Close it first via direct DB to guarantee CLOSED state
        await db.tx(PRIV, () =>
            db.run(UPDATE('nhvr.Bridge').set({ postingStatus: 'CLOSED' }).where({ ID: bridge.ID }))
        );
        const result = await send({
            event: 'reopenBridge',
            entity: 'Bridges',
            data: {
                reason: 'Repairs completed',
                effectiveDate: '2026-04-02',
                approvalRef: 'APR-002',
                inspectionRef: 'INS-001'
            },
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result.status).toBe('SUCCESS');
        expect(result.message).toMatch(/reopened/i);

        const updated = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').columns('postingStatus').where({ ID: bridge.ID }))
        );
        expect(updated.postingStatus).toBe('UNRESTRICTED');
    });

    // TC-U-B-A06: closeBridge on non-existent bridge returns 404
    test('TC-U-B-A06 — closeBridge on non-existent bridge returns 404', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        await expect(
            send({
                event: 'closeBridge',
                entity: 'Bridges',
                data: { reason: 'Test', effectiveFrom: '2026-01-01' },
                params: [{ ID: fakeId }]
            }, ADMIN)
        ).rejects.toThrow(/not found/i);
    });

    // TC-U-B-A07: closeForTraffic sets CLOSED
    test('TC-U-B-A07 — closeForTraffic sets postingStatus=CLOSED', async () => {
        const bridge = await createBridge();
        const result = await send({
            event: 'closeForTraffic',
            entity: 'Bridges',
            data: {},
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result).toBeTruthy();
        expect(result.postingStatus).toBe('CLOSED');
    });

    // TC-U-B-A08: reopenForTraffic sets UNRESTRICTED
    test('TC-U-B-A08 — reopenForTraffic restores appropriate status', async () => {
        const bridge = await createBridge();
        // Close first
        await send({
            event: 'closeForTraffic',
            entity: 'Bridges',
            data: {},
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        // Reopen
        const result = await send({
            event: 'reopenForTraffic',
            entity: 'Bridges',
            data: {},
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result).toBeTruthy();
        expect(result.postingStatus).toBe('UNRESTRICTED');
    });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 3: Role-Based Access Control (5 tests)
// ══════════════════════════════════════════════════════════════════
describe('Role-Based Access', () => {

    // TC-U-B-R01: Viewer cannot CREATE
    test('TC-U-B-R01 — Viewer cannot CREATE bridge', async () => {
        await expect(
            run(INSERT.into('Bridges').entries(validBridge()), VIEWER)
        ).rejects.toThrow();
    });

    // TC-U-B-R02: Viewer CAN READ
    test('TC-U-B-R02 — Viewer CAN READ bridges', async () => {
        const result = await run(SELECT.from('Bridges').limit(1), VIEWER);
        expect(result).toBeDefined();
        // Should not throw — read is allowed
    });

    // TC-U-B-R03: Manager CAN CREATE
    test('TC-U-B-R03 — Manager CAN CREATE bridge', async () => {
        const data = validBridge();
        await run(INSERT.into('Bridges').entries(data), MANAGER);
        const bridge = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').where({ bridgeId: data.bridgeId }))
        );
        expect(bridge).toBeTruthy();
        createdBridgeUUIDs.push(bridge.ID);
    });

    // TC-U-B-R04: Only Admin can DELETE
    test('TC-U-B-R04 — Manager cannot DELETE bridge', async () => {
        const bridge = await createBridge();
        await expect(
            run(DELETE.from('Bridges').where({ ID: bridge.ID }), MANAGER)
        ).rejects.toThrow();
    });

    // TC-U-B-R05: Viewer cannot call changeCondition
    test('TC-U-B-R05 — Viewer cannot call changeCondition', async () => {
        const bridge = await createBridge();
        await expect(
            send({
                event: 'changeCondition',
                entity: 'Bridges',
                data: { conditionValue: 'GOOD', score: 70 },
                params: [{ ID: bridge.ID }]
            }, VIEWER)
        ).rejects.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 4: Audit Logging (3 tests)
// ══════════════════════════════════════════════════════════════════
describe('Audit Logging', () => {

    // TC-U-B-AU01: CREATE generates AuditLog entry
    test('TC-U-B-AU01 — CREATE generates AuditLog with correct fields', async () => {
        const data = validBridge();
        await run(INSERT.into('Bridges').entries(data), ADMIN);

        const bridge = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').where({ bridgeId: data.bridgeId }))
        );
        createdBridgeUUIDs.push(bridge.ID);

        // Wait briefly for async audit log write
        await new Promise(r => setTimeout(r, 200));

        const logs = await db.tx(PRIV, () =>
            db.run(SELECT.from('nhvr.AuditLog').where({
                action: 'CREATE',
                entity: 'Bridges',
                entityId: data.bridgeId
            }))
        );
        expect(logs.length).toBeGreaterThanOrEqual(1);
        const log = logs[logs.length - 1];
        expect(log.userId).toBe('admin');
        expect(log.entityName).toBe(data.name);
        expect(log.description).toContain(data.name);
    });

    // TC-U-B-AU02: changeCondition generates ACTION audit log
    test('TC-U-B-AU02 — changeCondition generates audit log with action=ACTION', async () => {
        const bridge = await createBridge({ condition: 'FAIR' });

        await send({
            event: 'changeCondition',
            entity: 'Bridges',
            data: { conditionValue: 'POOR', score: 30 },
            params: [{ ID: bridge.ID }]
        }, ADMIN);

        await new Promise(r => setTimeout(r, 200));

        const logs = await db.tx(PRIV, () =>
            db.run(SELECT.from('nhvr.AuditLog').where({
                action: 'ACTION',
                entity: 'Bridges',
                entityId: bridge.bridgeId
            }))
        );
        expect(logs.length).toBeGreaterThanOrEqual(1);
        const log = logs[logs.length - 1];
        expect(log.description).toContain('POOR');
    });

    // TC-U-B-AU03: AuditLog is read-only via service
    test('TC-U-B-AU03 — AuditLog INSERT blocked via service', async () => {
        await expect(
            run(INSERT.into('AuditLogs').entries({
                userId: 'hacker',
                action: 'CREATE',
                entity: 'Fake',
                description: 'Injected record'
            }), ADMIN)
        ).rejects.toThrow();
    });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 5: Common Helpers (5 tests)
// ══════════════════════════════════════════════════════════════════
describe('Common Helpers (via integration)', () => {

    // TC-U-COM01: getBridge returns bridge by UUID (tested via changeCondition)
    test('TC-U-COM01 — getBridge resolves by UUID (changeCondition path)', async () => {
        const bridge = await createBridge({ condition: 'FAIR', conditionScore: 40 });
        // changeCondition internally calls getBridge — if it succeeds, getBridge works
        const result = await send({
            event: 'changeCondition',
            entity: 'Bridges',
            data: { conditionValue: 'GOOD', score: 70 },
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result).toBeTruthy();
        expect(result.condition).toBe('GOOD');
    });

    // TC-U-COM02: getBridge returns null for non-existent UUID (404 path)
    test('TC-U-COM02 — non-existent UUID returns 404', async () => {
        const fakeId = '11111111-1111-1111-1111-111111111111';
        await expect(
            send({
                event: 'changeCondition',
                entity: 'Bridges',
                data: { conditionValue: 'GOOD', score: 70 },
                params: [{ ID: fakeId }]
            }, ADMIN)
        ).rejects.toThrow(/not found/i);
    });

    // TC-U-COM03: getBridgeByKey works (tested via duplicate check path)
    test('TC-U-COM03 — duplicate bridgeId check uses getBridgeByKey path', async () => {
        const sharedId = uid('KEY');
        await createBridge({ bridgeId: sharedId });
        // Second create with same bridgeId triggers the duplicate check
        await expect(
            run(INSERT.into('Bridges').entries(validBridge({ bridgeId: sharedId })), ADMIN)
        ).rejects.toThrow(/already exists|unique/i);
    });

    // TC-U-COM04: updateBridgePostingStatus sets POSTED when restrictions exist
    test('TC-U-COM04 — posting status becomes POSTED after addRestriction', async () => {
        const bridge = await createBridge();
        expect(bridge.postingStatus).toBe('UNRESTRICTED');

        await send({
            event: 'addRestriction',
            entity: 'Bridges',
            data: {
                restrictionType: 'WEIGHT',
                value: 42.5,
                unit: 'tonnes',
                status: 'ACTIVE'
            },
            params: [{ ID: bridge.ID }]
        }, ADMIN);

        const updated = await db.tx(PRIV, () =>
            db.run(SELECT.one.from('nhvr.Bridge').columns('postingStatus').where({ ID: bridge.ID }))
        );
        expect(updated.postingStatus).toBe('POSTED');
    });

    // TC-U-COM05: updateBridgePostingStatus sets UNRESTRICTED when no active restrictions
    test('TC-U-COM05 — posting status is UNRESTRICTED with no active restrictions', async () => {
        const bridge = await createBridge();
        // reopenForTraffic calls updateBridgePostingStatus internally
        // and there are no restrictions, so result should be UNRESTRICTED
        const result = await send({
            event: 'reopenForTraffic',
            entity: 'Bridges',
            data: {},
            params: [{ ID: bridge.ID }]
        }, ADMIN);
        expect(result.postingStatus).toBe('UNRESTRICTED');
    });
});
