/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Ingestion Handler
   Portable: works in any SAP CAP Node.js app
   ──────────────────────────────────────────────────────────────── */
'use strict';

const crypto = require('crypto');
const cds    = require('@sap/cds');
const LOG    = cds.log('analytics-ingest');

// ── Allowlisted taxonomy ────────────────────────────────────────
const ALLOWED_CATEGORIES = new Set([
    'session', 'navigation', 'bridge_ops', 'restriction_ops',
    'inspection_ops', 'workflow', 'upload', 'search', 'export',
    'error', 'performance', 'feature_use'
]);

const ALLOWED_EVENT_TYPES = new Set([
    // session
    'session_start', 'session_end', 'session_heartbeat',
    // navigation
    'page_view', 'tab_switch',
    // bridge_ops
    'bridge_create', 'bridge_update', 'bridge_close', 'bridge_reopen',
    'bridge_condition_change',
    // restriction_ops
    'restriction_add', 'restriction_disable', 'restriction_enable',
    'restriction_temporary',
    // inspection_ops
    'inspection_create', 'inspection_start', 'inspection_complete',
    'defect_raise', 'defect_close',
    // workflow
    'workflow_start', 'workflow_step', 'workflow_complete', 'workflow_abandon',
    // upload
    'mass_upload_start', 'mass_upload_complete', 'mass_upload_error',
    // search
    'search_execute', 'filter_apply',
    // export
    'export_csv', 'export_excel',
    // error
    'validation_error', 'api_error', 'app_error',
    // performance
    'slow_load', 'slow_api',
    // feature_use
    'help_opened', 'map_interaction', 'theme_change', 'offline_queue',
    'dashboard_view', 'report_generate', 'config_change'
]);

// ── Rate Limiter (in-memory, per pseudoUserId) ──────────────────
const _rateMap = new Map();        // pseudoUserId → { count, resetTime }
const RATE_CLEANUP_MS = 300000;    // 5 min
let _lastCleanup = Date.now();

function _checkRateLimit(pseudoUserId, limit) {
    const now = Date.now();
    // Periodic cleanup
    if (now - _lastCleanup > RATE_CLEANUP_MS) {
        for (const [k, v] of _rateMap) {
            if (now > v.resetTime) _rateMap.delete(k);
        }
        _lastCleanup = now;
    }
    let entry = _rateMap.get(pseudoUserId);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + 60000 };
        _rateMap.set(pseudoUserId, entry);
    }
    entry.count++;
    return entry.count <= limit;
}

// ── Pseudonymization ────────────────────────────────────────────
const SALT = process.env.NHVR_ANALYTICS_SALT || crypto.randomBytes(32).toString('hex');

function pseudonymize(userId) {
    if (!userId) return 'anonymous';
    return crypto.createHash('sha256').update(userId + SALT).digest('hex');
}

function hashEntityId(entityId) {
    if (!entityId) return null;
    return crypto.createHash('sha256').update(String(entityId)).digest('hex').substring(0, 16);
}

// ── String Truncation ───────────────────────────────────────────
function trunc(str, max) {
    if (str == null || str === '') return null;
    return String(str).substring(0, max);
}

// ── Config Cache ────────────────────────────────────────────────
let _configCache = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000; // 1 min

async function getConfig(db) {
    const now = Date.now();
    if (_configCache && now - _configCacheTime < CONFIG_CACHE_TTL) return _configCache;
    try {
        const rows = await db.run(
            SELECT.from('nhvr.AnalyticsConfig').where({ configKey: 'GLOBAL' }).limit(1)
        );
        if (rows.length > 0) {
            _configCache = rows[0];
        } else {
            // Bootstrap default config
            const id = cds.utils.uuid();
            const entry = {
                ID: id, configKey: 'GLOBAL', tenantCode: 'DEFAULT',
                enabled: true, sampleRate: 1.00, flushIntervalMs: 30000,
                maxQueueSize: 100, maxPayloadBytes: 51200,
                retentionDays: 90, dailyRetentionDays: 365,
                weeklyRetentionDays: 730, monthlyRetentionDays: 1825,
                rateLimitPerMin: 100
            };
            await db.run(INSERT.into('nhvr.AnalyticsConfig').entries(entry));
            _configCache = entry;
        }
        _configCacheTime = now;
    } catch (err) {
        LOG.warn('Config load failed, using defaults', err.message);
        _configCache = { enabled: true, rateLimitPerMin: 100 };
        _configCacheTime = now;
    }
    return _configCache;
}

