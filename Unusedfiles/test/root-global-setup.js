/**
 * Root Jest Global Setup
 * Prepares db-supertester.sqlite for st-integration.test.js
 * by copying the pre-deployed db.sqlite snapshot.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = async function globalSetup() {
    const src = path.join(ROOT, 'db.sqlite');
    const dst = path.join(ROOT, 'db-supertester.sqlite');

    if (!fs.existsSync(src)) {
        console.warn('[root-setup] WARNING: db.sqlite not found — st-integration tests will fail');
        return;
    }

    // Remove stale WAL/SHM files before copy
    [src + '-shm', src + '-wal', dst + '-shm', dst + '-wal'].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    fs.copyFileSync(src, dst);
    console.log('[root-setup] db.sqlite → db-supertester.sqlite (snapshot ready)');

    // Purge leftover test bridges from previous runs
    try {
        const Database = require('better-sqlite3');
        const db = new Database(dst);
        const r = db.prepare("DELETE FROM nhvr_Bridge WHERE bridgeId LIKE 'ST-%'").run();
        if (r.changes > 0) console.log(`[root-setup] Purged ${r.changes} leftover ST- bridge(s)`);
        db.close();
    } catch (e) {
        console.warn('[root-setup] Could not purge test bridges:', e.message);
    }
};
