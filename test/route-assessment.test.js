// ============================================================
// NHVR Phase 7.2 — Route Assessment Action Tests
// 6 suites | 22 tests
// Run: npm test -- --testPathPattern=route-assessment
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

function _run(query) {
    return srv.tx(PRIV, async () => srv.run(query));
}

function send(args) {
    return srv.tx(PRIV, async () => srv.send(args));
}

async function getDb() {
    return cds.connect.to('db');
}

// ─────────────────────────────────────────────────────────────
// Test data IDs
// ─────────────────────────────────────────────────────────────
let testBridgeIds   = [];
let testRouteId;
let testCapacityIds = [];
let testRestrId;

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    const db = await getDb();

    // ── Create test bridges ──────────────────────────────────
    const b1Id = cds.utils.uuid();
    const b2Id = cds.utils.uuid();
    const b3Id = cds.utils.uuid();
    testBridgeIds = [b1Id, b2Id, b3Id];

    await db.run(INSERT.into('nhvr.Bridge').entries([
        {
            ID: b1Id, bridgeId: 'RA-B001', name: 'RA Test Bridge 1',
            state: 'NSW', latitude: -33.80, longitude: 151.20,
            condition: 'GOOD', conditionRating: 8,
            postingStatus: 'UNRESTRICTED', isActive: true
        },
        {
            ID: b2Id, bridgeId: 'RA-B002', name: 'RA Test Bridge 2',
            state: 'NSW', latitude: -33.81, longitude: 151.21,
            condition: 'POOR', conditionRating: 3,
            postingStatus: 'POSTED', isActive: true
        },
        {
            ID: b3Id, bridgeId: 'RA-B003', name: 'RA Test Bridge Closed',
            state: 'NSW', latitude: -33.82, longitude: 151.22,
            condition: 'CRITICAL', conditionRating: 1,
            postingStatus: 'CLOSED', isActive: true
        }
    ]));

    // ── Create bridge capacities ─────────────────────────────
    const c1Id = cds.utils.uuid();
    const c2Id = cds.utils.uuid();
    testCapacityIds = [c1Id, c2Id];

    await db.run(INSERT.into('nhvr.BridgeCapacity').entries([
        {
            ID: c1Id, bridge_ID: b1Id,
            grossMassLimit_t: 42.5, minVerticalClearance_m: 5.0,
            trafficableWidth_m: 8.0, capacityStatus: 'FULL'
        },
        {
            ID: c2Id, bridge_ID: b2Id,
            grossMassLimit_t: 30.0, minVerticalClearance_m: 4.2,
            trafficableWidth_m: 6.0, capacityStatus: 'RESTRICTED'
        }
    ]));

    // ── Create an active restriction on bridge 2 ─────────────
    testRestrId = cds.utils.uuid();
    await db.run(INSERT.into('nhvr.Restriction').entries({
        ID: testRestrId, bridge_ID: b2Id,
        restrictionType: 'GROSS_MASS', value: 25.0, unit: 't',
        status: 'ACTIVE', isActive: true
    }));

    // ── Create freight route + bridge links ──────────────────
    testRouteId = cds.utils.uuid();
    await db.run(INSERT.into('nhvr.FreightRoute').entries({
        ID: testRouteId, routeCode: 'RA-TEST-01',
        name: 'Test Assessment Route', state: 'NSW',
        routeClass: 'GENERAL', status: 'ACTIVE'
    }));

    const fb1Id = cds.utils.uuid();
    const fb2Id = cds.utils.uuid();
    await db.run(INSERT.into('nhvr.FreightRouteBridge').entries([
        { ID: fb1Id, route_ID: testRouteId, bridge_ID: b1Id, sequence: 1 },
        { ID: fb2Id, route_ID: testRouteId, bridge_ID: b2Id, sequence: 2 }
    ]));
}, 30000);

afterAll(async () => {
    try {
        const db = await getDb();
        await db.run(DELETE.from('nhvr.FreightRouteBridge').where({ route_ID: testRouteId }));
        await db.run(DELETE.from('nhvr.FreightRoute').where({ ID: testRouteId }));
        await db.run(DELETE.from('nhvr.Restriction').where({ ID: testRestrId }));
        for (const id of testCapacityIds) {
            await db.run(DELETE.from('nhvr.BridgeCapacity').where({ ID: id }));
        }
        for (const id of testBridgeIds) {
            await db.run(DELETE.from('nhvr.Bridge').where({ ID: id }));
        }
    } catch (e) { /* best-effort cleanup */ }
});


