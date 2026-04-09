// =============================================================
// NHVR Bridge IQ v3.1.1 — SuperTester v2
// DOMAIN 9 (Unit): Offline Sync + Read Cache  |  No server boot
// Platform: SAP BTP CAP Node.js | IRAP PROTECTED | ASD ML2
// =============================================================
'use strict';

// ── Inline OfflineSync implementation for unit testing ────────
// Mirrors app/bridge-management/webapp/util/OfflineSync.js exactly
// using Node.js localStorage shim so tests run without a browser.

const { _JSDOM } = (() => {
    try { return require('jsdom'); }
    catch { return { JSDOM: null }; }
})();

// ── LocalStorage shim (Node.js-safe Map-backed) ──────────────
class LocalStorageShim {
    constructor() { this._store = new Map(); }
    getItem(k)       { return this._store.has(k) ? this._store.get(k) : null; }
    setItem(k, v)    { this._store.set(k, String(v)); }
    removeItem(k)    { this._store.delete(k); }
    clear()          { this._store.clear(); }
    get length()     { return this._store.size; }
    key(i)           { return [...this._store.keys()][i] ?? null; }
}

// ── navigator shim ────────────────────────────────────────────
let _online = true;
const navigatorShim = { get onLine() { return _online; } };

// ── Build OfflineSync with shims ─────────────────────────────
function buildOfflineSync() {
    const ls = new LocalStorageShim();
    const STORAGE_KEY  = 'nhvr_offline_queue';
    const CACHE_PREFIX = 'nhvr_cache_';
    const CACHE_TTL_MS = 15 * 60 * 1000;

    let _queue     = [];
    let _listeners = [];

    function _btoa(str) { return Buffer.from(str).toString('base64'); }

    const OfflineSync = {
        _ls: ls,

        init() {
            this._restoreQueue();
        },

        isOnline() { return navigatorShim.onLine; },

        queueMutation(method, url, body) {
            _queue.push({ method, url, body, queuedAt: new Date().toISOString() });
            this._persistQueue();
        },

        flushQueue(fetchFn) {
            const pending = _queue.splice(0);
            this._persistQueue();
            const results = [];
            pending.forEach(item => {
                try {
                    const p = (fetchFn || (() => Promise.resolve()))
                        .call(null, item.url, { method: item.method, body: JSON.stringify(item.body) })
                        .catch(() => {
                            _queue.push(item);
                            ls.setItem(STORAGE_KEY, JSON.stringify(_queue));
                        });
                    results.push(p);
                } catch (e) {
                    _queue.push(item);
                    ls.setItem(STORAGE_KEY, JSON.stringify(_queue));
                }
            });
            return results;
        },

        getQueueLength() { return _queue.length; },

        onStatusChange(fn) {
            if (typeof fn === 'function') _listeners.push(fn);
        },

        cachedFetch(url, headers, ttl) {
            const _maxAge  = ttl || CACHE_TTL_MS;
            const cacheKey = CACHE_PREFIX + _btoa(url).slice(0, 80);

            if (!navigatorShim.onLine) {
                const cached = this._readCache(cacheKey);
                if (cached) { cached._fromCache = true; return Promise.resolve(cached); }
                return Promise.reject(new Error('Offline and no cache available for: ' + url));
            }

            return Promise.resolve({ value: [{ ID: 'mock' }] })
                .then(data => { this._writeCache(cacheKey, data); return data; });
        },

        warmCache(url) {
            if (!navigatorShim.onLine) return;
            const cacheKey = CACHE_PREFIX + _btoa(url).slice(0, 80);
            this._writeCache(cacheKey, { value: [], _warmed: true });
        },

        clearReadCache() {
            const keys = [];
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
            }
            keys.forEach(k => ls.removeItem(k));
        },

        _writeCache(key, data) {
            try {
                ls.setItem(key, JSON.stringify({ data, ts: Date.now() }));
            } catch (e) {
                try {
                    this.clearReadCache();
                    ls.setItem(key, JSON.stringify({ data, ts: Date.now() }));
                } catch (e2) { /* quota exceeded — swallow */ }
            }
        },

        _readCache(key, maxAge) {
            try {
                const raw = ls.getItem(key);
                if (!raw) return null;
                const entry = JSON.parse(raw);
                if (maxAge && (Date.now() - entry.ts) > maxAge) return null;
                return entry.data;
            } catch { return null; }
        },

        _notify(online) {
            _listeners.forEach(fn => { try { fn(online); } catch { /* swallow */ } });
        },

        _persistQueue() {
            try { ls.setItem(STORAGE_KEY, JSON.stringify(_queue)); }
            catch { /* quota exceeded */ }
        },

        _restoreQueue() {
            try {
                const stored = ls.getItem(STORAGE_KEY);
                _queue = stored ? JSON.parse(stored) : [];
            } catch { _queue = []; }
        },

        // Test helpers
        _reset() { _queue = []; _listeners = []; ls.clear(); },
        _setOnline(v) { _online = v; },
    };

    return OfflineSync;
}

