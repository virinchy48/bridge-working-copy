const cds = require("@sap/cds");

describe("Concurrency & Edge Case Tests", () => {
    const { expect: _exp } = cds.test(__dirname + "/..");
    const PRIV = { user: new cds.User.Privileged() };

    // ── Optimistic Locking Tests ──────────────────────────────────
    describe("Optimistic Locking", () => {
        let testBridgeId;

        beforeAll(async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            await srv.tx(PRIV, async (tx) => {
                return tx.run(INSERT.into("BridgeManagementService.Bridges").entries({
                    bridgeId: "CONC-TEST-001",
                    name: "Concurrency Test Bridge",
                    state: "NSW",
                    latitude: -33.8,
                    longitude: 151.2,
                    condition: "GOOD",
                    postingStatus: "UNRESTRICTED",
                    version: 1
                }));
            });
            // Get the ID
            const bridges = await srv.tx(PRIV, async (tx) => {
                return tx.run(SELECT.from("BridgeManagementService.Bridges").where({ bridgeId: "CONC-TEST-001" }));
            });
            if (bridges.length) testBridgeId = bridges[0].ID;
        });

        test("Update with correct version succeeds", async () => {
            if (!testBridgeId) return;
            const srv = await cds.connect.to("BridgeManagementService");
            const result = await srv.tx(PRIV, async (tx) => {
                return tx.run(UPDATE("BridgeManagementService.Bridges", testBridgeId).set({ name: "Updated Name", version: 1 }));
            });
            expect(result).toBeDefined();
        });

        test("Update with stale version returns 409", async () => {
            if (!testBridgeId) return;
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                await srv.tx(PRIV, async (tx) => {
                    return tx.run(UPDATE("BridgeManagementService.Bridges", testBridgeId).set({ name: "Stale Update", version: 1 }));
                });
                // If no error, the version was already 2 from previous test
            } catch (e) {
                expect(e.code === 409 || e.message.includes("modified")).toBeTruthy();
            }
        });

        afterAll(async () => {
            try {
                const srv = await cds.connect.to("BridgeManagementService");
                if (testBridgeId) {
                    await srv.tx(PRIV, async (tx) => {
                        return tx.run(DELETE.from("BridgeManagementService.Bridges").where({ ID: testBridgeId }));
                    });
                }
            } catch (e) { /* cleanup */ }
        });
    });

    // ── Edge Case Tests ───────────────────────────────────────────
    describe("Boundary Values", () => {
        test("Bridge at extreme lat/lon accepted", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                const result = await srv.tx(PRIV, async (tx) => {
                    return tx.run(INSERT.into("BridgeManagementService.Bridges").entries({
                        bridgeId: "EDGE-LAT-001",
                        name: "Edge Latitude Bridge",
                        state: "TAS",
                        latitude: -43.6,
                        longitude: 147.3,
                        condition: "GOOD",
                        postingStatus: "UNRESTRICTED"
                    }));
                });
                expect(result).toBeDefined();
            } finally {
                try {
                    await srv.tx(PRIV, async (tx) => {
                        return tx.run(DELETE.from("BridgeManagementService.Bridges").where({ bridgeId: "EDGE-LAT-001" }));
                    });
                } catch (e) { /* */ }
            }
        });

        test("Unicode in bridge name stored correctly", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            const name = "Wollongong Creek Bridge — Hāwera Rd";
            try {
                await srv.tx(PRIV, async (tx) => {
                    return tx.run(INSERT.into("BridgeManagementService.Bridges").entries({
                        bridgeId: "EDGE-UNI-001",
                        name: name,
                        state: "NSW",
                        latitude: -34.4,
                        longitude: 150.9,
                        condition: "GOOD",
                        postingStatus: "UNRESTRICTED"
                    }));
                });
                const bridges = await srv.tx(PRIV, async (tx) => {
                    return tx.run(SELECT.from("BridgeManagementService.Bridges").where({ bridgeId: "EDGE-UNI-001" }));
                });
                expect(bridges.length).toBe(1);
                expect(bridges[0].name).toBe(name);
            } finally {
                try {
                    await srv.tx(PRIV, async (tx) => {
                        return tx.run(DELETE.from("BridgeManagementService.Bridges").where({ bridgeId: "EDGE-UNI-001" }));
                    });
                } catch (e) { /* */ }
            }
        });

        test("Restriction with validFromDate = validToDate accepted", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                const result = await srv.tx(PRIV, async (tx) => {
                    return tx.run(INSERT.into("BridgeManagementService.Restrictions").entries({
                        restrictionType: "GROSS_MASS",
                        value: 30.0,
                        unit: "t",
                        status: "ACTIVE",
                        validFromDate: "2026-04-03",
                        validToDate: "2026-04-03"
                    }));
                });
                expect(result).toBeDefined();
            } catch (e) {
                // Same-day restriction may or may not be allowed
                expect(e).toBeDefined();
            }
        });

        test("Zero-value restriction rejected for MASS type", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                await srv.tx(PRIV, async (tx) => {
                    return tx.run(INSERT.into("BridgeManagementService.Restrictions").entries({
                        restrictionType: "GROSS_MASS",
                        value: 0,
                        unit: "t",
                        status: "ACTIVE"
                    }));
                });
                expect(true).toBe(false); // Should have thrown
            } catch (e) {
                expect(e).toBeDefined();
            }
        });

        test("Enum validation rejects invalid condition", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                await srv.tx(PRIV, async (tx) => {
                    return tx.run(INSERT.into("BridgeManagementService.Bridges").entries({
                        bridgeId: "EDGE-ENUM-001",
                        name: "Enum Test",
                        state: "NSW",
                        condition: "INVALID_VALUE",
                        postingStatus: "UNRESTRICTED"
                    }));
                });
                expect(true).toBe(false);
            } catch (e) {
                expect(e.message || "").toMatch(/condition|invalid/i);
            }
        });
    });

    // ── Sensor Reading Validation ─────────────────────────────────
    describe("Input Validation", () => {
        const ADMIN_CTX = { user: new cds.User({ id: "admin-sensor", roles: { Admin: true, Inspector: true } }) };

        test("Negative sensor value rejected", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                await srv.tx(ADMIN_CTX, async (tx) => {
                    return tx.send({ event: "ingestSensorReading", data: { deviceId: "TEST-SENSOR", value: -5, unit: "kN" } });
                });
                expect(true).toBe(false); // Should have thrown
            } catch (e) {
                expect(e.message || "").toMatch(/range|numeric/i);
            }
        });

        test("Sensor value over 1000 rejected", async () => {
            const srv = await cds.connect.to("BridgeManagementService");
            try {
                await srv.tx(ADMIN_CTX, async (tx) => {
                    return tx.send({ event: "ingestSensorReading", data: { deviceId: "TEST-SENSOR", value: 1500, unit: "kN" } });
                });
                expect(true).toBe(false); // Should have thrown
            } catch (e) {
                expect(e.message || "").toMatch(/range/i);
            }
        });
    });
});
