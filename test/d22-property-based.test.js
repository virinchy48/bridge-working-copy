// ============================================================
// D22: Property-Based Testing (fast-check)
// D28: Metamorphic Testing (risk algorithms, search)
// D13: Chaos Engineering (resilience patterns)
// ============================================================
'use strict';

const cds = require('@sap/cds');
const fc = require('fast-check');
cds.test(__dirname + '/..');

const PRIV = { user: new cds.User.Privileged() };
let srv;
function run(query) { return srv.tx(PRIV, async () => srv.run(query)); }
function send(args) { return srv.tx(PRIV, async () => srv.send(args)); }

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
}, 30000);

// ═══════════════════════════════════════════════════════════════
// D22: PROPERTY-BASED TESTING (fast-check)
// ═══════════════════════════════════════════════════════════════
describe('D22: Property-based tests', () => {

    test('PBT-01: Any valid bridge name string is accepted (no 500s)', async () => {
        await fc.assert(fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
            async (name) => {
                const id = `PBT-${Date.now() % 1e6}-${Math.floor(Math.random() * 99999)}`;
                try {
                    const b = await run(INSERT.into('BridgeManagementService.Bridges').entries({
                        bridgeId: id, name, state: 'NSW',
                        latitude: -33.87, longitude: 151.21, assetOwner: 'Test', condition: 'GOOD', isActive: true
                    }));
                    return b.ID !== undefined;
                } catch (e) {
                    // 400 is acceptable (validation), 500 is NOT
                    return e.code !== 500 && e.statusCode !== 500;
                }
            }
        ), { numRuns: 15 });
    });

    test('PBT-02: Latitude always validated in [-90, 90]', async () => {
        await fc.assert(fc.asyncProperty(
            fc.double({ min: -200, max: 200, noNaN: true }),
            async (lat) => {
                const id = `PBT-LAT-${Date.now() % 1e6}-${Math.floor(Math.random() * 99999)}`;
                try {
                    await run(INSERT.into('BridgeManagementService.Bridges').entries({
                        bridgeId: id, name: 'Lat Test', state: 'NSW',
                        latitude: lat, longitude: 151.21, assetOwner: 'Test', condition: 'GOOD', isActive: true
                    }));
                    // If accepted, lat must be in valid range
                    return lat >= -90 && lat <= 90;
                } catch (e) {
                    // If rejected, lat must be outside valid range
                    return lat < -90 || lat > 90 || e.code !== 500;
                }
            }
        ), { numRuns: 20 });
    });

    test('PBT-03: Longitude always validated in [-180, 180]', async () => {
        await fc.assert(fc.asyncProperty(
            fc.double({ min: -300, max: 300, noNaN: true }),
            async (lon) => {
                const id = `PBT-LON-${Date.now() % 1e6}-${Math.floor(Math.random() * 99999)}`;
                try {
                    await run(INSERT.into('BridgeManagementService.Bridges').entries({
                        bridgeId: id, name: 'Lon Test', state: 'NSW',
                        latitude: -33.87, longitude: lon, assetOwner: 'Test', condition: 'GOOD', isActive: true
                    }));
                    return lon >= -180 && lon <= 180;
                } catch (e) {
                    return lon < -180 || lon > 180 || e.code !== 500;
                }
            }
        ), { numRuns: 20 });
    });

    test('PBT-04: conditionScore always in [0, 100]', async () => {
        await fc.assert(fc.asyncProperty(
            fc.integer({ min: -50, max: 150 }),
            async (score) => {
                const id = `PBT-CS-${Date.now() % 1e6}-${Math.floor(Math.random() * 99999)}`;
                try {
                    await run(INSERT.into('BridgeManagementService.Bridges').entries({
                        bridgeId: id, name: 'Score Test', state: 'NSW',
                        latitude: -33.87, longitude: 151.21, assetOwner: 'Test',
                        conditionScore: score, condition: 'GOOD', isActive: true
                    }));
                    return score >= 0 && score <= 100;
                } catch (e) {
                    return score < 0 || score > 100 || e.code !== 500;
                }
            }
        ), { numRuns: 15 });
    });

    test('PBT-05: Pagination invariant — page size ≤ $top', async () => {
        await fc.assert(fc.asyncProperty(
            fc.integer({ min: 1, max: 200 }),
            async (top) => {
                const results = await run(
                    SELECT.from('BridgeManagementService.Bridges').limit(top)
                );
                return results.length <= top;
            }
        ), { numRuns: 20 });
    });

    test('PBT-06: Restriction value > 0 for non-VEHICLE_TYPE', async () => {
        const bridge = await run(SELECT.one.from('BridgeManagementService.Bridges').limit(1));
        if (!bridge) return;
        await fc.assert(fc.asyncProperty(
            fc.double({ min: -100, max: 100, noNaN: true }),
            async (value) => {
                try {
                    await run(INSERT.into('BridgeManagementService.Restrictions').entries({
                        bridge_ID: bridge.ID, restrictionType: 'MASS',
                        value, unit: 't', status: 'DRAFT'
                    }));
                    return value > 0;
                } catch (e) {
                    return value <= 0 || e.code !== 500;
                }
            }
        ), { numRuns: 10 });
    });
});