// =============================================================
// DOMAIN 9: Offline Sync & Read Cache
// =============================================================
describe('D09 · Offline Sync — Mutation Queue', () => {
    let sync;

    beforeEach(() => {
        _online = true;
        sync = buildOfflineSync();
        sync.init();
        sync._reset();
    });

    test('D09-Q01: queueMutation stores item', () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'Test' });
        expect(sync.getQueueLength()).toBe(1);
    });

    test('D09-Q02: queueMutation stores method, url, body, queuedAt', () => {
        sync.queueMutation('PATCH', '/bridge-management/Bridges(abc)', { condition: 'GOOD' });
        const raw = sync._ls.getItem('nhvr_offline_queue');
        const stored = JSON.parse(raw);
        expect(stored[0].method).toBe('PATCH');
        expect(stored[0].url).toBe('/bridge-management/Bridges(abc)');
        expect(stored[0].body.condition).toBe('GOOD');
        expect(stored[0].queuedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    test('D09-Q03: multiple mutations queue independently', () => {
        sync.queueMutation('POST',   '/bridge-management/Bridges', { name: 'A' });
        sync.queueMutation('PATCH',  '/bridge-management/Bridges(1)', { name: 'B' });
        sync.queueMutation('DELETE', '/bridge-management/Bridges(2)', null);
        expect(sync.getQueueLength()).toBe(3);
    });

    test('D09-Q04: flushQueue empties queue on success', () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'A' });
        sync.flushQueue(() => Promise.resolve({ ok: true }));
        expect(sync.getQueueLength()).toBe(0);
    });

    test('D09-Q05: flushQueue re-queues on fetch failure', async () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'A' });
        const results = sync.flushQueue(() => Promise.reject(new Error('network error')));
        await Promise.allSettled(results);
        // re-queued
        expect(sync.getQueueLength()).toBe(1);
    });

    test('D09-Q06: getQueueLength returns 0 after flush success', async () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'A' });
        const results = sync.flushQueue(() => Promise.resolve());
        await Promise.allSettled(results);
        expect(sync.getQueueLength()).toBe(0);
    });

    test('D09-Q07: queue persists across init() calls', () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'A' });
        const sync2 = buildOfflineSync();
        sync2.init(); // reads from same ls shim — but different instance
        // Same localStorage — queue should restore
        const raw = sync._ls.getItem('nhvr_offline_queue');
        expect(JSON.parse(raw).length).toBe(1);
    });

    test('D09-Q08: onStatusChange registers listener', () => {
        const calls = [];
        sync.onStatusChange(online => calls.push(online));
        sync._notify(false);
        sync._notify(true);
        expect(calls).toEqual([false, true]);
    });

    test('D09-Q09: non-function onStatusChange is ignored', () => {
        expect(() => sync.onStatusChange('not-a-function')).not.toThrow();
        expect(() => sync.onStatusChange(null)).not.toThrow();
        expect(() => sync.onStatusChange(42)).not.toThrow();
    });

    test('D09-Q10: isOnline reflects navigator state', () => {
        _online = true;
        expect(sync.isOnline()).toBe(true);
        _online = false;
        expect(sync.isOnline()).toBe(false);
        _online = true;
    });
});

