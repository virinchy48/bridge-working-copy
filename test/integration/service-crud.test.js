'use strict';

// Integration test that proves the BridgeManagementService OData endpoint
// actually reads and writes the live DB, with no cache/fixture layer in
// between. This codifies the contract that fixes to the UI's in-memory
// lookup cache relied on: a POST / PATCH / DELETE against the service
// MUST be immediately observable via a subsequent GET. If future work
// ever reintroduces server-side caching that hides recent writes, this
// file will fail loudly.

jest.setTimeout(90000);

// Force in-memory SQLite + dummy auth BEFORE `@sap/cds` is required.
process.env.CDS_CONFIG = JSON.stringify({
    requires: {
        db:   { kind: 'sqlite', credentials: { url: ':memory:' } },
        auth: { kind: 'dummy' }
    }
});
process.env.NODE_ENV = 'test';

const path = require('path');
const cds = require('@sap/cds');

const projectRoot = path.resolve(__dirname, '..', '..');
const { GET, POST, PATCH, DELETE, expect } = cds.test(projectRoot);

const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
const describeIfModernNode = NODE_MAJOR >= 20 ? describe : describe.skip;

// Test data identifiers — kept stable so cleanup can target them.
const LOOKUP_CATEGORY = 'TEST_CAT';
const LOOKUP_CODE     = 'SRV_CRUD_A';
const LOOKUP_CODE_RW  = 'SRV_CRUD_RW';
const BRIDGE_ID       = 'BRG-SRV-CRUD-A';

// Utility: unwrap an OData error-or-success response. The CAP test client
// throws on non-2xx so we normalise via try/catch where we expect failures.
async function expectNotFound(url) {
    let caught;
    try {
        await GET(url);
    } catch (err) {
        caught = err;
    }
    expect(caught, `expected GET ${url} to fail with 404`).to.exist;
    const status = caught.response ? caught.response.status : caught.code;
    expect(status).to.equal(404);
}

