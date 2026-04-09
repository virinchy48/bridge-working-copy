/**
 * SuperTester v2 — Jest Global Setup
 *
 * Strategy: Use a pre-deployed SQLite snapshot instead of in-memory deploy.
 * - Copies db.sqlite (already has full schema + seed data) to db-supertester.sqlite
 * - Sets NODE_ENV='supertester' so CDS uses the file-based DB (no re-deploy needed)
 * - Also swaps nhvr-Bridge.csv with the 5-record minimal fixture (safety net)
 *
 * This cuts CDS server boot from ~5min (in-memory schema deploy) to ~2s.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'db', 'data');
const MIN_DIR  = path.join(__dirname, 'data');

module.exports = async function globalSetup() {
    // 1. Copy db.sqlite → db-supertester.sqlite (snapshot for this test run)
    const src = path.join(ROOT, 'db.sqlite');
    const dst = path.join(ROOT, 'db-supertester.sqlite');

    // 1a. Generate db.sqlite if it doesn't exist (clean worktree / fresh clone)
    if (!fs.existsSync(src)) {
        console.log('[SuperTester] db.sqlite not found — generating via cds deploy --to sqlite ...');
        try {
            execSync('npx cds deploy --to sqlite:db.sqlite', {
                cwd: ROOT,
                stdio: 'pipe',
                timeout: 120000,
                env: {
                    ...process.env,
                    PATH: '/Users/siddharthaampolu/.nvm/versions/node/v20.19.6/bin:' + (process.env.PATH || ''),
                    NODE_ENV: 'development'
                }
            });
            console.log('[SuperTester] db.sqlite generated successfully');
        } catch (e) {
            console.error('[SuperTester] Failed to generate db.sqlite:', e.message);
            if (e.stderr) console.error('[SuperTester] stderr:', e.stderr.toString().slice(0, 500));
        }
    }

    if (fs.existsSync(src)) {
        // Remove stale WAL/SHM files before copying to avoid "malformed" errors
        [src + '-shm', src + '-wal', dst + '-shm', dst + '-wal'].forEach(f => {
            if (fs.existsSync(f)) { fs.unlinkSync(f); }
        });
        fs.copyFileSync(src, dst);
        console.log('[SuperTester] Snapshot: db.sqlite → db-supertester.sqlite');
        // Purge any leftover test bridges from a previous failed run (bridgeId starts with 'ST-')
        try {
            const Database = require('better-sqlite3');
            const db = new Database(dst);
            const deleted = db.prepare("DELETE FROM nhvr_Bridge WHERE bridgeId LIKE 'ST-%'").run();
            if (deleted.changes > 0) {
                console.log(`[SuperTester] Purged ${deleted.changes} leftover test bridge(s) from snapshot`);
            }
            db.close();
        } catch (e) {
            console.warn('[SuperTester] Could not purge test bridges:', e.message);
        }
    } else {
        console.warn('[SuperTester] WARNING: db.sqlite not found — CDS will deploy schema (slow)');
    }

    // 2. Also swap Bridge CSV to minimal (safety net if snapshot not available)
    const bridgeCsv    = path.join(DATA_DIR, 'nhvr-Bridge.csv');
    const bridgeBak    = path.join(DATA_DIR, 'nhvr-Bridge.csv.st-backup');
    const bridgeMinimal= path.join(MIN_DIR,  'nhvr-Bridge.csv');

    if (!fs.existsSync(bridgeBak) && fs.existsSync(bridgeCsv) && fs.existsSync(bridgeMinimal)) {
        fs.copyFileSync(bridgeCsv, bridgeBak);
        fs.copyFileSync(bridgeMinimal, bridgeCsv);
        process.env.SUPERTESTER_CSV_SWAPPED = 'true';
        console.log('[SuperTester] CSV swap: nhvr-Bridge.csv → 5-record minimal fixture');
    }

    // 3. Signal test workers to use supertester NODE_ENV
    process.env.NODE_ENV = 'supertester';
    console.log('[SuperTester] Setup complete — NODE_ENV=supertester');
};
