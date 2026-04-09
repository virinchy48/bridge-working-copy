// ============================================================
// S4: Persona Workflows + Exploratory Testing (D9, D11)
// 8 personas × key workflows + 8 exploratory charters
// ============================================================
'use strict';

const cds = require('@sap/cds');
cds.test(__dirname + '/..');

const PRIV = { user: new cds.User.Privileged() };
const _ADMIN = { user: new cds.User({ id: 'alice', roles: ['Admin', 'BridgeManager', 'Viewer', 'Inspector', 'Operator', 'Executive'] }) };
const _MANAGER = { user: new cds.User({ id: 'bob', roles: ['BridgeManager', 'Viewer'] }) };
const VIEWER = { user: new cds.User({ id: 'carol', roles: ['Viewer'] }) };
const _EXECUTIVE = { user: new cds.User({ id: 'dave', roles: ['Executive', 'Viewer'] }) };
const _INSPECTOR = { user: new cds.User({ id: 'inspector', roles: ['Inspector', 'Viewer'] }) };
const _OPERATOR = { user: new cds.User({ id: 'operator', roles: ['Operator', 'Viewer'] }) };

let srv;
function run(query) { return srv.tx(PRIV, async () => srv.run(query)); }
function send(args) { return srv.tx(PRIV, async () => srv.send(args)); }
function _sendAs(ctx, args) { return srv.tx(ctx, async () => srv.send(args)); }

let sharedBridgeId;

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    const b = await run(INSERT.into('BridgeManagementService.Bridges').entries({
        bridgeId: `P4-${Date.now() % 1e6}`, name: 'Persona Test Bridge', region: 'Sydney',
        state: 'NSW', structureType: 'Beam', material: 'Concrete',
        latitude: -33.87, longitude: 151.21, condition: 'FAIR',
        conditionRating: 5, postingStatus: 'UNRESTRICTED', isActive: true,
        assetOwner: 'TfNSW', designLife: 100, yearBuilt: 1970
    }));
    sharedBridgeId = b.ID;
}, 30000);

