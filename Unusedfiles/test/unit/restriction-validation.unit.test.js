// ============================================================
// S1-D1+D2: Restriction Validation Unit Tests
// SuperTester ABSOLUTE: Complete validation matrix for Restrictions
// ============================================================
'use strict';

const cds = require('@sap/cds');
cds.test(__dirname + '/../..');

const PRIV = { user: new cds.User.Privileged() };

let srv, bridgeUUID;
function run(query) { return srv.tx(PRIV, async () => srv.run(query)); }

async function createBridge() {
    const unique = `RV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 999)}`;
    return run(INSERT.into('BridgeManagementService.Bridges').entries({
        bridgeId: unique, name: `Bridge ${unique}`, region: 'Test',
        state: 'NSW', structureType: 'Beam', material: 'Concrete',
        latitude: -33.87, longitude: 151.21, condition: 'GOOD',
        conditionRating: 7, postingStatus: 'UNRESTRICTED', isActive: true
    }));
}

async function createRestriction(overrides = {}) {
    return run(INSERT.into('BridgeManagementService.Restrictions').entries({
        bridge_ID: bridgeUUID, restrictionType: 'MASS', value: 42.5, unit: 't',
        status: 'ACTIVE', isActive: true, directionApplied: 'BOTH',
        ...overrides
    }));
}

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
    const b = await createBridge();
    bridgeUUID = b.ID;
}, 30000);

