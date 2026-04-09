/**
 * SuperTester v2 — Jest Global Setup
 * Patches cds.env BEFORE CDS boots to use minimal seed data (5 bridges)
 * instead of the full 2,126-bridge production CSV.
 * This makes the integration test boot in ~5s instead of ~5min.
 */
'use strict';

const path = require('path');

module.exports = async function globalSetup() {
    // Override CDS data directory for this test run
    // CDS reads this from process.env and uses it as the data folder prefix
    process.env.SUPERTESTER_DATA_DIR = path.resolve(__dirname, 'data');
};