// ═════════════════════════════════════════════════════════════
// SUITE 1 — assessCorridor
// ═════════════════════════════════════════════════════════════
describe('1. assessCorridor', () => {

    test('1.1 returns corridor stats for valid route', async () => {
        const result = await send({
            event: 'assessCorridor',
            data: { routeId: testRouteId }
        });
        expect(result).toBeDefined();
        expect(result.bridgeCount).toBe(2);
        expect(typeof result.criticalBridges).toBe('number');
    });

    test('1.2 returns null corridorMaxMass when no LoadRating records exist', async () => {
        // Our test bridges have no LoadRating rows, so corridorMaxMass should be null
        const result = await send({
            event: 'assessCorridor',
            data: { routeId: testRouteId }
        });
        expect(result.corridorMaxMass).toBeNull();
    });

    test('1.3 rejects route with no bridges', async () => {
        const db = await getDb();
        const emptyRouteId = cds.utils.uuid();
        await db.run(INSERT.into('nhvr.FreightRoute').entries({
            ID: emptyRouteId, routeCode: 'RA-EMPTY-01',
            name: 'Empty Route', state: 'NSW',
            routeClass: 'GENERAL', status: 'ACTIVE'
        }));

        await expect(
            send({ event: 'assessCorridor', data: { routeId: emptyRouteId } })
        ).rejects.toThrow(/No bridges/i);

        // Cleanup
        await db.run(DELETE.from('nhvr.FreightRoute').where({ ID: emptyRouteId }));
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 2 — assessFreightRouteVehicle — happy paths
// ═════════════════════════════════════════════════════════════
describe('2. assessFreightRouteVehicle — verdicts', () => {

    test('2.1 small vehicle within all limits returns APPROVED or APPROVED_WITH_CONDITIONS', async () => {
        // Vehicle GVM 20t, height 3.5m — well within bridge 1 (42.5t, 5.0m)
        // Bridge 2 has POSTED status so route may get CONDITIONS
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: testRouteId,
                vehicleGVM_t: 20,
                vehicleHeight_m: 3.5,
                vehicleWidth_m: 3.0,
                vehicleLength_m: 19
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result).toBeDefined();
        expect(result.routeVerdict).toBeDefined();
        // Bridge 2 is POSTED so conditions are expected at minimum
        expect(['APPROVED', 'APPROVED_WITH_CONDITIONS']).toContain(result.routeVerdict);
        expect(result.bridges).toBeDefined();
        expect(result.bridges.length).toBe(2);
    });

    test('2.2 vehicle exceeding bridge 2 mass limit returns REFUSED', async () => {
        // Vehicle GVM 50t exceeds bridge 2 effective limit (25t restriction)
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: testRouteId,
                vehicleGVM_t: 50,
                vehicleHeight_m: 3.5,
                vehicleWidth_m: 3.0
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result.routeVerdict).toBe('REFUSED');
        expect(result.limitingAsset).toBeDefined();
        // The limiting bridge should be RA-B002 (25t restriction)
        expect(result.limitingAsset).toBe('RA-B002');
    });

    test('2.3 vehicle close to mass limit generates CONDITIONS warning', async () => {
        // Vehicle GVM 41.5t on 42.5t bridge 1 → margin 1.0t < 2t threshold
        // But bridge 2 has 25t restriction so 41.5t will fail there → REFUSED
        // To test CONDITIONS we need a vehicle that passes everything but triggers a margin warning
        // Use GVM 24t: passes bridge 2 restriction (25t) with 1t margin < 2t threshold
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: testRouteId,
                vehicleGVM_t: 24,
                vehicleHeight_m: 3.5,
                vehicleWidth_m: 3.0
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // Bridge 2 is POSTED and mass margin is tight → expect CONDITIONS at least
        expect(['APPROVED_WITH_CONDITIONS', 'REFUSED']).toContain(result.routeVerdict);
        // Check that bridge results contain warnings
        const b2Result = result.bridges.find(b => b.bridgeId === 'RA-B002');
        expect(b2Result).toBeDefined();
        expect(b2Result.warnings.length + b2Result.issues.length).toBeGreaterThan(0);
    });

    test('2.4 returns per-bridge detail in results', async () => {
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: testRouteId,
                vehicleGVM_t: 20,
                vehicleHeight_m: 3.0,
                vehicleWidth_m: 2.5
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result.summary).toBeDefined();
        expect(typeof result.summary.total).toBe('number');
        expect(typeof result.summary.passing).toBe('number');
        expect(typeof result.summary.failing).toBe('number');
        // Each bridge result should have verdict + issues + warnings
        for (const b of result.bridges) {
            expect(b.verdict).toBeDefined();
            expect(['PASS', 'FAIL', 'CONDITIONS']).toContain(b.verdict);
            expect(Array.isArray(b.issues)).toBe(true);
            expect(Array.isArray(b.warnings)).toBe(true);
        }
    });

    test('2.5 vehicle config is echoed back in response', async () => {
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: testRouteId,
                vehicleGVM_t: 25,
                vehicleHeight_m: 4.0,
                vehicleWidth_m: 3.0,
                vehicleLength_m: 19,
                crossingSpeed: 60,
                vehicleClass: 'B_DOUBLE'
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result.vehicleConfig).toBeDefined();
        expect(result.vehicleConfig.gvm).toBe(25);
        expect(result.vehicleConfig.height).toBe(4);
        expect(result.vehicleConfig.vehicleClass).toBe('B_DOUBLE');
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 3 — assessFreightRouteVehicle — closed bridge handling
// ═════════════════════════════════════════════════════════════
describe('3. assessFreightRouteVehicle — closed bridge', () => {

    let closedRouteId;

    beforeAll(async () => {
        // Create a route that includes the CLOSED bridge (b3)
        const db = await getDb();
        closedRouteId = cds.utils.uuid();
        await db.run(INSERT.into('nhvr.FreightRoute').entries({
            ID: closedRouteId, routeCode: 'RA-CLOSED-01',
            name: 'Closed Bridge Route', state: 'NSW',
            routeClass: 'GENERAL', status: 'ACTIVE'
        }));
        const fb1 = cds.utils.uuid();
        const fb2 = cds.utils.uuid();
        await db.run(INSERT.into('nhvr.FreightRouteBridge').entries([
            { ID: fb1, route_ID: closedRouteId, bridge_ID: testBridgeIds[0], sequence: 1 },
            { ID: fb2, route_ID: closedRouteId, bridge_ID: testBridgeIds[2], sequence: 2 }
        ]));
    });

    afterAll(async () => {
        try {
            const db = await getDb();
            await db.run(DELETE.from('nhvr.FreightRouteBridge').where({ route_ID: closedRouteId }));
            await db.run(DELETE.from('nhvr.FreightRoute').where({ ID: closedRouteId }));
        } catch (e) { /* cleanup */ }
    });

    test('3.1 route with CLOSED bridge returns REFUSED', async () => {
        const raw = await send({
            event: 'assessFreightRouteVehicle',
            data: {
                routeId: closedRouteId,
                vehicleGVM_t: 10,
                vehicleHeight_m: 3.0,
                vehicleWidth_m: 2.5
            }
        });
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result.routeVerdict).toBe('REFUSED');
        // The closed bridge should show as FAIL
        const closedBridge = result.bridges.find(b => b.bridgeId === 'RA-B003');
        expect(closedBridge).toBeDefined();
        expect(closedBridge.verdict).toBe('FAIL');
        expect(closedBridge.isClosed).toBe(true);
        expect(closedBridge.issues.some(i => /CLOSED/i.test(i))).toBe(true);
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 4 — assessFreightRouteVehicle — input validation
// ═════════════════════════════════════════════════════════════
describe('4. Vehicle dimension validation', () => {

    test('4.1 rejects negative GVM', async () => {
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: testRouteId, vehicleGVM_t: -5 }
            })
        ).rejects.toThrow(/GVM must be between 0 and 500/);
    });

    test('4.2 rejects GVM over 500t', async () => {
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: testRouteId, vehicleGVM_t: 501 }
            })
        ).rejects.toThrow(/GVM must be between 0 and 500/);
    });

    test('4.3 rejects height over 10m', async () => {
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: testRouteId, vehicleGVM_t: 20, vehicleHeight_m: 11 }
            })
        ).rejects.toThrow(/height must be between 0 and 10/);
    });

    test('4.4 rejects width over 10m', async () => {
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: testRouteId, vehicleGVM_t: 20, vehicleWidth_m: 11 }
            })
        ).rejects.toThrow(/width must be between 0 and 10/);
    });

    test('4.5 rejects length over 60m', async () => {
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: testRouteId, vehicleGVM_t: 20, vehicleLength_m: 65 }
            })
        ).rejects.toThrow(/length must be between 0 and 60/);
    });

    test('4.6 rejects non-existent route', async () => {
        const fakeId = cds.utils.uuid();
        await expect(
            send({
                event: 'assessFreightRouteVehicle',
                data: { routeId: fakeId, vehicleGVM_t: 20 }
            })
        ).rejects.toThrow(/Route not found/i);
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 5 — validateRoute (pre-trip validation API)
// ═════════════════════════════════════════════════════════════
describe('5. validateRoute', () => {

    test('5.1 rejects missing routeGeometry', async () => {
        await expect(
            send({
                event: 'validateRoute',
                data: { vehicleGVM_t: 20 }
            })
        ).rejects.toThrow(/routeGeometry is required/);
    });

    test('5.2 rejects missing vehicleGVM_t', async () => {
        await expect(
            send({
                event: 'validateRoute',
                data: {
                    routeGeometry: JSON.stringify([[151.20, -33.80], [151.21, -33.81]])
                }
            })
        ).rejects.toThrow(/vehicleGVM_t is required/);
    });

    test('5.3 rejects zero vehicleGVM_t', async () => {
        await expect(
            send({
                event: 'validateRoute',
                data: {
                    routeGeometry: JSON.stringify([[151.20, -33.80], [151.21, -33.81]]),
                    vehicleGVM_t: 0
                }
            })
        ).rejects.toThrow(/vehicleGVM_t is required/);
    });

    test('5.4 accepts valid geometry and GVM and returns assessment', async () => {
        // Coordinates near our test bridges
        const raw = await send({
            event: 'validateRoute',
            data: {
                routeGeometry: JSON.stringify([
                    [151.20, -33.80],
                    [151.21, -33.81],
                    [151.22, -33.82]
                ]),
                vehicleGVM_t: 20,
                vehicleHeight_m: 3.5,
                vehicleWidth_m: 3.0
            }
        });
        // validateRoute delegates to assessRouteGeometry which returns a JSON string
        const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(result).toBeDefined();
        // Should contain at minimum the vehicle config and assessed timestamp
        expect(result.vehicleConfig).toBeDefined();
        expect(result.assessedAt).toBeDefined();
    });
});


// ═════════════════════════════════════════════════════════════
// SUITE 6 — assessRouteGeometry — input validation
// ═════════════════════════════════════════════════════════════
describe('6. assessRouteGeometry input validation', () => {

    test('6.1 rejects missing routeCoords', async () => {
        await expect(
            send({
                event: 'assessRouteGeometry',
                data: { vehicleGVM_t: 20 }
            })
        ).rejects.toThrow(/routeCoords is required/);
    });

    test('6.2 rejects invalid JSON in routeCoords', async () => {
        await expect(
            send({
                event: 'assessRouteGeometry',
                data: { routeCoords: 'not-json', vehicleGVM_t: 20 }
            })
        ).rejects.toThrow(/valid JSON/);
    });

    test('6.3 rejects routeCoords with fewer than 2 coordinate pairs', async () => {
        await expect(
            send({
                event: 'assessRouteGeometry',
                data: {
                    routeCoords: JSON.stringify([[151.20, -33.80]]),
                    vehicleGVM_t: 20
                }
            })
        ).rejects.toThrow(/at least 2 coordinate pairs/);
    });

    test('6.4 rejects negative GVM via assessRouteGeometry', async () => {
        await expect(
            send({
                event: 'assessRouteGeometry',
                data: {
                    routeCoords: JSON.stringify([[151.20, -33.80], [151.21, -33.81]]),
                    vehicleGVM_t: -10
                }
            })
        ).rejects.toThrow(/GVM must be between 0 and 500/);
    });
});