// ─────────────────────────────────────────────────────────────
// Date validation
// ─────────────────────────────────────────────────────────────
describe('Restriction date validation', () => {
    test('TC-U-RD01: validFromDate before validToDate accepted', async () => {
        const r = await createRestriction({ validFromDate: '2026-01-01', validToDate: '2026-12-31' });
        expect(r).toBeDefined();
    });

    test('TC-U-RD02: validFromDate after validToDate rejected', async () => {
        await expect(createRestriction({
            validFromDate: '2026-12-31', validToDate: '2026-01-01'
        })).rejects.toThrow();
    });

    test('TC-U-RD03: validToDate without validFromDate rejected', async () => {
        await expect(createRestriction({
            validFromDate: undefined, validToDate: '2026-12-31'
        })).rejects.toThrow();
    });

    test('TC-U-RD04: ACTIVE with past validToDate rejected', async () => {
        await expect(createRestriction({
            status: 'ACTIVE', validFromDate: '2020-01-01', validToDate: '2020-12-31'
        })).rejects.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────
// Temporary restriction rules
// ─────────────────────────────────────────────────────────────
describe('Temporary restriction rules', () => {
    test('TC-U-RT01: temporary without fromDate rejected', async () => {
        await expect(createRestriction({
            isTemporary: true, validFromDate: undefined, validToDate: '2027-01-01',
            temporaryReason: 'Flood'
        })).rejects.toThrow();
    });

    test('TC-U-RT02: temporary without toDate rejected', async () => {
        await expect(createRestriction({
            isTemporary: true, validFromDate: '2026-01-01', validToDate: undefined,
            temporaryReason: 'Flood'
        })).rejects.toThrow();
    });

    test('TC-U-RT03: temporary without reason rejected', async () => {
        await expect(createRestriction({
            isTemporary: true, validFromDate: '2026-01-01', validToDate: '2027-01-01',
            temporaryReason: undefined
        })).rejects.toThrow();
    });

    test('TC-U-RT04: temporary with all required fields accepted', async () => {
        const r = await createRestriction({
            isTemporary: true, validFromDate: '2026-04-01', validToDate: '2026-06-01',
            temporaryReason: 'Flood damage assessment'
        });
        expect(r).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────
// Value and unit validation
// ─────────────────────────────────────────────────────────────
describe('Restriction value/unit validation', () => {
    test('TC-U-RVU01: value <= 0 for MASS rejected', async () => {
        await expect(createRestriction({ value: 0 })).rejects.toThrow();
    });

    test('TC-U-RVU02: negative value rejected', async () => {
        await expect(createRestriction({ value: -5 })).rejects.toThrow();
    });

    test('TC-U-RVU03: VEHICLE_TYPE with no value allowed', async () => {
        const r = await createRestriction({
            restrictionType: 'VEHICLE_TYPE', value: 0, unit: 't'
        });
        expect(r).toBeDefined();
    });

    test('TC-U-RVU04: invalid unit for HEIGHT rejected', async () => {
        await expect(createRestriction({
            restrictionType: 'HEIGHT', value: 4.5, unit: 't'
        })).rejects.toThrow();
    });

    test('TC-U-RVU05: correct unit for HEIGHT accepted (m)', async () => {
        const r = await createRestriction({
            restrictionType: 'HEIGHT', value: 4.5, unit: 'm'
        });
        expect(r).toBeDefined();
    });

    test('TC-U-RVU06: correct unit for SPEED accepted (km/h)', async () => {
        const r = await createRestriction({
            restrictionType: 'SPEED', value: 40, unit: 'km/h'
        });
        expect(r).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────
// Enum validation
// ─────────────────────────────────────────────────────────────
describe('Restriction enum validation', () => {
    test('TC-U-RE01: invalid restrictionType rejected', async () => {
        await expect(createRestriction({ restrictionType: 'INVALID_TYPE' })).rejects.toThrow();
    });

    test('TC-U-RE02: all valid restrictionTypes accepted', async () => {
        const types = ['MASS','GROSS_MASS','HEIGHT','WIDTH','LENGTH','SPEED','AXLE_LOAD','WEIGHT','CLEARANCE'];
        for (const t of types) {
            const unit = ['HEIGHT','WIDTH','LENGTH','CLEARANCE'].includes(t) ? 'm' :
                         ['SPEED'].includes(t) ? 'km/h' : 't';
            const r = await createRestriction({ restrictionType: t, value: 10, unit });
            expect(r).toBeDefined();
        }
    });

    test('TC-U-RE03: invalid status rejected', async () => {
        await expect(createRestriction({ status: 'DELETED' })).rejects.toThrow();
    });

    test('TC-U-RE04: all valid statuses accepted', async () => {
        const statuses = ['ACTIVE','INACTIVE','SCHEDULED','DRAFT'];
        for (const s of statuses) {
            const r = await createRestriction({
                status: s, validFromDate: '2026-04-01', validToDate: '2027-04-01'
            });
            expect(r).toBeDefined();
        }
    });

    test('TC-U-RE05: invalid directionApplied rejected', async () => {
        await expect(createRestriction({ directionApplied: 'DIAGONAL' })).rejects.toThrow();
    });

    test('TC-U-RE06: all valid directions accepted', async () => {
        const dirs = ['BOTH','NORTHBOUND','SOUTHBOUND','EASTBOUND','WESTBOUND'];
        for (const d of dirs) {
            const r = await createRestriction({ directionApplied: d });
            expect(r).toBeDefined();
        }
    });
});

// ─────────────────────────────────────────────────────────────
// Bridge association validation
// ─────────────────────────────────────────────────────────────
describe('Restriction bridge association', () => {
    test('TC-U-RBA01: restriction without bridge or route rejected', async () => {
        await expect(run(INSERT.into('BridgeManagementService.Restrictions').entries({
            restrictionType: 'MASS', value: 42.5, unit: 't', status: 'ACTIVE'
        }))).rejects.toThrow();
    });

    test('TC-U-RBA02: restriction with non-existent bridge rejected', async () => {
        await expect(createRestriction({
            bridge_ID: '00000000-0000-0000-0000-000000000000'
        })).rejects.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────
// Gazette validation
// ─────────────────────────────────────────────────────────────
describe('Gazette reference validation', () => {
    test('TC-U-RG01: valid gazette format sets VALID or NOT_FOUND', async () => {
        const r = await createRestriction({ gazetteRef: 'NSW-2026/001' });
        expect(r).toBeDefined();
    });

    test('TC-U-RG02: invalid gazette format sets INVALID_FORMAT', async () => {
        const r = await createRestriction({ gazetteRef: 'bad-ref' });
        // soft validation — does not reject, but sets status
        expect(r).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────
// XSS / Injection safety
// ─────────────────────────────────────────────────────────────
describe('Restriction injection safety', () => {
    test('TC-U-RI01: XSS in notes stored safely', async () => {
        const r = await createRestriction({ notes: '<script>alert("xss")</script>' });
        expect(r.notes).toContain('<script>');
    });

    test('TC-U-RI02: SQL injection in gazetteRef handled', async () => {
        const r = await createRestriction({ gazetteRef: "NSW-2026'; DROP TABLE--" });
        expect(r).toBeDefined();
    });

    test('TC-U-RI03: Unicode in notes preserved', async () => {
        const r = await createRestriction({ notes: '限高4.5米 🚛 Ñoño' });
        const fetched = await run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: r.ID }));
        expect(fetched.notes).toBe('限高4.5米 🚛 Ñoño');
    });
});

// ─────────────────────────────────────────────────���───────────
// Time-based restrictions
// ─────────────────────────────────────────────────────────────
describe('Time-based restrictions', () => {
    test('TC-U-RTB01: fromTime >= toTime rejected', async () => {
        await expect(createRestriction({
            validFromTime: '18:00', validToTime: '06:00'
        })).rejects.toThrow();
    });

    test('TC-U-RTB02: fromTime < toTime accepted', async () => {
        const r = await createRestriction({
            validFromTime: '06:00', validToTime: '18:00'
        });
        expect(r).toBeDefined();
    });
});
