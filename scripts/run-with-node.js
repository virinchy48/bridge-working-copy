#!/usr/bin/env node
// ============================================================
// run-with-node.js — guard a sub-command on a minimum Node major
// ============================================================
//
// Usage:
//   node scripts/run-with-node.js <minMajor> <command> [args...]
//
// Example — `npm run test:integration` without this wrapper fails on
// Node 16 because @sap/cds v9 requires Node 20, and jest workers crash
// before any in-file `describe.skip` gate can fire. This wrapper prints
// a clear skip message and exits 0 when the current Node major is below
// the required floor, so local dev loops on older Node don't go red.
//
// It is NOT a license to run integration tests on Node < 20 — CI must
// still run on a Node version matching `engines.node` in package.json.
// The skip is only to avoid punishing dev machines that happen to be on
// an older default Node.
// ============================================================

'use strict';

const required = parseInt(process.argv[2] || '20', 10);
if (Number.isNaN(required)) {
    console.error('[run-with-node] first arg must be a Node major version');
    process.exit(2);
}

const currentMajor = parseInt(process.versions.node.split('.')[0], 10);
if (currentMajor < required) {
    console.log(
        `[run-with-node] skipped — needs Node >= ${required}; current ${process.versions.node}`
    );
    process.exit(0);
}

const [, , , command, ...args] = process.argv;
if (!command) process.exit(0);

const { spawnSync } = require('child_process');
const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
if (result.error) {
    console.error('[run-with-node]', result.error.message);
    process.exit(result.status === null ? 1 : result.status);
}
process.exit(result.status === null ? 0 : result.status);
