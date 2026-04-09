/**
 * SuperTester v2 — Jest Global Teardown
 * Cleans up test artifacts after all suites complete.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'db', 'data');

module.exports = async function globalTeardown() {
    // Remove test snapshot DB
    const testDb = path.join(ROOT, 'db-supertester.sqlite');
    if (fs.existsSync(testDb)) {
        fs.unlinkSync(testDb);
        console.log('[SuperTester] Removed db-supertester.sqlite');
    }

    // Restore full Bridge CSV if swapped
    const bridgeCsv = path.join(DATA_DIR, 'nhvr-Bridge.csv');
    const bridgeBak = path.join(DATA_DIR, 'nhvr-Bridge.csv.st-backup');
    if (fs.existsSync(bridgeBak)) {
        fs.copyFileSync(bridgeBak, bridgeCsv);
        fs.unlinkSync(bridgeBak);
        console.log('[SuperTester] Restored nhvr-Bridge.csv → full 2,126-bridge CSV');
    }

    console.log('[SuperTester] Teardown complete');
};