describeIfModernNode('BridgeManagementService CRUD hits live DB — Lookups', () => {
    const createdLookupIds = [];

    afterAll(async () => {
        // Best-effort cleanup in case a test died mid-flight.
        for (const id of createdLookupIds) {
            try {
                await DELETE(`/bridge-management/Lookups(${id})`);
            } catch (_) { /* already gone */ }
        }
        // Also nuke anything still matching our category fingerprint so
        // a re-run on a persistent DB stays green.
        try {
            const orphans = await GET(
                `/bridge-management/Lookups?$filter=category eq '${LOOKUP_CATEGORY}'`
            );
            for (const row of (orphans.data.value || [])) {
                try { await DELETE(`/bridge-management/Lookups(${row.ID})`); }
                catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }
    });

    test('CREATE — POST returns 201 and echoes the row', async () => {
        const res = await POST('/bridge-management/Lookups', {
            category    : LOOKUP_CATEGORY,
            code        : LOOKUP_CODE,
            description : 'First',
            displayOrder: 500,
            isActive    : true
        });
        expect(res.status).to.equal(201);
        expect(res.data.ID).to.be.a('string');
        expect(res.data.category).to.equal(LOOKUP_CATEGORY);
        expect(res.data.code).to.equal(LOOKUP_CODE);
        expect(res.data.description).to.equal('First');
        expect(res.data.displayOrder).to.equal(500);
        expect(res.data.isActive).to.equal(true);
        // managed fields should be auto-populated by cds
        expect(res.data.createdAt).to.be.a('string');
        createdLookupIds.push(res.data.ID);
    });

    test('READ by ID — GET returns the freshly written row', async () => {
        const id = createdLookupIds[0];
        expect(id, 'CREATE test must have run first').to.be.a('string');

        const res = await GET(`/bridge-management/Lookups(${id})`);
        expect(res.status).to.equal(200);
        expect(res.data.ID).to.equal(id);
        expect(res.data.category).to.equal(LOOKUP_CATEGORY);
        expect(res.data.code).to.equal(LOOKUP_CODE);
        expect(res.data.description).to.equal('First');
    });

    test('READ by filter — exactly one row matches category+code', async () => {
        const res = await GET(
            `/bridge-management/Lookups?$filter=category eq '${LOOKUP_CATEGORY}' and code eq '${LOOKUP_CODE}'`
        );
        expect(res.status).to.equal(200);
        expect(res.data.value).to.be.an('array');
        expect(res.data.value).to.have.lengthOf(1);
        expect(res.data.value[0].ID).to.equal(createdLookupIds[0]);
    });

    test('UPDATE — PATCH persists to DB and GET sees it', async () => {
        const id = createdLookupIds[0];
        const res = await PATCH(`/bridge-management/Lookups(${id})`, {
            description: 'Updated description'
        });
        // OData v4 PATCH typically returns 200 with the updated body, but
        // some runtimes return 204 No Content. Accept either.
        expect([200, 204]).to.include(res.status);

        const after = await GET(`/bridge-management/Lookups(${id})`);
        expect(after.status).to.equal(200);
        expect(after.data.description).to.equal('Updated description');
    });

    test('DELETE — row disappears from the DB', async () => {
        const id = createdLookupIds[0];
        const res = await DELETE(`/bridge-management/Lookups(${id})`);
        expect(res.status).to.equal(204);

        // Remove from tracking list — it's really gone.
        createdLookupIds.splice(0, 1);

        await expectNotFound(`/bridge-management/Lookups(${id})`);
    });

    test('Read-after-write race guard — POST then immediate GET sees the row', async () => {
        // This is the contract the session's cache fix relies on: the
        // server must never hide a freshly written row from the very
        // next GET on the same connection. If a caching layer ever
        // creeps in, this assertion fails.
        const createRes = await POST('/bridge-management/Lookups', {
            category    : LOOKUP_CATEGORY,
            code        : LOOKUP_CODE_RW,
            description : 'Race guard',
            displayOrder: 501,
            isActive    : true
        });
        expect(createRes.status).to.equal(201);
        const id = createRes.data.ID;
        createdLookupIds.push(id);

        const readRes = await GET(
            `/bridge-management/Lookups?$filter=category eq '${LOOKUP_CATEGORY}' and code eq '${LOOKUP_CODE_RW}'`
        );
        expect(readRes.status).to.equal(200);
        expect(readRes.data.value).to.have.lengthOf(1);
        expect(readRes.data.value[0].ID).to.equal(id);
        expect(readRes.data.value[0].description).to.equal('Race guard');
    });
});

describeIfModernNode('BridgeManagementService CRUD hits live DB — Bridges', () => {
    const createdBridgeIds = [];

    afterAll(async () => {
        for (const id of createdBridgeIds) {
            try {
                await DELETE(`/bridge-management/Bridges(${id})`);
            } catch (_) { /* already gone */ }
        }
        // Fallback: clean by bridgeId fingerprint in case a test created
        // a row but never pushed its UUID into the tracking list.
        try {
            const orphans = await GET(
                `/bridge-management/Bridges?$filter=bridgeId eq '${BRIDGE_ID}'`
            );
            for (const row of (orphans.data.value || [])) {
                try { await DELETE(`/bridge-management/Bridges(${row.ID})`); }
                catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }
    });

    test('CREATE — POST Bridge returns 201 with a UUID', async () => {
        const res = await POST('/bridge-management/Bridges', {
            bridgeId  : BRIDGE_ID,
            name      : 'Service CRUD Test',
            state     : 'NSW',
            assetOwner: 'TMR',
            latitude  : -27.0,
            longitude : 153.0
        });
        expect(res.status).to.equal(201);
        expect(res.data.ID).to.be.a('string');
        expect(res.data.bridgeId).to.equal(BRIDGE_ID);
        expect(res.data.name).to.equal('Service CRUD Test');
        createdBridgeIds.push(res.data.ID);
    });

    test('UPDATE — PATCH is visible on subsequent GET', async () => {
        const id = createdBridgeIds[0];
        expect(id, 'CREATE test must have run first').to.be.a('string');

        const patchRes = await PATCH(`/bridge-management/Bridges(${id})`, {
            name: 'Service CRUD Renamed'
        });
        expect([200, 204]).to.include(patchRes.status);

        const after = await GET(`/bridge-management/Bridges(${id})`);
        expect(after.status).to.equal(200);
        expect(after.data.name).to.equal('Service CRUD Renamed');
        expect(after.data.bridgeId).to.equal(BRIDGE_ID);
    });

    test('DELETE — row gone, filter returns zero rows', async () => {
        const id = createdBridgeIds[0];
        const delRes = await DELETE(`/bridge-management/Bridges(${id})`);
        expect(delRes.status).to.equal(204);
        createdBridgeIds.splice(0, 1);

        const res = await GET(
            `/bridge-management/Bridges?$filter=bridgeId eq '${BRIDGE_ID}'`
        );
        expect(res.status).to.equal(200);
        expect(res.data.value).to.be.an('array');
        expect(res.data.value).to.have.lengthOf(0);
    });

    test('LIST + $select — response shape has exactly the requested columns', async () => {
        // Seed one row so $top=1 always has something to return.
        const seed = await POST('/bridge-management/Bridges', {
            bridgeId  : BRIDGE_ID,
            name      : 'Shape Probe',
            state     : 'QLD',
            assetOwner: 'TMR',
            latitude  : -27.5,
            longitude : 153.1
        });
        expect(seed.status).to.equal(201);
        createdBridgeIds.push(seed.data.ID);

        const res = await GET(
            '/bridge-management/Bridges?$top=1&$select=ID,bridgeId,name,state'
        );
        expect(res.status).to.equal(200);
        expect(res.data.value).to.be.an('array');
        expect(res.data.value.length).to.be.at.least(1);

        const allowedKeys = new Set(['ID', 'bridgeId', 'name', 'state', '@odata.etag']);
        for (const row of res.data.value) {
            for (const key of Object.keys(row)) {
                expect(
                    allowedKeys.has(key),
                    `unexpected key '${key}' in $select response`
                ).to.equal(true);
            }
            expect(row).to.have.property('ID');
            expect(row).to.have.property('bridgeId');
            expect(row).to.have.property('name');
            expect(row).to.have.property('state');
        }
    });
});

describeIfModernNode('BridgeManagementService is booted against the real schema', () => {
    test('$metadata exposes the Lookups entity type', async () => {
        const res = await GET('/bridge-management/$metadata');
        expect(res.status).to.equal(200);
        const body = typeof res.data === 'string' ? res.data : String(res.data);
        // OData v4 metadata uses EntitySet Name="Lookups" and
        // EntityType Name="Lookup" (singular from the underlying type).
        // We assert on the entity-set token because that's what the
        // Lookups projection publishes at the service root.
        expect(body).to.include('EntitySet Name="Lookups"');
        expect(body).to.include('EntitySet Name="Bridges"');
    });
});
