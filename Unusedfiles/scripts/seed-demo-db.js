/**
 * seed-demo-db.js
 *
 * Seeds the demo SQLite database (db-demo.sqlite) with synthetic training data.
 * Run via: npm run demo:seed
 *
 * This copies db.sqlite → db-demo.sqlite, then removes all real bridge data
 * and inserts synthetic training records (prefixed with DEMO-).
 * Production data is NEVER modified.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src  = path.join(ROOT, 'db.sqlite');
const dst  = path.join(ROOT, 'db-demo.sqlite');

if (!fs.existsSync(src)) {
    console.error('[demo:seed] db.sqlite not found. Run: cds deploy --to sqlite first.');
    process.exit(1);
}

// Copy current db.sqlite as the demo base
fs.copyFileSync(src, dst);
console.log('[demo:seed] Copied db.sqlite → db-demo.sqlite');

const Database = require('better-sqlite3');
const db       = new Database(dst);

// ── Wipe existing bridge data (replace with demo records) ──────────────────
db.prepare("DELETE FROM nhvr_Bridge WHERE bridgeId NOT LIKE 'DEMO-%'").run();
db.prepare("DELETE FROM nhvr_Restriction").run();
db.prepare("DELETE FROM nhvr_InspectionOrder").run();
db.prepare("DELETE FROM nhvr_BridgeDefect").run();
db.prepare("DELETE FROM nhvr_AuditLog").run();
db.prepare("DELETE FROM nhvr_UploadLog").run();
console.log('[demo:seed] Cleared non-demo data');

// ── Insert demo bridges ─────────────────────────────────────────────────────
const insertBridge = db.prepare(`
    INSERT OR IGNORE INTO nhvr_Bridge
    (ID, bridgeId, name, region, state, structureType, material,
     latitude, longitude, condition, conditionScore, conditionRating,
     postingStatus, isActive, assetOwner, yearBuilt, totalLengthM, widthM,
     numberOfLanes, scourRisk, highPriorityAsset)
    VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))),2) || '-' ||
            substr('89ab',abs(random()) % 4 + 1, 1) ||
            substr(lower(hex(randomblob(2))),2) || '-' ||
            lower(hex(randomblob(6))),
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, 1, ?, ?, ?, ?,
    ?, ?, ?)
`);

const DEMO_BRIDGES = [
    { id:'DEMO-NSW-001', name:'Demo Hawkesbury River Bridge', region:'Greater Sydney', state:'NSW', lat:-33.57, lng:150.79, cond:'GOOD', score:82, rating:8, posting:'UNRESTRICTED', owner:'NSW Roads', year:1992, len:320.0, wid:12.0, lanes:4, scour:'LOW', hp:true,  struct:'BEAM',       mat:'Concrete' },
    { id:'DEMO-NSW-002', name:'Demo Nepean River Crossing',   region:'Greater Sydney', state:'NSW', lat:-33.76, lng:150.72, cond:'FAIR', score:55, rating:5, posting:'POSTED',       owner:'NSW Roads', year:1978, len: 85.0, wid: 8.0, lanes:2, scour:'MEDIUM', hp:false, struct:'ARCH',       mat:'Steel' },
    { id:'DEMO-VIC-001', name:'Demo Yarra River Bridge',      region:'Metro Melbourne',state:'VIC', lat:-37.82, lng:145.01, cond:'GOOD', score:76, rating:7, posting:'UNRESTRICTED', owner:'VicRoads',  year:2005, len:145.0, wid:14.0, lanes:4, scour:'LOW', hp:false, struct:'BOX_GIRDER', mat:'Prestressed Concrete' },
    { id:'DEMO-VIC-002', name:'Demo Murray River Bridge',     region:'North Victoria', state:'VIC', lat:-36.08, lng:146.93, cond:'POOR', score:31, rating:3, posting:'POSTED',       owner:'VicRoads',  year:1965, len: 62.0, wid: 6.5, lanes:2, scour:'HIGH', hp:true,  struct:'TRUSS',      mat:'Steel' },
    { id:'DEMO-QLD-001', name:'Demo Brisbane River Crossing', region:'Greater Brisbane',state:'QLD', lat:-27.47, lng:153.02, cond:'GOOD', score:90, rating:9, posting:'UNRESTRICTED', owner:'TMR',       year:2010, len:280.0, wid:16.0, lanes:4, scour:'LOW', hp:false, struct:'BEAM',       mat:'Concrete' },
    { id:'DEMO-QLD-002', name:'Demo Fitzroy River Bridge',    region:'Central QLD',    state:'QLD', lat:-23.38, lng:150.51, cond:'FAIR', score:61, rating:6, posting:'UNRESTRICTED', owner:'TMR',       year:1988, len:190.0, wid:10.0, lanes:2, scour:'MEDIUM', hp:true,  struct:'BEAM',       mat:'Concrete' },
    { id:'DEMO-SA-001',  name:'Demo Torrens River Crossing',  region:'Adelaide Metro', state:'SA',  lat:-34.92, lng:138.60, cond:'CRITICAL',score:18, rating:2, posting:'CLOSED',  owner:'DPTI',      year:1952, len: 42.0, wid: 5.5, lanes:1, scour:'CRITICAL', hp:true,  struct:'CULVERT',    mat:'Timber' },
    { id:'DEMO-WA-001',  name:'Demo Swan River Bridge',       region:'Perth Metro',    state:'WA',  lat:-31.97, lng:115.86, cond:'GOOD', score:85, rating:8, posting:'UNRESTRICTED', owner:'MRWA',      year:2001, len:220.0, wid:14.0, lanes:4, scour:'LOW', hp:false, struct:'BOX_GIRDER', mat:'Concrete' },
    { id:'DEMO-WA-002',  name:'Demo Gascoyne River Bridge',   region:'Mid West',       state:'WA',  lat:-24.88, lng:113.66, cond:'POOR', score:38, rating:4, posting:'POSTED',       owner:'MRWA',      year:1971, len: 95.0, wid: 7.0, lanes:2, scour:'HIGH', hp:true,  struct:'BEAM',       mat:'Steel' },
    { id:'DEMO-VIC-003', name:'Demo Maribyrnong Bridge',      region:'Metro Melbourne',state:'VIC', lat:-37.78, lng:144.88, cond:'FAIR', score:58, rating:5, posting:'UNRESTRICTED', owner:'VicRoads',  year:1983, len: 75.0, wid: 9.0, lanes:2, scour:'LOW', hp:false, struct:'BEAM',       mat:'Concrete' }
];

DEMO_BRIDGES.forEach(b => {
    insertBridge.run(
        b.id, b.name, b.region, b.state, b.struct, b.mat,
        b.lat, b.lng, b.cond, b.score, b.rating,
        b.posting, b.owner, b.year, b.len, b.wid,
        b.lanes, b.scour, b.hp ? 1 : 0
    );
});
console.log(`[demo:seed] Inserted ${DEMO_BRIDGES.length} demo bridges`);

// ── Insert demo restrictions ────────────────────────────────────────────────
const bridgeRows = db.prepare("SELECT ID, bridgeId FROM nhvr_Bridge WHERE bridgeId LIKE 'DEMO-%'").all();
const bridgeMap  = {};
bridgeRows.forEach(b => { bridgeMap[b.bridgeId] = b.ID; });

const insertRestriction = db.prepare(`
    INSERT INTO nhvr_Restriction
    (ID, bridge_ID, restrictionType, value, unit, status, isActive, notes)
    VALUES (lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
    ?, ?, ?, ?, 'ACTIVE', 1, ?)
`);

const DEMO_RESTRICTIONS = [
    { bridge:'DEMO-NSW-002', type:'GROSS_MASS',  val:42.5, unit:'t',    note:'Structural load limit — posted bridge' },
    { bridge:'DEMO-VIC-002', type:'GROSS_MASS',  val:32.5, unit:'t',    note:'Old steel truss — reduced capacity' },
    { bridge:'DEMO-VIC-002', type:'HEIGHT',      val: 4.2, unit:'m',    note:'Low clearance restriction' },
    { bridge:'DEMO-SA-001',  type:'GROSS_MASS',  val: 0.0, unit:'t',    note:'Bridge closed — no through traffic' },
    { bridge:'DEMO-WA-002',  type:'GROSS_MASS',  val:38.0, unit:'t',    note:'Posted due to scour damage' },
    { bridge:'DEMO-QLD-002', type:'SPEED',       val:60.0, unit:'km/h', note:'Speed restriction on approach' }
];

DEMO_RESTRICTIONS.forEach(r => {
    if (bridgeMap[r.bridge]) {
        insertRestriction.run(bridgeMap[r.bridge], r.type, r.val, r.unit, r.note);
    }
});
console.log(`[demo:seed] Inserted ${DEMO_RESTRICTIONS.length} demo restrictions`);

// ── Insert demo inspection orders ──────────────────────────────────────────
const insertOrder = db.prepare(`
    INSERT INTO nhvr_InspectionOrder
    (ID, bridge_ID, orderNumber, inspectionType, status, plannedDate, inspector, inspectorOrg, notes)
    VALUES (lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
    ?, ?, ?, ?, ?, ?, ?, ?)
`);

const today = new Date().toISOString().slice(0,10);
const past  = '2024-03-15';
const future = '2026-12-01';

const DEMO_ORDERS = [
    { bridge:'DEMO-VIC-002', num:'INS-DEMO-001', type:'PRINCIPAL', status:'COMPLETED', date:past,   insp:'J.Smith',   org:'VicRoads Engineering', note:'6-yearly principal inspection completed' },
    { bridge:'DEMO-SA-001',  num:'INS-DEMO-002', type:'SPECIAL',   status:'IN_PROGRESS',date:today, insp:'A.Jones',   org:'DPTI Bridges',         note:'Special inspection following flood event' },
    { bridge:'DEMO-NSW-002', num:'INS-DEMO-003', type:'ROUTINE',   status:'PLANNED',   date:'2025-09-01', insp:'M.Chan', org:'NSW Roads',          note:'Annual routine inspection due' },
    { bridge:'DEMO-WA-002',  num:'INS-DEMO-004', type:'SPECIAL',   status:'PLANNED',   date:'2025-06-01', insp:'B.Kumar','org':'MRWA',              note:'Scour investigation required' },
    { bridge:'DEMO-VIC-001', num:'INS-DEMO-005', type:'ROUTINE',   status:'PLANNED',   date:future, insp:'T.Wilson',  org:'VicRoads Engineering', note:'Next scheduled routine inspection' }
];

DEMO_ORDERS.forEach(o => {
    if (bridgeMap[o.bridge]) {
        insertOrder.run(bridgeMap[o.bridge], o.num, o.type, o.status, o.date, o.insp, o.org, o.note);
    }
});
console.log(`[demo:seed] Inserted ${DEMO_ORDERS.length} demo inspection orders`);

// ── Insert demo defects ────────────────────────────────────────────────────
const insertDefect = db.prepare(`
    INSERT INTO nhvr_BridgeDefect
    (ID, bridge_ID, defectNumber, defectCategory, severity, status, description, detectedDate, detectedBy, repairEstimateAUD)
    VALUES (lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
    ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const DEMO_DEFECTS = [
    { bridge:'DEMO-VIC-002', num:'DEF-DEMO-001', cat:'STRUCTURAL',    sev:'HIGH',     status:'OPEN',         desc:'Significant section loss in main truss upper chord, span 3',  date:'2024-03-15', by:'J.Smith',  est:185000 },
    { bridge:'DEMO-SA-001',  num:'DEF-DEMO-002', cat:'STRUCTURAL',    sev:'CRITICAL', status:'OPEN',         desc:'Severe timber deck rot across full width — unsafe for traffic',  date:'2024-01-20', by:'A.Jones',  est:520000 },
    { bridge:'DEMO-WA-002',  num:'DEF-DEMO-003', cat:'DURABILITY',    sev:'HIGH',     status:'UNDER_REPAIR', desc:'Scour undermining eastern abutment foundation',                   date:'2024-06-10', by:'B.Kumar',  est:275000 },
    { bridge:'DEMO-NSW-002', num:'DEF-DEMO-004', cat:'SERVICEABILITY', sev:'MEDIUM',  status:'OPEN',         desc:'Transverse cracking in deck surface, span 2 — 3mm average width', date:'2024-08-05', by:'M.Chan',   est: 45000 },
    { bridge:'DEMO-QLD-002', num:'DEF-DEMO-005', cat:'SAFETY',        sev:'LOW',      status:'MONITORING',   desc:'Handrail post loose at south approach, span 1 walkway',           date:'2024-09-12', by:'P.Tran',   est:  8500 }
];

DEMO_DEFECTS.forEach(d => {
    if (bridgeMap[d.bridge]) {
        insertDefect.run(bridgeMap[d.bridge], d.num, d.cat, d.sev, d.status, d.desc, d.date, d.by, d.est);
    }
});
console.log(`[demo:seed] Inserted ${DEMO_DEFECTS.length} demo defects`);

db.close();
console.log('\n[demo:seed] Demo database ready: db-demo.sqlite');
console.log('[demo:seed] Start training instance with: npm run demo');
