'use strict';

// Integration test for the `massUploadLookups` OData action on
// BridgeManagementService. Boots a CAP server via cds.test() against an
// in-memory SQLite DB with dummy auth, then hammers the HTTP endpoint.

jest.setTimeout(60000);

// Force in-memory SQLite + dummy auth BEFORE `@sap/cds` is required.
process.env.CDS_CONFIG = JSON.stringify({
    requires: {
        db: { kind: 'sqlite', credentials: { url: ':memory:' } },
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

describeIfModernNode('massUploadLookups integration', () => {
    const createdIds = [];

    beforeAll(() => {
        // eslint-disable-next-line no-console
        console.log('[lookups-upload.test] cds.test booted, node', process.versions.node);
    });

    afterEach(async () => {
        // Clean up any rows inserted during the test so sequential tests
        // don't leak into each other (belt-and-braces — :memory: DB will
        // be dropped at process exit anyway).
        while (createdIds.length) {
            const id = createdIds.pop();
            try {
                await DELETE(`/bridge-management/Lookups(${id})`);
            } catch (_) {
                // ignore — row may already be gone
            }
        }
    });

    async function findLookup(category, code) {
        const res = await GET(
            `/bridge-management/Lookups?$filter=category eq '${category}' and code eq '${code}'`
        );
        return res.data.value || [];
    }

    async function trackAndCleanup(category, code) {
        const rows = await findLookup(category, code);
        rows.forEach(r => { if (r.ID) createdIds.push(r.ID); });
    }

    test('INSERT path: new row is created via mass upload', async () => {
        const category = 'REGION';
        const code = 'TEST:INTEGRATION_A';
        const csvData =
            'category,code,description,displayOrder,isActive\n' +
            `${category},${code},Integration test A,900,true\n`;

        const response = await POST(
            '/bridge-management/massUploadLookups',
            { csvData, fileBase64: '', fileName: 'ins.csv' }
        );

        expect(response.status).to.equal(200);
        expect(response.data.successCount).to.equal(1);
        expect(response.data.updatedCount).to.equal(0);
        expect(response.data.failureCount).to.equal(0);
        expect(response.data.totalRecords).to.equal(1);

        const rows = await findLookup(category, code);
        expect(rows).to.have.lengthOf(1);
        expect(rows[0].description).to.equal('Integration test A');
        expect(rows[0].displayOrder).to.equal(900);

        await trackAndCleanup(category, code);
    });

    test('UPDATE path: re-uploading the same category+code updates it', async () => {
        const category = 'REGION';
        const code = 'TEST:INTEGRATION_B';

        const csv1 =
            'category,code,description,displayOrder,isActive\n' +
            `${category},${code},Initial description,10,true\n`;
        const first = await POST(
            '/bridge-management/massUploadLookups',
            { csvData: csv1, fileBase64: '', fileName: 'upd1.csv' }
        );
        expect(first.data.successCount).to.equal(1);
        expect(first.data.updatedCount).to.equal(0);

        const csv2 =
            'category,code,description,displayOrder,isActive\n' +
            `${category},${code},Updated description,20,true\n`;
        const second = await POST(
            '/bridge-management/massUploadLookups',
            { csvData: csv2, fileBase64: '', fileName: 'upd2.csv' }
        );
        expect(second.status).to.equal(200);
        expect(second.data.updatedCount).to.equal(1);
        expect(second.data.successCount).to.equal(0);
        expect(second.data.failureCount).to.equal(0);

        const rows = await findLookup(category, code);
        expect(rows).to.have.lengthOf(1);
        expect(rows[0].description).to.equal('Updated description');
        expect(rows[0].displayOrder).to.equal(20);

        await trackAndCleanup(category, code);
    });

    test('Validation: empty csvData returns 400', async () => {
        let caught;
        try {
            await POST(
                '/bridge-management/massUploadLookups',
                { csvData: '', fileBase64: '', fileName: '' }
            );
        } catch (err) {
            caught = err;
        }
        expect(caught, 'expected POST to throw on empty csvData').to.exist;
        const status = caught.response ? caught.response.status : caught.code;
        expect(status).to.equal(400);
    });

    test('Validation: unknown column returns 400 and names the bad column', async () => {
        const csvData =
            'category,code,bogusColumn\n' +
            'REGION,TEST:INTEGRATION_BAD,oops\n';
        let caught;
        try {
            await POST(
                '/bridge-management/massUploadLookups',
                { csvData, fileBase64: '', fileName: 'bad.csv' }
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
    });

    test('Regression guard: GET after POST reflects the fresh DB state', async () => {
        const category = 'REGION';
        const code = 'TEST:INTEGRATION_REGRESSION';

        const before = await findLookup(category, code);
        expect(before).to.have.lengthOf(0);

        const csvData =
            'category,code,description,displayOrder,isActive\n' +
            `${category},${code},Regression guard row,500,true\n`;
        const response = await POST(
            '/bridge-management/massUploadLookups',
            { csvData, fileBase64: '', fileName: 'reg.csv' }
        );
        expect(response.status).to.equal(200);
        expect(response.data.successCount).to.equal(1);

        const after = await findLookup(category, code);
        expect(after).to.have.lengthOf(1);
        expect(after[0].description).to.equal('Regression guard row');
        expect(after[0].displayOrder).to.equal(500);

        await trackAndCleanup(category, code);
    });
});