// ── Validate single event ───────────────────────────────────────
function validateEvent(evt) {
    if (!evt || typeof evt !== 'object') return null;
    const cat = trunc(evt.category, 30);
    const typ = trunc(evt.eventType, 50);
    if (!ALLOWED_CATEGORIES.has(cat)) return null;
    if (!ALLOWED_EVENT_TYPES.has(typ)) return null;

    // Validate metadata JSON if provided
    if (evt.metadata) {
        try {
            const parsed = typeof evt.metadata === 'string'
                ? JSON.parse(evt.metadata)
                : evt.metadata;
            if (typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            evt.metadata = JSON.stringify(parsed).substring(0, 500);
        } catch {
            evt.metadata = null;
        }
    }

    return {
        category:        cat,
        eventType:       typ,
        sessionId:       trunc(evt.sessionId, 36),
        targetRoute:     trunc(evt.targetRoute, 80),
        targetEntityId:  hashEntityId(evt.targetEntityId),
        durationMs:      typeof evt.durationMs === 'number' ? Math.max(0, Math.round(evt.durationMs)) : null,
        resultCount:     typeof evt.resultCount === 'number' ? Math.max(0, Math.round(evt.resultCount)) : null,
        errorCode:       trunc(evt.errorCode, 10),
        errorMessage:    trunc(evt.errorMessage, 200),
        metadata:        evt.metadata || null,
        browserCategory: trunc(evt.browserCategory, 30),
        screenBucket:    trunc(evt.screenBucket, 10),
        workflowId:      trunc(evt.workflowId, 36),
        workflowStep:    typeof evt.workflowStep === 'number' ? Math.max(0, evt.workflowStep) : null,
        workflowTotal:   typeof evt.workflowTotal === 'number' ? Math.max(0, evt.workflowTotal) : null
    };
}

// ── Handler Registration ────────────────────────────────────────
module.exports = function registerAnalyticsIngestHandlers(srv, _h) {

    srv.on('ingestEvents', async (req) => {
        // Environment kill switch
        if (process.env.NHVR_ANALYTICS_ENABLED === 'false') {
            return { accepted: 0, dropped: 0 };
        }

        const events = req.data.events;
        if (!Array.isArray(events) || events.length === 0) {
            return { accepted: 0, dropped: 0 };
        }

        const db = await cds.connect.to('db');
        const config = await getConfig(db);

        if (!config.enabled) {
            return { accepted: 0, dropped: 0 };
        }

        // Pseudonymize user
        const userId = req.user ? req.user.id : 'anonymous';
        const pseudoUserId = pseudonymize(userId);

        // Rate limit check
        const limit = config.rateLimitPerMin || 100;
        if (!_checkRateLimit(pseudoUserId, limit)) {
            LOG.warn('Rate limit exceeded for', pseudoUserId.substring(0, 8));
            return { accepted: 0, dropped: events.length };
        }

        // Determine role and tenant from JWT (server-authoritative)
        const knownRoles = ['Admin', 'BridgeManager', 'Viewer', 'Uploader', 'Executive', 'Inspector', 'Operator'];
        const userRole = knownRoles.find(r => req.user && req.user.is(r)) || 'Unknown';
        const tenantCode = (req.user && req.user.attr && req.user.attr.tenantCode) || 'DEFAULT';
        const environment = process.env.NODE_ENV || 'production';

        // Validate and build entries
        let accepted = 0;
        let dropped = 0;
        const validEntries = [];
        const sessionIds = new Set();

        for (const raw of events) {
            const validated = validateEvent(raw);
            if (!validated) {
                dropped++;
                continue;
            }
            validEntries.push({
                ID:              cds.utils.uuid(),
                pseudoUserId:    pseudoUserId,
                userRole:        userRole,
                tenantCode:      tenantCode,
                environment:     environment,
                ...validated
            });
            if (validated.sessionId) sessionIds.add(validated.sessionId);
            accepted++;
        }

        // Bulk insert events
        if (validEntries.length > 0) {
            try {
                await db.run(INSERT.into('nhvr.AnalyticsEvent').entries(validEntries));
            } catch (err) {
                LOG.error('Event insert failed', err.message);
                return { accepted: 0, dropped: events.length };
            }
        }

        // Upsert sessions (fire-and-forget, non-blocking)
        for (const sid of sessionIds) {
            _upsertSession(db, sid, pseudoUserId, userRole, tenantCode, environment, validEntries).catch(
                err => LOG.warn('Session upsert failed', err.message)
            );
        }

        return { accepted, dropped };
    });
};

// ── Session Upsert ──────────────────────────────────────────────
async function _upsertSession(db, sessionId, pseudoUserId, userRole, tenantCode, environment, events) {
    const now = new Date().toISOString();
    const sessionEvents = events.filter(e => e.sessionId === sessionId);
    const pageViews = sessionEvents.filter(e => e.eventType === 'page_view').length;
    const errors = sessionEvents.filter(e => e.category === 'error').length;
    const actions = sessionEvents.filter(e =>
        e.category !== 'session' && e.category !== 'navigation' && e.category !== 'error'
    ).length;
    const browserCategory = sessionEvents[0]?.browserCategory || null;
    const screenBucket = sessionEvents[0]?.screenBucket || null;

    const existing = await db.run(
        SELECT.from('nhvr.AnalyticsSession').where({ sessionId }).limit(1)
    );

    if (existing.length > 0) {
        const session = existing[0];
        const update = {
            lastSeenAt:    now,
            pageViewCount: (session.pageViewCount || 0) + pageViews,
            actionCount:   (session.actionCount || 0) + actions,
            errorCount:    (session.errorCount || 0) + errors
        };
        // Check for session_end
        if (sessionEvents.some(e => e.eventType === 'session_end')) {
            update.endedAt = now;
        }
        await db.run(UPDATE('nhvr.AnalyticsSession').set(update).where({ ID: session.ID }));
    } else {
        await db.run(INSERT.into('nhvr.AnalyticsSession').entries({
            ID:              cds.utils.uuid(),
            sessionId:       sessionId,
            pseudoUserId:    pseudoUserId,
            userRole:        userRole,
            tenantCode:      tenantCode,
            environment:     environment,
            startedAt:       now,
            lastSeenAt:      now,
            endedAt:         sessionEvents.some(e => e.eventType === 'session_end') ? now : null,
            pageViewCount:   pageViews,
            actionCount:     actions,
            errorCount:      errors,
            browserCategory: browserCategory,
            screenBucket:    screenBucket
        }));
    }
}