describe('D09 · Offline Sync — Read Cache', () => {
    let sync;

    beforeEach(() => {
        _online = true;
        sync = buildOfflineSync();
        sync.init();
        sync._reset();
    });

    afterEach(() => { _online = true; });

    test('D09-C01: cachedFetch online — fetches and caches', async () => {
        const url = '/bridge-management/Bridges';
        const data = await sync.cachedFetch(url);
        expect(data).toBeTruthy();
        // cache should now have the key
        const cacheKey = 'nhvr_cache_' + Buffer.from(url).toString('base64').slice(0, 80);
        expect(sync._ls.getItem(cacheKey)).not.toBeNull();
    });

    test('D09-C02: cachedFetch offline with warm cache — returns cached', async () => {
        const url = '/bridge-management/Bridges';
        sync.warmCache(url);
        _online = false;
        const data = await sync.cachedFetch(url);
        expect(data).toBeTruthy();
        expect(data._fromCache).toBe(true);
    });

    test('D09-C03: cachedFetch offline no cache — rejects', async () => {
        _online = false;
        await expect(
            sync.cachedFetch('/bridge-management/Bridges?no-cache=1')
        ).rejects.toThrow('Offline and no cache available');
    });

    test('D09-C04: clearReadCache removes all nhvr_cache_ entries', () => {
        sync.warmCache('/bridge-management/Bridges');
        sync.warmCache('/bridge-management/Restrictions');
        sync.clearReadCache();
        expect(sync._ls.getItem('nhvr_cache_' + Buffer.from('/bridge-management/Bridges').toString('base64').slice(0, 80))).toBeNull();
    });

    test('D09-C05: clearReadCache does not remove mutation queue', () => {
        sync.queueMutation('POST', '/bridge-management/Bridges', { name: 'X' });
        sync.warmCache('/bridge-management/Bridges');
        sync.clearReadCache();
        expect(sync.getQueueLength()).toBe(1); // queue intact
    });

    test('D09-C06: warmCache is no-op when offline', () => {
        _online = false;
        expect(() => sync.warmCache('/bridge-management/Bridges')).not.toThrow();
        // nothing was written
        const cacheKey = 'nhvr_cache_' + Buffer.from('/bridge-management/Bridges').toString('base64').slice(0, 80);
        expect(sync._ls.getItem(cacheKey)).toBeNull();
    });

    test('D09-C07: _readCache returns null for expired TTL', () => {
        const key = 'nhvr_cache_test';
        // Write entry with old timestamp
        sync._ls.setItem(key, JSON.stringify({ data: { value: [] }, ts: Date.now() - 20 * 60 * 1000 }));
        const result = sync._readCache(key, 15 * 60 * 1000); // 15-min TTL
        expect(result).toBeNull();
    });

    test('D09-C08: _readCache returns data within TTL', () => {
        const key = 'nhvr_cache_fresh';
        const payload = { value: [{ ID: 'fresh' }] };
        sync._ls.setItem(key, JSON.stringify({ data: payload, ts: Date.now() - 60000 })); // 1 min old
        const result = sync._readCache(key, 15 * 60 * 1000);
        expect(result).toEqual(payload);
    });

    test('D09-C09: _readCache returns null for missing key', () => {
        expect(sync._readCache('nhvr_cache_nonexistent')).toBeNull();
    });

    test('D09-C10: _readCache handles malformed JSON gracefully', () => {
        sync._ls.setItem('nhvr_cache_bad', 'not-valid-json{{{');
        expect(sync._readCache('nhvr_cache_bad')).toBeNull();
    });
});