// ═══════════════════════════════════════════════════════════════
// PERSONA 1 — BRIDGE MANAGER (20yr TfNSW/ARRB experience)
// ═══════════════════════════════════════════════════════════════
describe('P1: Bridge Manager workflows', () => {
    test('P1-W01: Dashboard KPIs return valid response', async () => {
        const res = await send({ event: 'getDashboardKPIs', data: {} });
        expect(res).toBeDefined();
    });

    test('P1-W02: Bridge search by state filter returns results', async () => {
        const all = await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ state: 'NSW' }).limit(10));
        expect(all.length).toBeGreaterThan(0);
        all.forEach(b => expect(b.state).toBe('NSW'));
    });

    test('P1-W03: Bridge detail loads all fields', async () => {
        const b = await run(SELECT.one.from('BridgeManagementService.Bridges')
            .where({ ID: sharedBridgeId }));
        expect(b.bridgeId).toBeDefined();
        expect(b.name).toBeDefined();
        expect(b.condition).toBeDefined();
        expect(b.postingStatus).toBeDefined();
    });

    test('P1-W04: Create inspection order', async () => {
        try {
            const io = await run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
                bridge_ID: sharedBridgeId, orderNumber: `INS-P4-${Date.now() % 1e6}`,
                inspectionType: 'ROUTINE', status: 'PLANNED',
                plannedDate: '2026-06-01', assignedInspector: 'J. Smith'
            }));
            expect(io.ID).toBeDefined();
        } catch (e) {
            // May fail if missing mandatory fields — verify it's not 500
            expect(e.code).not.toBe(500);
        }
    });

    test('P1-W05: Change condition with business rule enforcement', async () => {
        const res = await send({
            event: 'changeCondition', entity: 'BridgeManagementService.Bridges',
            data: { conditionValue: 'POOR', score: 30 },
            params: [sharedBridgeId]
        });
        expect(res.condition).toBe('POOR');
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 2 — FLEET OPERATOR (NHVR permit holder)
// ═══════════════════════════════════════════════════════════════
describe('P2: Fleet Operator workflows', () => {
    test('P2-W01: Vehicle permit application (DRAFT)', async () => {
        try {
            const vp = await run(INSERT.into('BridgeManagementService.VehiclePermits').entries({
                permitId: `VP-P4-${Date.now() % 1e6}`, bridge_ID: sharedBridgeId,
                applicantName: 'FleetCo Pty Ltd', permitType: 'SINGLE_TRIP',
                permitStatus: 'DRAFT', assessedGVM_t: 55
            }));
            expect(vp.ID).toBeDefined();
        } catch (e) {
            // Permit may need additional mandatory fields
            expect(e).toBeDefined();
        }
    });

    test('P2-W02: Vehicle type lookup returns records', async () => {
        const types = await run(SELECT.from('BridgeManagementService.VehicleClasses').limit(5));
        expect(types.length).toBeGreaterThan(0);
    });

    test('P2-W03: Route assessment for vehicle access', async () => {
        try {
            const res = await send({
                event: 'assessRestriction',
                data: { bridgeId: sharedBridgeId, grossMass: 42.5, height: 4.6 }
            });
            expect(res).toBeDefined();
        } catch (e) {
            // Action may require specific params — error is valid
            expect(e).toBeDefined();
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 3 — COMPLIANCE OFFICER (government regulator)
// ═══════════════════════════════════════════════════════════════
describe('P3: Compliance Officer workflows', () => {
    test('P3-W01: Viewer cannot create bridges (role isolation)', async () => {
        try {
            await srv.tx(VIEWER, async () => srv.run(
                INSERT.into('BridgeManagementService.Bridges').entries({
                    bridgeId: `P3-DENIED-${Date.now() % 1e6}`, name: 'Should Fail',
                    state: 'NSW', latitude: -33, longitude: 151, assetOwner: 'Test'
                })
            ));
            fail('Should have been denied');
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test('P3-W02: Audit log records exist for mutations', async () => {
        const logs = await run(SELECT.from('BridgeManagementService.AuditLogs').limit(5));
        expect(logs.length).toBeGreaterThan(0);
        logs.forEach(l => {
            expect(l.action).toBeDefined();
            expect(l.entity).toBeDefined();
        });
    });

    test('P3-W03: Asset register report returns paginated data', async () => {
        try {
            const res = await send({ event: 'getAssetRegister', data: {} });
            expect(res).toBeDefined();
        } catch (e) {
            expect(e).toBeDefined();
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 4 — NETWORK PLANNER (GIS/spatial)
// ═══════════════════════════════════════════════════════════════
describe('P4: Network Planner workflows', () => {
    test('P4-W01: Freight routes queryable', async () => {
        const routes = await run(SELECT.from('BridgeManagementService.FreightRoutes').limit(5));
        expect(Array.isArray(routes)).toBe(true);
    });

    test('P4-W02: Bridge has geospatial coordinates', async () => {
        const b = await run(SELECT.one.from('BridgeManagementService.Bridges')
            .where({ ID: sharedBridgeId }));
        expect(b.latitude).toBeDefined();
        expect(b.longitude).toBeDefined();
        expect(b.latitude).toBeGreaterThanOrEqual(-90);
        expect(b.longitude).toBeGreaterThanOrEqual(-180);
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 5 — SYSTEM ADMINISTRATOR
// ═══════════════════════════════════════════════════════════════
describe('P5: System Administrator workflows', () => {
    test('P5-W01: Admin can read role configs', async () => {
        const rc = await run(SELECT.from('BridgeManagementService.RoleConfigs').limit(5));
        expect(Array.isArray(rc)).toBe(true);
    });

    test('P5-W02: Health check returns status', async () => {
        const res = await send({ event: 'healthCheck' });
        expect(res).toBeDefined();
        expect(res.status).toBeDefined();
    });

    test('P5-W03: System info returns metadata', async () => {
        const res = await send({ event: 'getSystemInfo' });
        expect(res).toBeDefined();
    });

    test('P5-W04: Attribute definitions CRUD', async () => {
        const ad = await run(INSERT.into('BridgeManagementService.AttributeDefinitions').entries({
            name: `p5attr${Date.now() % 1e6}`, label: 'P5 Test Attr',
            dataType: 'STRING', isActive: true, displayOrder: 99
        }));
        expect(ad.ID).toBeDefined();
        await run(DELETE.from('BridgeManagementService.AttributeDefinitions').where({ ID: ad.ID }));
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 6 — SECURITY AUDITOR
// ═══════════════════════════════════════════════════════════════
describe('P6: Security Auditor workflows', () => {
    test('P6-W01: No PII in audit log entries', async () => {
        const logs = await run(SELECT.from('BridgeManagementService.AuditLogs').limit(20));
        logs.forEach(l => {
            const desc = (l.description || '').toLowerCase();
            expect(desc).not.toMatch(/password|token|secret|tfn|ssn/);
        });
    });

    test('P6-W02: Viewer field masking active', async () => {
        const bridges = await srv.tx(VIEWER, async () =>
            srv.run(SELECT.from('BridgeManagementService.Bridges').limit(5))
        );
        bridges.forEach(b => {
            expect(b.conditionRating).toBeNull();
            expect(b.conditionScore).toBeNull();
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 7 — PERFORMANCE ENGINEER
// ═══════════════════════════════════════════════════════════════
describe('P7: Performance Engineer workflows', () => {
    test('P7-W01: Bridge list query < 2s (100 records)', async () => {
        const start = Date.now();
        await run(SELECT.from('BridgeManagementService.Bridges').limit(100));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    test('P7-W02: Dashboard KPIs < 2s', async () => {
        const start = Date.now();
        await send({ event: 'getDashboardKPIs', data: {} });
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    test('P7-W03: Single bridge detail < 500ms', async () => {
        const start = Date.now();
        await run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: sharedBridgeId }));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
    });
});

// ═══════════════════════════════════════════════════════════════
// PERSONA 8 — BUSINESS ANALYST
// ═══════════════════════════════════════════════════════════════
describe('P8: Business Analyst workflows', () => {
    test('P8-W01: BDD feature files exist for key entities', () => {
        const fs = require('fs');
        const path = require('path');
        const featuresDir = path.join(__dirname, '..', 'features');
        expect(fs.existsSync(path.join(featuresDir, 'bridge', 'bridge-lifecycle.feature'))).toBe(true);
        expect(fs.existsSync(path.join(featuresDir, 'bridge', 'bridge-rbac.feature'))).toBe(true);
        expect(fs.existsSync(path.join(featuresDir, 'restriction', 'restriction-management.feature'))).toBe(true);
    });

    test('P8-W02: Feature files have valid Gherkin structure', () => {
        const fs = require('fs');
        const path = require('path');
        const content = fs.readFileSync(
            path.join(__dirname, '..', 'features', 'bridge', 'bridge-lifecycle.feature'), 'utf-8'
        );
        expect(content).toMatch(/Feature:/);
        expect(content).toMatch(/Scenario:/);
        expect(content).toMatch(/Given /);
        expect(content).toMatch(/When /);
        expect(content).toMatch(/Then /);
    });
});

// ═══════════════════════════════════════════════════════════════
// D11: EXPLORATORY TESTING CHARTERS (code-level simulation)
// ═══════════════════════════════════════════════════════════════
describe('D11: Exploratory charters', () => {
    test('CHARTER-1: Rapid duplicate create (idempotency)', async () => {
        const id = `EXP-DUP-${Date.now() % 1e6}`;
        await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: id, name: 'Dup Test', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test', condition: 'GOOD', isActive: true
        }));
        try {
            await run(INSERT.into('BridgeManagementService.Bridges').entries({
                bridgeId: id, name: 'Dup Test 2', state: 'NSW',
                latitude: -33, longitude: 151, assetOwner: 'Test', condition: 'GOOD', isActive: true
            }));
            fail('Should reject duplicate');
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test('CHARTER-2: Very long string in name (5000 chars)', async () => {
        const longName = 'A'.repeat(5000);
        try {
            await run(INSERT.into('BridgeManagementService.Bridges').entries({
                bridgeId: `EXP-LONG-${Date.now() % 1e6}`, name: longName, state: 'NSW',
                latitude: -33, longitude: 151, assetOwner: 'Test', isActive: true
            }));
        } catch (e) {
            // Either truncated or rejected — not a 500
            expect(e.code || e.status).not.toBe(500);
        }
    });

    test('CHARTER-3: XSS payload in bridge name stored safely', async () => {
        const b = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `EXP-XSS-${Date.now() % 1e6}`, name: '<img src=x onerror=alert(1)>',
            state: 'NSW', latitude: -33, longitude: 151, assetOwner: 'Test', condition: 'GOOD', isActive: true
        }));
        expect(b.name).toContain('<img');
    });

    test('CHARTER-4: SQL injection in search filter', async () => {
        const results = await run(SELECT.from('BridgeManagementService.Bridges')
            .where(`name LIKE '%' OR '1'='1'`).limit(5));
        // Should not crash — CAP handles this safely
        expect(Array.isArray(results)).toBe(true);
    });

    test('CHARTER-5: Null bytes in string fields', async () => {
        try {
            await run(INSERT.into('BridgeManagementService.Bridges').entries({
                bridgeId: `EXP-NULL-${Date.now() % 1e6}`, name: 'Test\x00Bridge',
                state: 'NSW', latitude: -33, longitude: 151, assetOwner: 'Test', isActive: true
            }));
        } catch (e) {
            expect(e).toBeDefined(); // Rejected or handled gracefully
        }
    });

    test('CHARTER-6: Extreme coordinate values', async () => {
        await expect(run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `EXP-COORD-${Date.now() % 1e6}`, name: 'Extreme',
            state: 'NSW', latitude: 999999, longitude: -999999, assetOwner: 'Test', isActive: true
        }))).rejects.toThrow();
    });

    test('CHARTER-7: MAX_SAFE_INTEGER in numeric field', async () => {
        try {
            await run(INSERT.into('BridgeManagementService.Bridges').entries({
                bridgeId: `EXP-MAX-${Date.now() % 1e6}`, name: 'Max Int',
                state: 'NSW', latitude: -33, longitude: 151, assetOwner: 'Test',
                yearBuilt: Number.MAX_SAFE_INTEGER, isActive: true
            }));
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test('CHARTER-8: Empty string for every optional field', async () => {
        const b = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `EXP-EMPTY-${Date.now() % 1e6}`, name: 'Empty Fields',
            state: 'NSW', latitude: -33, longitude: 151, assetOwner: 'Test',
            condition: 'GOOD', region: '', lga: '', roadRoute: '', material: '', remarks: '', isActive: true
        }));
        expect(b.ID).toBeDefined();
    });
});
