/**
 * SuperTester v2 — dedicated Jest config
 * Run: npx jest --config test/supertester-v2/jest.config.js
 *
 * Uses globalSetup/Teardown to swap the 2,126-bridge CSV with a
 * 5-record minimal fixture for fast CDS server boot (~5s).
 */
'use strict';

module.exports = {
    testEnvironment   : 'node',
    testMatch         : ['<rootDir>/st-*.test.js'],
    testTimeout       : 60000,
    globalSetup       : '<rootDir>/global-setup.js',
    globalTeardown    : '<rootDir>/global-teardown.js',
    // setupFiles runs in each worker BEFORE test modules are loaded.
    // This ensures NODE_ENV=supertester is set before @sap/cds is first required,
    // so CDS reads the [supertester] profile from .cdsrc.json.
    setupFiles        : ['<rootDir>/env-setup.js'],
    forceExit         : true,
    verbose           : true,
    // Run serially — integration suite must not share CDS state across workers
    maxWorkers        : 1,
};