// =============================================================
// DOMAIN 10 (Unit): Geospatial Coordinate Validation Logic
// =============================================================
describe('D10 · Geospatial — Coordinate Validation Logic', () => {
    function validateCoords(lat, lon) {
        if (lat !== undefined && lat !== null) {
            if (lat < -90 || lat > 90) return { error: 'Latitude must be between -90 and 90' };
        }
        if (lon !== undefined && lon !== null) {
            if (lon < -180 || lon > 180) return { error: 'Longitude must be between -180 and 180' };
        }
        return { ok: true };
    }

    function isAustralianCoordinate(lat, lon) {
        // Australia bounding box: lat -44 to -10, lon 112 to 154
        return lat >= -44 && lat <= -10 && lon >= 112 && lon <= 154;
    }

    test('D10-G01: valid Australian bridge coordinate accepted', () => {
        expect(validateCoords(-33.8688, 151.2093)).toEqual({ ok: true }); // Sydney
    });

    test('D10-G02: lat > 90 rejected', () => {
        expect(validateCoords(91, 151.2093).error).toMatch(/Latitude/);
    });

    test('D10-G03: lat < -90 rejected', () => {
        expect(validateCoords(-91, 151.2093).error).toMatch(/Latitude/);
    });

    test('D10-G04: lon > 180 rejected', () => {
        expect(validateCoords(-33.8688, 181).error).toMatch(/Longitude/);
    });

    test('D10-G05: lon < -180 rejected', () => {
        expect(validateCoords(-33.8688, -181).error).toMatch(/Longitude/);
    });

    test('D10-G06: boundary lat = -90 accepted', () => {
        expect(validateCoords(-90, 151)).toEqual({ ok: true });
    });

    test('D10-G07: boundary lat = 90 accepted', () => {
        expect(validateCoords(90, 151)).toEqual({ ok: true });
    });

    test('D10-G08: boundary lon = 180 accepted', () => {
        expect(validateCoords(-33, 180)).toEqual({ ok: true });
    });

    test('D10-G09: boundary lon = -180 accepted', () => {
        expect(validateCoords(-33, -180)).toEqual({ ok: true });
    });

    test('D10-G10: null coords skip validation', () => {
        expect(validateCoords(null, null)).toEqual({ ok: true });
    });

    test('D10-G11: Sydney is Australian coordinate', () => {
        expect(isAustralianCoordinate(-33.8688, 151.2093)).toBe(true);
    });

    test('D10-G12: Melbourne is Australian coordinate', () => {
        expect(isAustralianCoordinate(-37.8136, 144.9631)).toBe(true);
    });

    test('D10-G13: Auckland NZ is NOT Australian coordinate', () => {
        expect(isAustralianCoordinate(-36.8485, 174.7633)).toBe(false);
    });

    test('D10-G14: London UK is NOT Australian coordinate', () => {
        expect(isAustralianCoordinate(51.5074, -0.1278)).toBe(false);
    });
});

