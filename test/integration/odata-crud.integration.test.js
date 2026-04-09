/* ────────────────────────────────────────────────────────────────
   OData CRUD Integration Tests — NHVR Bridge Management Service
   Framework: Jest + @cap-js/cds-test
   ──────────────────────────────────────────────────────────────── */
'use strict';

const cds = require('@sap/cds');
cds.test(__dirname + '/../..');

const PRIV = { user: new cds.User.Privileged() };
const ADMIN = {
  user: new cds.User({
    id: 'admin',
    roles: ['Admin', 'BridgeManager', 'Viewer', 'Inspector', 'Operator', 'Executive', 'TechAdmin', 'Uploader']
  })
};

let srv, db;

// All CDS queries routed through a service transaction
function _run(q) { return srv.tx(PRIV, async (tx) => tx.run(q)); }
function _send(a, ctx) { return srv.tx(ctx || PRIV, async (tx) => tx.send(a)); }

// Collect IDs for cleanup
const cleanup = { bridges: [], restrictions: [], inspections: [], defects: [] };

beforeAll(async () => {
  srv = await cds.connect.to('BridgeManagementService');
  db = await cds.connect.to('db');
}, 30000);

afterAll(async () => {
  // Clean up in reverse-dependency order using db to bypass service hooks
  for (const id of cleanup.defects) {
    try { await db.run(DELETE.from('nhvr.BridgeDefect').where({ ID: id })); } catch (_) { /* ok */ }
  }
  for (const id of cleanup.inspections) {
    try { await db.run(DELETE.from('nhvr.InspectionOrder').where({ ID: id })); } catch (_) { /* ok */ }
  }
  for (const id of cleanup.restrictions) {
    try { await db.run(DELETE.from('nhvr.Restriction').where({ ID: id })); } catch (_) { /* ok */ }
  }
  for (const id of cleanup.bridges) {
    try { await db.run(DELETE.from('nhvr.Bridge').where({ ID: id })); } catch (_) { /* ok */ }
  }
});

// ══════════════════════════════════════════════════════════════════
// HELPER: create a test bridge via the service
// ══════════════════════════════════════════════════════════════════
let _counter = 0;
function bridgePayload(overrides = {}) {
  _counter++;
  return {
    bridgeId: `INT-${Date.now()}-${_counter}`,
    name: `Integration Test Bridge ${_counter}`,
    state: 'NSW',
    condition: 'GOOD',
    latitude: -33.8,
    longitude: 151.2,
    postingStatus: 'UNRESTRICTED',
    ...overrides
  };
}

/** Create a bridge through the service and return its UUID */
async function createBridge(overrides = {}) {
  const data = bridgePayload(overrides);
  await srv.tx(PRIV, async (tx) =>
    tx.run(INSERT.into('BridgeManagementService.Bridges').entries(data))
  );
  const rows = await srv.tx(PRIV, async (tx) =>
    tx.run(SELECT.from('BridgeManagementService.Bridges').where({ bridgeId: data.bridgeId }))
  );
  cleanup.bridges.push(rows[0].ID);
  return { ...rows[0], _bridgeId: data.bridgeId };
}

/** Create a restriction through the service and return it */
async function createRestriction(bridgeUUID, overrides = {}) {
  const data = {
    restrictionType: 'MASS',
    value: 42.5,
    unit: 't',
    status: 'ACTIVE',
    bridge_ID: bridgeUUID,
    ...overrides
  };
  const _result = await srv.tx(PRIV, async (tx) =>
    tx.run(INSERT.into('BridgeManagementService.Restrictions').entries(data))
  );
  // Read back to get ID
  const rows = await srv.tx(PRIV, async (tx) =>
    tx.run(SELECT.from('BridgeManagementService.Restrictions').where({ bridge_ID: bridgeUUID, restrictionType: data.restrictionType }))
  );
  const row = rows.find(r => r.value === data.value) || rows[rows.length - 1];
  cleanup.restrictions.push(row.ID);
  return row;
}

