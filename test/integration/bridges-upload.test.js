'use strict';

// Integration test for the `massUploadBridges` OData action on
// BridgeManagementService. Boots a CAP server via cds.test() against an
// in-memory SQLite DB with dummy auth, then hits the HTTP endpoint with
// csv payloads and verifies round-trip behaviour against the OData
// `Bridges` read endpoint.

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
const { GET, POST, DELETE, expect } = cds.test(projectRoot);

const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
const describeIfModernNode = NODE_MAJOR >= 20 ? describe : describe.skip;

describeIfModernNode('massUploadBridges integration', () => {
    // Track UUIDs (not business bridgeId) so cleanup can DELETE by key.
    const createdUuids = [];

    beforeAll(() => {
        // eslint-disable-next-line no-console
        console.log('[bridges-upload.test] cds.test booted, node', process.versions.node);
    });

    afterEach(async () => {
        while (createdUuids.length) {
            const id = createdUuids.pop();
            try {
                await DELETE(`/bridge-management/Bridges(${id})`);
            } catch (_) {
                // swallow — :memory: db is ephemeral anyway
            }
        }
    });

    async function findBridge(bridgeId) {
        const res = await GET(
            `/bridge-management/Bridges?$filter=bridgeId eq '${bridgeId}'`
        );
        return res.data.value || [];
    }

    async function trackAndCleanup(bridgeId) {
        const rows = await findBridge(bridgeId);
        rows.forEach(r => { if (r.ID) createdUuids.push(r.ID); });
    }

    test('INSERT path: a brand-new row is created via mass upload', async () => {
        const bridgeId = 'BRG-IT-CREATE';
        const csvData =
            'bridgeId,name,state,assetOwner,latitude,longitude\n' +
            `${bridgeId},Integration Test Create,NSW,TMR,-27.5,153.0\n`;

        const response = await POST(
            '/bridge-management/massUploadBridges',
            { csvData }
        );

        expect(response.status).to.equal(200);
        expect(response.data.successCount).to.equal(1);
        expect(response.data.updatedCount).to.equal(0);
        expect(response.data.failureCount).to.equal(0);
        expect(response.data.totalRecords).to.equal(1);

        const rows = await findBridge(bridgeId);
        expect(rows).to.have.lengthOf(1);
        expect(rows[0].name).to.equal('Integration Test Create');
        expect(Number(rows[0].latitude)).to.equal(-27.5);
        expect(Number(rows[0].longitude)).to.equal(153.0);

        await trackAndCleanup(bridgeId);
    });

    test('UPDATE path: re-uploading the same bridgeId updates the row', async () => {
        const bridgeId = 'BRG-IT-UPDATE';

        const csv1 =
            'bridgeId,name,state,assetOwner,latitude,longitude\n' +
            `${bridgeId},Initial Name,NSW,TMR,-27.0,153.0\n`;
        const first = await POST(
            '/bridge-management/massUploadBridges',
            { csvData: csv1 }
        );
        expect(first.status).to.equal(200);
        expect(first.data.successCount).to.equal(1);
        expect(first.data.updatedCount).to.equal(0);

        const csv2 =
            'bridgeId,name,state,assetOwner,latitude,longitude\n' +
            `${bridgeId},Updated Name,NSW,TMR,-28.0,153.5\n`;
        const second = await POST(
            '/bridge-management/massUploadBridges',
            { csvData: csv2 }
        );
        expect(second.status).to.equal(200);
        expect(second.data.updatedCount).to.equal(1);
        expect(second.data.successCount).to.equal(0);
        expect(second.data.failureCount).to.equal(0);

        const rows = await findBridge(bridgeId);
        expect(rows).to.have.lengthOf(1);
        expect(rows[0].name).to.equal('Updated Name');
        expect(Number(rows[0].latitude)).to.equal(-28.0);

        await trackAndCleanup(bridgeId);
    });

    test('Validation: a row with missing required field reports failure but does not 500', async () => {
        const csvData =
            'bridgeId,name,state,assetOwner,latitude,longitude\n' +
            'BRG-IT-BAD,,NSW,TMR,-27.0,153.0\n';

        const response = await POST(
            '/bridge-management/massUploadBridges',
            { csvData }
        );

        expect(response.status).to.equal(200);
        expect(response.data.failureCount).to.be.at.least(1);
        expect(response.data.successCount).to.equal(0);

        const errors = String(response.data.errors || '');
        // Handler logs "Row <n>: bridgeId and name are required" — row 2
        // is the first data row (row 1 is the header).
        expect(errors.toLowerCase()).to.include('row 2');
        expect(errors.toLowerCase()).to.include('required');

        // Belt-and-braces: nothing should have been persisted for BRG-IT-BAD.
        const rows = await findBridge('BRG-IT-BAD');
        expect(rows).to.have.lengthOf(0);
    });

    test('Validation: unknown column returns 400 and names the bad column', async () => {
        const csvData =
            'bridgeId,name,bogusColumn\n' +
            'BRG-IT-UNKNOWN,Some Name,oops\n';

        let caught;
        try {
            await POST(
                '/bridge-management/massUploadBridges',
                { csvData }
            );
        } catch (err) {
            caught = err;
        }
        expect(caught, 'expected POST to throw on unknown column').to.exist;
        const status = caught.response ? caught.response.status : caught.code;
        expect(status).to.equal(400);

        const body = caught.response && caught.response.data
            ? JSON.stringify(caught.response.data)
            : (caught.message || '');
        expect(body.toLowerCase()).to.include('bogus');
        expect(body.toLowerCase()).to.include('unexpected columns');

        // Should never have touched the DB.
        const rows = await findBridge('BRG-IT-UNKNOWN');
        expect(rows).to.have.lengthOf(0);
    });

    test('Validation: empty csvData returns 400', async () => {
        let caught;
        try {
            await POST(
                '/bridge-management/massUploadBridges',
                { csvData: '' }
            );
        } catch (err) {
            caught = err;
        }
        expect(caught, 'expected POST to throw on empty csvData').to.exist;
        const status = caught.response ? caught.response.status : caught.code;
        expect(status).to.equal(400);
    });

    test('Regression guard: GET after POST reflects the fresh DB state', async () => {
        const bridgeId = 'BRG-IT-REGRESSION';

        const before = await findBridge(bridgeId);
        expect(before).to.have.lengthOf(0);

        const csvData =
            'bridgeId,name,state,assetOwner,latitude,longitude\n' +
            `${bridgeId},Regression Guard Bridge,QLD,TMR,-26.5,152.5\n`;
        const response = await POST(
            '/bridge-management/massUploadBridges',
            { csvData }
        );
        expect(response.status).to.equal(200);
        expect(response.data.successCount).to.equal(1);

        const after = await findBridge(bridgeId);
        expect(after).to.have.lengthOf(1);
        expect(after[0].name).to.equal('Regression Guard Bridge');
        expect(Number(after[0].latitude)).to.equal(-26.5);

        await trackAndCleanup(bridgeId);
    });
});