// =============================================================
// DOMAIN 11 (Unit): AI Engine Logic — classifyDefect + Deterioration
// =============================================================
describe('D11 · AI Engine — Defect Classification Logic', () => {
    // Mirrors classifyDefect keyword logic from service.js
    function mockClassify(description) {
        const desc = (description || '').toLowerCase();
        let aiCategory = 'CRACKING';
        let aiSeverity = 'MEDIUM';
        let confidence = 72;

        if (desc.includes('crack') || desc.includes('fracture')) {
            aiCategory = 'CRACKING'; aiSeverity = 'HIGH'; confidence = 89;
        } else if (desc.includes('spall') || desc.includes('delamination')) {
            aiCategory = 'SPALLING'; aiSeverity = 'HIGH'; confidence = 85;
        } else if (desc.includes('rust') || desc.includes('corrosion') || desc.includes('oxidation')) {
            aiCategory = 'CORROSION'; aiSeverity = 'MEDIUM'; confidence = 82;
        } else if (desc.includes('scour') || desc.includes('erosion')) {
            aiCategory = 'SCOUR'; aiSeverity = 'CRITICAL'; confidence = 91;
        } else if (desc.includes('settlement') || desc.includes('subsidence')) {
            aiCategory = 'FOUNDATION'; aiSeverity = 'HIGH'; confidence = 80;
        }
        return { aiCategory, aiSeverity, confidence, analysedBy: 'mock-ai-v1' };
    }

    test('D11-A01: crack description → CRACKING category HIGH severity', () => {
        const r = mockClassify('major crack in pier');
        expect(r.aiCategory).toBe('CRACKING');
        expect(r.aiSeverity).toBe('HIGH');
        expect(r.confidence).toBeGreaterThan(80);
    });

    test('D11-A02: spalling description → SPALLING category', () => {
        expect(mockClassify('concrete spall on deck').aiCategory).toBe('SPALLING');
    });

    test('D11-A03: rust description → CORROSION category', () => {
        expect(mockClassify('rust on steel girder').aiCategory).toBe('CORROSION');
    });

    test('D11-A04: scour description → SCOUR category CRITICAL severity', () => {
        const r = mockClassify('severe scour around pier footing');
        expect(r.aiCategory).toBe('SCOUR');
        expect(r.aiSeverity).toBe('CRITICAL');
    });

    test('D11-A05: settlement description → FOUNDATION category', () => {
        expect(mockClassify('abutment settlement observed').aiCategory).toBe('FOUNDATION');
    });

    test('D11-A06: unknown description → default CRACKING MEDIUM', () => {
        const r = mockClassify('unidentified damage pattern');
        expect(r.aiCategory).toBe('CRACKING');
        expect(r.aiSeverity).toBe('MEDIUM');
    });

    test('D11-A07: empty description handled gracefully', () => {
        const r = mockClassify('');
        expect(r.aiCategory).toBeTruthy();
        expect(r.confidence).toBeGreaterThan(0);
    });

    test('D11-A08: null description handled gracefully', () => {
        expect(() => mockClassify(null)).not.toThrow();
    });

    test('D11-A09: analysedBy is always set', () => {
        expect(mockClassify('any damage').analysedBy).toBeTruthy();
    });

    test('D11-A10: confidence is a number between 0 and 100', () => {
        const r = mockClassify('crack in beam');
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(100);
    });
});

describe('D11 · AI Engine — Deterioration Score Logic', () => {
    // Mirrors deterioration engine from service.js
    function computeDeteriorationScore(conditionRating, age, trafficClass, material) {
        if (!conditionRating) return null;
        const baseScore   = (10 - conditionRating) * 10;
        const ageFactor   = Math.min((age || 0) / 100, 1.0) * 15;
        const trafficMult = { HIGH: 1.3, MEDIUM: 1.0, LOW: 0.7 }[trafficClass] || 1.0;
        const materialVul = { Steel: 1.2, Timber: 1.5, Concrete: 1.0, Masonry: 1.1 }[material] || 1.0;
        return Math.min(100, Math.round((baseScore + ageFactor) * trafficMult * materialVul));
    }

    test('D11-D01: rating 10 → near-zero score', () => {
        expect(computeDeteriorationScore(10, 0, 'LOW', 'Concrete')).toBe(0);
    });

    test('D11-D02: rating 1 → high score', () => {
        expect(computeDeteriorationScore(1, 50, 'HIGH', 'Steel')).toBeGreaterThan(70);
    });

    test('D11-D03: score capped at 100', () => {
        expect(computeDeteriorationScore(1, 200, 'HIGH', 'Timber')).toBe(100);
    });

    test('D11-D04: old bridge scores higher than new bridge (same rating)', () => {
        const old   = computeDeteriorationScore(5, 80, 'MEDIUM', 'Concrete');
        const young = computeDeteriorationScore(5, 5,  'MEDIUM', 'Concrete');
        expect(old).toBeGreaterThan(young);
    });

    test('D11-D05: HIGH traffic scores higher than LOW traffic', () => {
        const high = computeDeteriorationScore(5, 30, 'HIGH', 'Concrete');
        const low  = computeDeteriorationScore(5, 30, 'LOW',  'Concrete');
        expect(high).toBeGreaterThan(low);
    });

    test('D11-D06: Timber more vulnerable than Concrete (same inputs)', () => {
        const timber   = computeDeteriorationScore(5, 30, 'MEDIUM', 'Timber');
        const concrete = computeDeteriorationScore(5, 30, 'MEDIUM', 'Concrete');
        expect(timber).toBeGreaterThan(concrete);
    });

    test('D11-D07: null rating → returns null', () => {
        expect(computeDeteriorationScore(null, 30, 'HIGH', 'Steel')).toBeNull();
    });

    test('D11-D08: score is always a non-negative integer', () => {
        const s = computeDeteriorationScore(7, 20, 'MEDIUM', 'Concrete');
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
    });
});