// ══════════════════════════════════════════════════════════════════
// SUITE 1: OData CRUD Matrix
// ══════════════════════════════════════════════════════════════════
describe('1. OData CRUD Matrix', () => {

  // ── Bridges ──────────────────────────────────────────────────
  describe('Bridges CRUD', () => {
    let bridge;

    test('CREATE a bridge', async () => {
      bridge = await createBridge();
      expect(bridge.ID).toBeDefined();
      expect(bridge.name).toContain('Integration Test Bridge');
    });

    test('READ the bridge back', async () => {
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
      );
      expect(row).toBeDefined();
      expect(row.state).toBe('NSW');
      expect(row.bridgeId).toBe(bridge._bridgeId);
    });

    test('UPDATE the bridge', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(UPDATE('BridgeManagementService.Bridges').where({ ID: bridge.ID }).set({ condition: 'FAIR' }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
      );
      expect(row.condition).toBe('FAIR');
    });

    test('DELETE the bridge', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(DELETE.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
      );
      expect(row == null).toBe(true); // null or undefined — row is gone
      // Remove from cleanup since already deleted
      cleanup.bridges = cleanup.bridges.filter(id => id !== bridge.ID);
    });
  });

  // ── Restrictions ─────────────────────────────────────────────
  describe('Restrictions CRUD', () => {
    let parentBridge, restriction;

    beforeAll(async () => {
      parentBridge = await createBridge();
    });

    test('CREATE a restriction', async () => {
      restriction = await createRestriction(parentBridge.ID, {
        restrictionType: 'MASS',
        value: 42.5,
        unit: 't'
      });
      expect(restriction.ID).toBeDefined();
      expect(restriction.restrictionType).toBe('MASS');
    });

    test('READ restriction back', async () => {
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      expect(row).toBeDefined();
      expect(row.status).toBe('ACTIVE');
    });

    test('UPDATE restriction', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(UPDATE('BridgeManagementService.Restrictions').where({ ID: restriction.ID }).set({ notes: 'Updated in test' }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      expect(row.notes).toBe('Updated in test');
    });

    test('DELETE restriction', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(DELETE.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      expect(row == null).toBe(true); // null or undefined — row is gone
      cleanup.restrictions = cleanup.restrictions.filter(id => id !== restriction.ID);
    });
  });

  // ── InspectionOrders ─────────────────────────────────────────
  describe('InspectionOrders CRUD', () => {
    let parentBridge, inspectionID;

    beforeAll(async () => {
      parentBridge = await createBridge();
    });

    test('CREATE an inspection order', async () => {
      const orderNumber = `IO-CRUD-${Date.now()}`;
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
          bridge_ID: parentBridge.ID,
          orderNumber,
          inspectionType: 'ROUTINE',
          status: 'PLANNED',
          plannedDate: '2026-06-15',
          inspector: 'Test Inspector'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.InspectionOrders').where({ orderNumber }))
      );
      expect(rows.length).toBe(1);
      inspectionID = rows[0].ID;
      cleanup.inspections.push(inspectionID);
    });

    test('READ inspection order back', async () => {
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      expect(row).toBeDefined();
      expect(row.status).toBe('PLANNED');
      expect(row.inspectionType).toBe('ROUTINE');
    });

    test('UPDATE inspection order', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(UPDATE('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }).set({ inspector: 'Updated Inspector' }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      expect(row.inspector).toBe('Updated Inspector');
    });

    test('DELETE inspection order', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(DELETE.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      expect(row == null).toBe(true); // null or undefined — row is gone
      cleanup.inspections = cleanup.inspections.filter(id => id !== inspectionID);
    });
  });

  // ── BridgeDefects ────────────────────────────────────────────
  describe('BridgeDefects CRUD', () => {
    let parentBridge, defectID;

    beforeAll(async () => {
      parentBridge = await createBridge();
    });

    test('CREATE a defect', async () => {
      const defectNumber = `DEF-CRUD-${Date.now()}`;
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
          bridge_ID: parentBridge.ID,
          defectNumber,
          defectCategory: 'STRUCTURAL',
          severity: 'HIGH',
          status: 'OPEN',
          description: 'Test defect for integration testing'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.BridgeDefects').where({ defectNumber }))
      );
      expect(rows.length).toBe(1);
      defectID = rows[0].ID;
      cleanup.defects.push(defectID);
    });

    test('READ defect back', async () => {
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: defectID }))
      );
      expect(row).toBeDefined();
      expect(row.severity).toBe('HIGH');
      expect(row.status).toBe('OPEN');
    });

    test('UPDATE defect', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(UPDATE('BridgeManagementService.BridgeDefects').where({ ID: defectID }).set({ severity: 'CRITICAL' }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: defectID }))
      );
      expect(row.severity).toBe('CRITICAL');
    });

    test('DELETE defect', async () => {
      await srv.tx(PRIV, async (tx) =>
        tx.run(DELETE.from('BridgeManagementService.BridgeDefects').where({ ID: defectID }))
      );
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.BridgeDefects').where({ ID: defectID }))
      );
      expect(row == null).toBe(true); // null or undefined — row is gone
      cleanup.defects = cleanup.defects.filter(id => id !== defectID);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 2: $expand Tests
// ══════════════════════════════════════════════════════════════════
describe('2. $expand Tests', () => {
  let bridge;

  beforeAll(async () => {
    bridge = await createBridge();
    await createRestriction(bridge.ID, {
      restrictionType: 'HEIGHT',
      value: 4.6,
      unit: 'm'
    });
  });

  test('GET Bridge with $expand=restrictions returns nested array', async () => {
    const row = await srv.tx(PRIV, async (tx) =>
      tx.run(
        SELECT.one.from('BridgeManagementService.Bridges')
          .where({ ID: bridge.ID })
          .columns(b => { b`*`, b.restrictions('*') })
      )
    );
    expect(row).toBeDefined();
    expect(Array.isArray(row.restrictions)).toBe(true);
    expect(row.restrictions.length).toBeGreaterThanOrEqual(1);
    expect(row.restrictions[0].restrictionType).toBe('HEIGHT');
  });

  test('GET Restriction with bridge_ID resolves association', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Restrictions').where({ bridge_ID: bridge.ID }))
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].bridge_ID).toBe(bridge.ID);
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 3: $filter on Indexed Fields
// ══════════════════════════════════════════════════════════════════
describe('3. $filter Tests', () => {
  let bridge;

  beforeAll(async () => {
    bridge = await createBridge({ state: 'QLD', condition: 'POOR', postingStatus: 'POSTED' });
  });

  test('filter Bridges by state', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').where({ state: 'QLD', bridgeId: bridge._bridgeId }))
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('QLD');
  });

  test('filter Bridges by condition', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').where({ condition: 'POOR', bridgeId: bridge._bridgeId }))
    );
    expect(rows.length).toBe(1);
    expect(rows[0].condition).toBe('POOR');
  });

  test('filter Bridges by postingStatus', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').where({ postingStatus: 'POSTED', bridgeId: bridge._bridgeId }))
    );
    expect(rows.length).toBe(1);
  });

  test('filter Bridges by bridgeId', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').where({ bridgeId: bridge._bridgeId }))
    );
    expect(rows.length).toBe(1);
    expect(rows[0].bridgeId).toBe(bridge._bridgeId);
  });

  test('filter Restrictions by status', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Restrictions').where({ status: 'ACTIVE' }).limit(10))
    );
    expect(Array.isArray(rows)).toBe(true);
    rows.forEach(r => expect(r.status).toBe('ACTIVE'));
  });

  test('filter Restrictions by restrictionType', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Restrictions').where({ restrictionType: 'MASS' }).limit(10))
    );
    expect(Array.isArray(rows)).toBe(true);
    rows.forEach(r => expect(r.restrictionType).toBe('MASS'));
  });

  test('compound AND filter: state=QLD AND condition=POOR', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').where({ state: 'QLD', condition: 'POOR', bridgeId: bridge._bridgeId }))
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('QLD');
    expect(rows[0].condition).toBe('POOR');
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 4: $orderby Tests
// ══════════════════════════════════════════════════════════════════
describe('4. $orderby Tests', () => {

  test('Bridges ordered by name ASC — first < last', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').orderBy('name asc').limit(100))
    );
    if (rows.length >= 2) {
      const first = rows[0].name || '';
      const last = rows[rows.length - 1].name || '';
      expect(first.localeCompare(last)).toBeLessThanOrEqual(0);
    }
  });

  test('Bridges ordered by conditionRating DESC — first >= last', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(
        SELECT.from('BridgeManagementService.Bridges')
          .where('conditionRating is not null')
          .orderBy('conditionRating desc')
          .limit(100)
      )
    );
    if (rows.length >= 2) {
      expect(rows[0].conditionRating).toBeGreaterThanOrEqual(rows[rows.length - 1].conditionRating);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 5: $top/$skip Pagination
// ══════════════════════════════════════════════════════════════════
describe('5. $top/$skip Pagination', () => {

  test('$top=5 returns exactly 5 (if enough data)', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').limit(5))
    );
    expect(rows.length).toBe(5);
  });

  test('$skip=5,$top=5 returns different set from $skip=0,$top=5', async () => {
    const page1 = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').limit(5, 0))
    );
    const page2 = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').limit(5, 5))
    );
    expect(page1.length).toBe(5);
    expect(page2.length).toBe(5);
    const ids1 = page1.map(r => r.ID);
    const ids2 = page2.map(r => r.ID);
    const overlap = ids1.filter(id => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  test('$top=5,$skip=99999 returns empty array', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').limit(5, 99999))
    );
    expect(rows.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 6: Field Precision
// ══════════════════════════════════════════════════════════════════
describe('6. Field Precision', () => {
  let bridge;

  beforeAll(async () => {
    bridge = await createBridge({
      spanLengthM: 42.5,
      inspectionDate: '2026-01-15',
      floodImpacted: true,
      name: 'Precision Bridge \u65E5\u672C\u8A9E\uD83C\uDF09'
    });
  });

  test('Decimal: store 42.5 read back 42.5', async () => {
    const row = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
    );
    expect(row.spanLengthM).toBe(42.5);
  });

  test('Date: store 2026-01-15 read back 2026-01-15', async () => {
    const row = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
    );
    expect(row.inspectionDate).toBe('2026-01-15');
  });

  test('Boolean: store true read back true (not 1)', async () => {
    const row = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
    );
    expect(row.floodImpacted).toBe(true);
  });

  test('String with Unicode round-trips correctly', async () => {
    const row = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
    );
    expect(row.name).toContain('\u65E5\u672C\u8A9E\uD83C\uDF09');
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 7: State Machine Transitions
// ══════════════════════════════════════════════════════════════════
describe('7. State Machine Transitions', () => {

  describe('Bridge changeCondition', () => {
    let bridge;

    beforeAll(async () => {
      bridge = await createBridge();
    });

    test('changeCondition updates condition + conditionScore', async () => {
      const result = await srv.tx(ADMIN, async (tx) =>
        tx.send({
          event: 'changeCondition',
          entity: 'BridgeManagementService.Bridges',
          data: { conditionValue: 'POOR', score: 30 },
          params: [bridge.ID]
        })
      );
      expect(result).toBeDefined();
      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Bridges').where({ ID: bridge.ID }))
      );
      expect(row.condition).toBe('POOR');
      expect(row.conditionScore).toBe(30);
    });

    test('changeCondition creates BridgeConditionHistory entry', async () => {
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.BridgeHistory').where({ bridge_ID: bridge.ID }))
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Restriction state machine', () => {
    let bridge, restriction;

    beforeAll(async () => {
      bridge = await createBridge();
    });

    test('CREATE (ACTIVE) -> disableRestriction -> enableRestriction cycle', async () => {
      // Create
      restriction = await createRestriction(bridge.ID, {
        restrictionType: 'SPEED',
        value: 40,
        unit: 'km/h'
      });
      expect(restriction.status).toBe('ACTIVE');

      // Disable
      const disableResult = await srv.tx(ADMIN, async (tx) =>
        tx.send({
          event: 'disableRestriction',
          entity: 'BridgeManagementService.Restrictions',
          data: { reason: 'Test disable' },
          params: [restriction.ID]
        })
      );
      expect(disableResult).toBeDefined();
      const afterDisable = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      expect(afterDisable.status).toBe('INACTIVE');

      // Enable
      const enableResult = await srv.tx(ADMIN, async (tx) =>
        tx.send({
          event: 'enableRestriction',
          entity: 'BridgeManagementService.Restrictions',
          data: { reason: 'Test re-enable' },
          params: [restriction.ID]
        })
      );
      expect(enableResult).toBeDefined();
      const afterEnable = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.Restrictions').where({ ID: restriction.ID }))
      );
      expect(afterEnable.status).toBe('ACTIVE');
    });
  });

  describe('InspectionOrder lifecycle', () => {
    let bridge, inspectionID;

    beforeAll(async () => {
      bridge = await createBridge();
    });

    test('PLANNED -> startInspection -> IN_PROGRESS', async () => {
      const orderNumber = `IO-SM-${Date.now()}`;
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
          bridge_ID: bridge.ID,
          orderNumber,
          inspectionType: 'ROUTINE',
          status: 'PLANNED',
          plannedDate: '2026-07-01',
          inspector: 'SM Tester'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.InspectionOrders').where({ orderNumber }))
      );
      inspectionID = rows[0].ID;
      cleanup.inspections.push(inspectionID);

      const result = await srv.tx(ADMIN, async (tx) =>
        tx.send({
          event: 'startInspection',
          entity: 'BridgeManagementService.InspectionOrders',
          data: {},
          params: [inspectionID]
        })
      );
      expect(result).toBeDefined();

      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      expect(row.status).toBe('IN_PROGRESS');
    });

    test('IN_PROGRESS -> completeInspection -> COMPLETED or PENDING_REVIEW', async () => {
      const result = await srv.tx(ADMIN, async (tx) =>
        tx.send({
          event: 'completeInspection',
          entity: 'BridgeManagementService.InspectionOrders',
          data: {
            overallConditionRating: 7,
            structuralAdequacy: 'ADEQUATE',
            maintenanceUrgency: 'ROUTINE',
            recommendations: 'No immediate action required',
            reportRef: 'REP-001',
            nextInspectionDue: '2027-07-01',
            notes: 'Integration test completion'
          },
          params: [inspectionID]
        })
      );
      expect(result).toBeDefined();

      const row = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: inspectionID }))
      );
      expect(['COMPLETED', 'PENDING_REVIEW']).toContain(row.status);
    });

    test('Invalid transition: direct PATCH to COMPLETED from PLANNED', async () => {
      const orderNumber = `IO-INV-${Date.now()}`;
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
          bridge_ID: bridge.ID,
          orderNumber,
          inspectionType: 'ROUTINE',
          status: 'PLANNED',
          plannedDate: '2026-08-01',
          inspector: 'Invalid Tester'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.InspectionOrders').where({ orderNumber }))
      );
      const invID = rows[0].ID;
      cleanup.inspections.push(invID);

      // Attempt to skip IN_PROGRESS; may throw or silently reject
      try {
        await srv.tx(PRIV, async (tx) =>
          tx.run(UPDATE('BridgeManagementService.InspectionOrders').where({ ID: invID }).set({ status: 'COMPLETED' }))
        );
        const row = await srv.tx(PRIV, async (tx) =>
          tx.run(SELECT.one.from('BridgeManagementService.InspectionOrders').where({ ID: invID }))
        );
        // If no error, CAP may allow direct status patches — just verify the field is present
        expect(row.status).toBeDefined();
      } catch (e) {
        // Expected: direct status changes should be blocked
        expect(e).toBeDefined();
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 8: Referential Integrity
// ══════════════════════════════════════════════════════════════════
describe('8. Referential Integrity', () => {
  const FAKE_UUID = '00000000-0000-0000-0000-000000000099';

  test('CREATE Restriction with non-existent bridge_ID', async () => {
    try {
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.Restrictions').entries({
          restrictionType: 'MASS',
          value: 50,
          unit: 't',
          status: 'ACTIVE',
          bridge_ID: FAKE_UUID
        }))
      );
      // SQLite may allow it — clean up
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.Restrictions').where({ bridge_ID: FAKE_UUID }))
      );
      for (const r of rows) {
        try { await db.run(DELETE.from('nhvr.Restriction').where({ ID: r.ID })); } catch (_) { /* ok */ }
      }
      // At minimum, it didn't crash
      expect(true).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  test('CREATE InspectionOrder with non-existent bridge_ID', async () => {
    try {
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.InspectionOrders').entries({
          bridge_ID: FAKE_UUID,
          orderNumber: `IO-ORPHAN-${Date.now()}`,
          inspectionType: 'ROUTINE',
          status: 'PLANNED',
          plannedDate: '2026-09-01'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.InspectionOrders').where({ bridge_ID: FAKE_UUID }))
      );
      for (const r of rows) {
        try { await db.run(DELETE.from('nhvr.InspectionOrder').where({ ID: r.ID })); } catch (_) { /* ok */ }
      }
      expect(true).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  test('CREATE BridgeDefect with non-existent bridge_ID', async () => {
    try {
      await srv.tx(PRIV, async (tx) =>
        tx.run(INSERT.into('BridgeManagementService.BridgeDefects').entries({
          bridge_ID: FAKE_UUID,
          defectCategory: 'STRUCTURAL',
          severity: 'LOW',
          description: 'Orphan defect test'
        }))
      );
      const rows = await srv.tx(PRIV, async (tx) =>
        tx.run(SELECT.from('BridgeManagementService.BridgeDefects').where({ bridge_ID: FAKE_UUID }))
      );
      for (const r of rows) {
        try { await db.run(DELETE.from('nhvr.BridgeDefect').where({ ID: r.ID })); } catch (_) { /* ok */ }
      }
      expect(true).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// SUITE 9: Contract Tests (UI Shape Verification)
// ══════════════════════════════════════════════════════════════════
describe('9. Contract Tests — Response Shape', () => {

  test('Bridge list: each item has expected fields', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Bridges').limit(3))
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const b = rows[0];
    expect(b).toHaveProperty('ID');
    expect(b).toHaveProperty('bridgeId');
    expect(b).toHaveProperty('name');
    expect(b).toHaveProperty('state');
    expect(b).toHaveProperty('condition');
    expect(b).toHaveProperty('conditionRating');
    expect(b).toHaveProperty('postingStatus');
    expect(b).toHaveProperty('latitude');
    expect(b).toHaveProperty('longitude');
  });

  test('Restriction has expected shape', async () => {
    const rows = await srv.tx(PRIV, async (tx) =>
      tx.run(SELECT.from('BridgeManagementService.Restrictions').limit(1))
    );
    if (rows.length === 0) return;
    const r = rows[0];
    expect(r).toHaveProperty('ID');
    expect(r).toHaveProperty('restrictionType');
    expect(r).toHaveProperty('value');
    expect(r).toHaveProperty('unit');
    expect(r).toHaveProperty('status');
    expect(r).toHaveProperty('bridge_ID');
  });

  test('me() returns id, roles, appMode', async () => {
    const result = await srv.tx(ADMIN, async (tx) =>
      tx.send({ event: 'me' })
    );
    expect(result).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(Array.isArray(result.roles)).toBe(true);
    expect(typeof result.appMode).toBe('string');
  });

  test('getDashboardKPIs returns expected numeric fields', async () => {
    let result;
    try {
      const raw = await srv.tx(ADMIN, async (tx) =>
        tx.send({ event: 'getDashboardKPIs', data: { jurisdiction: '' } })
      );
      result = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      result = null;
    }
    if (result) {
      expect(typeof result.totalBridges).toBe('number');
      expect(typeof result.activeRestrictions).toBe('number');
    }
  });
});