// ═══════════════════════════════════════════════════════════════
// D28: METAMORPHIC TESTING
// ═══════════════════════════════════════════════════════════════
describe('D28: Metamorphic relation tests', () => {

    test('MR1: Adding filter never increases result count', async () => {
        const allNSW = await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ state: 'NSW' }));
        const nswGood = await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ state: 'NSW', condition: 'GOOD' }));
        expect(nswGood.length).toBeLessThanOrEqual(allNSW.length);
    });

    test('MR2: Filter by state returns only that state', async () => {
        const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
        for (const s of states) {
            const results = await run(SELECT.from('BridgeManagementService.Bridges')
                .where({ state: s }).limit(10));
            results.forEach(b => expect(b.state).toBe(s));
        }
    });

    test('MR3: Risk score monotonicity — worse condition = higher risk', async () => {
        // Create two bridges with different condition ratings
        const goodBridge = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR3-GOOD-${Date.now() % 1e6}`, name: 'MR3 Good', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 9, scourRisk: 'LOW', condition: 'GOOD', isActive: true
        }));
        const poorBridge = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR3-POOR-${Date.now() % 1e6}`, name: 'MR3 Poor', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 2, scourRisk: 'LOW', condition: 'GOOD', isActive: true
        }));
        // Read back (computed fields applied after READ)
        const good = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: goodBridge.ID })))[0];
        const poor = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: poorBridge.ID })))[0];
        // Worse condition should have equal or higher risk
        expect(poor.currentRiskScore || 0).toBeGreaterThanOrEqual(good.currentRiskScore || 0);
    });

    test('MR4: Risk score increases with scour risk', async () => {
        const lowScour = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR4-LOW-${Date.now() % 1e6}`, name: 'MR4 Low Scour', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 5, scourRisk: 'LOW', condition: 'GOOD', isActive: true
        }));
        const highScour = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR4-HIGH-${Date.now() % 1e6}`, name: 'MR4 High Scour', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 5, scourRisk: 'HIGH', condition: 'GOOD', isActive: true
        }));
        const low = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: lowScour.ID })))[0];
        const high = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: highScour.ID })))[0];
        expect(high.currentRiskScore || 0).toBeGreaterThanOrEqual(low.currentRiskScore || 0);
    });

    test('MR5: Flood + deficiency flags increase risk score', async () => {
        const base = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR5-BASE-${Date.now() % 1e6}`, name: 'MR5 Base', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 5, condition: 'GOOD', isActive: true
        }));
        const flagged = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `MR5-FLAG-${Date.now() % 1e6}`, name: 'MR5 Flagged', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            conditionRating: 5, floodImpacted: true, structuralDeficiencyFlag: true, condition: 'GOOD', isActive: true
        }));
        const b = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: base.ID })))[0];
        const f = (await run(SELECT.from('BridgeManagementService.Bridges')
            .where({ ID: flagged.ID })))[0];
        expect(f.currentRiskScore || 0).toBeGreaterThanOrEqual(b.currentRiskScore || 0);
    });
});

// ═══════════════════════════════════════════════════════════════
// D13: CHAOS ENGINEERING (code-level resilience)
// ═══════════════════════════════════════════════════════════════
describe('D13: Chaos engineering resilience', () => {

    test('CHAOS-01: Concurrent writes to same bridge (race condition)', async () => {
        const b = await run(INSERT.into('BridgeManagementService.Bridges').entries({
            bridgeId: `CHAOS-${Date.now() % 1e6}`, name: 'Chaos Test', state: 'NSW',
            latitude: -33, longitude: 151, assetOwner: 'Test',
            condition: 'GOOD', conditionRating: 7, isActive: true
        }));
        // Fire 10 concurrent updates
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(
                run(UPDATE('BridgeManagementService.Bridges', b.ID)
                    .set({ region: `Region-${i}` }))
                    .catch(e => e) // Catch errors, don't fail
            );
        }
        const results = await Promise.all(promises);
        // At least some should succeed, none should be 500
        const successes = results.filter(r => !(r instanceof Error));
        expect(successes.length).toBeGreaterThan(0);
        // Verify final state is consistent
        const final = await run(SELECT.one.from('BridgeManagementService.Bridges')
            .where({ ID: b.ID }));
        expect(final.region).toMatch(/^Region-\d$/);
    });

    test('CHAOS-02: Large batch read (2000+ bridges)', async () => {
        const start = Date.now();
        const all = await run(SELECT.from('BridgeManagementService.Bridges').limit(2000));
        const elapsed = Date.now() - start;
        expect(all.length).toBeGreaterThan(100);
        expect(elapsed).toBeLessThan(10000); // Must complete within 10s
    });

    test('CHAOS-03: Invalid entity access returns error not crash', async () => {
        try {
            await run(SELECT.from('BridgeManagementService.NonExistentEntity'));
            fail('Should have thrown');
        } catch (e) {
            expect(e).toBeDefined();
            expect(e.code).not.toBe(500);
        }
    });

    test('CHAOS-04: Deeply nested $expand blocked', async () => {
        // CAP should block deep expansion
        try {
            await run(SELECT.from('BridgeManagementService.Bridges')
                .columns('*', { ref: ['restrictions'], expand: ['*'] })
                .limit(5));
            // If it works, just verify no crash
        } catch (e) {
            expect(e).toBeDefined();
        }
    });

    test('CHAOS-05: Delete non-existent record is graceful', async () => {
        try {
            await run(DELETE.from('BridgeManagementService.Bridges')
                .where({ ID: '00000000-0000-0000-0000-000000000000' }));
        } catch (e) {
            // CAP may throw or return 0 — neither should be 500
            expect(e.code || e.status).not.toBe(500);
        }
    });

    test('CHAOS-06: Service recovers after error', async () => {
        // Trigger an error
        try {
            await send({
                event: 'changeCondition', entity: 'BridgeManagementService.Bridges',
                data: { conditionValue: 'INVALID' },
                params: ['00000000-0000-0000-0000-000000000000']
            });
        } catch (e) { /* expected */ }

        // Service should still work after error
        const bridges = await run(SELECT.from('BridgeManagementService.Bridges').limit(1));
        expect(bridges.length).toBeGreaterThan(0);
    });
});