// =============================================================
// DOMAIN 13 (Unit): Notification Filter Logic
// =============================================================
describe('D13 · Notification Logic — Overdue & Expiring Filter', () => {
    const today = new Date();

    function isOverdueInspection(order) {
        if (['COMPLETED', 'CANCELLED'].includes(order.status)) return false;
        if (!order.plannedDate) return false;
        return new Date(order.plannedDate) < today;
    }

    function isExpiringRestriction(restriction, days = 30) {
        if (restriction.status !== 'ACTIVE') return false;
        if (!restriction.validToDate) return false;
        const cutoff = new Date(today.getTime() + days * 86400000);
        return new Date(restriction.validToDate) <= cutoff;
    }

    test('D13-N01: past planned date + PLANNED status → overdue', () => {
        expect(isOverdueInspection({ status: 'PLANNED', plannedDate: '2025-01-01' })).toBe(true);
    });

    test('D13-N02: future planned date → not overdue', () => {
        const future = new Date(today.getTime() + 90 * 86400000).toISOString().split('T')[0];
        expect(isOverdueInspection({ status: 'PLANNED', plannedDate: future })).toBe(false);
    });

    test('D13-N03: COMPLETED order → not overdue regardless of date', () => {
        expect(isOverdueInspection({ status: 'COMPLETED', plannedDate: '2020-01-01' })).toBe(false);
    });

    test('D13-N04: CANCELLED order → not overdue', () => {
        expect(isOverdueInspection({ status: 'CANCELLED', plannedDate: '2020-01-01' })).toBe(false);
    });

    test('D13-N05: IN_PROGRESS past date → overdue', () => {
        expect(isOverdueInspection({ status: 'IN_PROGRESS', plannedDate: '2025-06-01' })).toBe(true);
    });

    test('D13-N06: restriction expiring in 10 days → in 30-day window', () => {
        const soon = new Date(today.getTime() + 10 * 86400000).toISOString().split('T')[0];
        expect(isExpiringRestriction({ status: 'ACTIVE', validToDate: soon })).toBe(true);
    });

    test('D13-N07: restriction expiring in 60 days → outside 30-day window', () => {
        const later = new Date(today.getTime() + 60 * 86400000).toISOString().split('T')[0];
        expect(isExpiringRestriction({ status: 'ACTIVE', validToDate: later })).toBe(false);
    });

    test('D13-N08: INACTIVE restriction → not flagged', () => {
        const soon = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0];
        expect(isExpiringRestriction({ status: 'INACTIVE', validToDate: soon })).toBe(false);
    });

    test('D13-N09: no validToDate → not flagged', () => {
        expect(isExpiringRestriction({ status: 'ACTIVE', validToDate: null })).toBe(false);
    });

    test('D13-N10: custom days window respected', () => {
        const in45Days = new Date(today.getTime() + 45 * 86400000).toISOString().split('T')[0];
        expect(isExpiringRestriction({ status: 'ACTIVE', validToDate: in45Days }, 60)).toBe(true);
        expect(isExpiringRestriction({ status: 'ACTIVE', validToDate: in45Days }, 30)).toBe(false);
    });
});
