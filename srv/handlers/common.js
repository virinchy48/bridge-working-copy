'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('nhvr-service');

module.exports = function registerCommonHelpers(srv) {

    // ─────────────────────────────────────────────────────────
    // HELPER: Bridge lookup (raw SQL — avoids @cap-js/sqlite 2.2.0
    //         jsonb-nesting overflow on large entities with 200+ columns)
    // ─────────────────────────────────────────────────────────
    async function getBridge(id, db) {
        const resolvedDb = db || await cds.connect.to('db');
        const resolvedId = (id && typeof id === 'object') ? (id.ID || id.id || Object.values(id)[0]) : id;
        return resolvedDb.run(
            SELECT.one.from('nhvr.Bridge')
                .columns('ID','bridgeId','name','postingStatus','condition','conditionScore','state','isActive')
                .where({ ID: resolvedId })
        );
    }

    async function getBridgeByKey(bridgeIdKey, db, activeOnly) {
        const resolvedDb = db || await cds.connect.to('db');
        const where = activeOnly ? { bridgeId: bridgeIdKey, isActive: true } : { bridgeId: bridgeIdKey };
        return resolvedDb.run(
            SELECT.one.from('nhvr.Bridge')
                .columns('ID','bridgeId','name','postingStatus','condition','conditionScore','state','isActive')
                .where(where)
        );
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Restriction lookup (raw SQL — same jsonb-overflow fix as getBridge)
    // ─────────────────────────────────────────────────────────
    async function getRestriction(id, db) {
        const resolvedDb = db || await cds.connect.to('db');
        const resolvedId = (id && typeof id === 'object') ? (id.ID || Object.values(id)[0]) : id;
        return resolvedDb.run(
            SELECT.one.from('nhvr.Restriction').where({ ID: resolvedId })
        );
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: InspectionOrder lookup (raw SQL)
    // ─────────────────────────────────────────────────────────
    async function getInspectionOrder(id, db) {
        const resolvedDb = db || await cds.connect.to('db');
        const resolvedId = (id && typeof id === 'object') ? (id.ID || Object.values(id)[0]) : id;
        return resolvedDb.run(
            SELECT.one.from('nhvr.InspectionOrder').where({ ID: resolvedId })
        );
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: BridgeDefect lookup (raw SQL)
    // ─────────────────────────────────────────────────────────
    async function getBridgeDefect(id, db) {
        const resolvedDb = db || await cds.connect.to('db');
        const resolvedId = (id && typeof id === 'object') ? (id.ID || Object.values(id)[0]) : id;
        return resolvedDb.run(
            SELECT.one.from('nhvr.BridgeDefect').where({ ID: resolvedId })
        );
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Write rich event history entry
    // ─────────────────────────────────────────────────────────
    async function writeHistory(bridgeId, eventType, title, detail, opts, req) {
        try {
            const db = await cds.connect.to('db');
            await db.run(INSERT.into('nhvr.BridgeEventLog').entries({
                bridge_ID        : bridgeId,
                eventType        : eventType,
                title            : title,
                detail           : detail || '',
                effectiveFrom    : opts.effectiveFrom    || null,
                effectiveTo      : opts.effectiveTo      || null,
                statusBefore     : opts.statusBefore     || null,
                statusAfter      : opts.statusAfter      || null,
                performedBy      : (req && req.user ? req.user.id : null) || opts.performedBy || 'system',
                approvalRef      : opts.approvalRef      || null,
                gazetteRef       : opts.gazetteRef       || null,
                relatedEntityType: opts.relatedEntityType|| null,
                relatedEntityId  : opts.relatedEntityId  || null,
                timestamp        : new Date().toISOString()
            }));
        } catch (err) {
            LOG.error('writeHistory failed:', err.message);
        }
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Audit Logger
    // ─────────────────────────────────────────────────────────
    async function logAudit(action, entity, entityId, entityName, description, changes, req, options = {}) {
        try {
            const db = await cds.connect.to('db');
            const knownRoles = ['Admin', 'BridgeManager', 'Viewer', 'Uploader', 'Executive', 'Inspector', 'Operator'];
            const userRole = knownRoles.find(roleName => req && req.user && req.user.is(roleName)) || 'Unknown';
            await db.run(INSERT.into('nhvr.AuditLog').entries({
                timestamp  : new Date().toISOString(),
                userId     : req && req.user ? req.user.id : 'system',
                userRole   : userRole,
                action     : action,
                entity     : entity,
                entityId   : String(entityId || ''),
                entityName : String(entityName || ''),
                changes    : changes ? JSON.stringify(changes) : null,
                description: description
            }));
        } catch (err) {
            LOG.error('[AUDIT] Failed to write audit log:', err.message, { action, entity, entityId });
            if (options.critical) {
                throw new Error('Audit logging failed for critical operation. Operation aborted.');
            }
            // For non-critical: log error but proceed (existing behavior)
        }
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Update Bridge Posting Status
    // ─────────────────────────────────────────────────────────
    async function updateBridgePostingStatus(bridgeId) {
        try {
            const db = await cds.connect.to('db');
            // Don't override manually-closed bridges
            const bridge = await db.run(SELECT.one.from('nhvr.Bridge').columns('postingStatus').where({ ID: bridgeId }));
            if (bridge && bridge.postingStatus === 'CLOSED') return;
            const activeRestrictions = await db.run(
                SELECT.from('nhvr.Restriction').where({ bridge_ID: bridgeId, status: 'ACTIVE', isActive: true })
            );
            let newStatus = 'UNRESTRICTED';
            if (activeRestrictions.length > 0) newStatus = 'POSTED';
            await db.run(UPDATE('nhvr.Bridge').set({ postingStatus: newStatus }).where({ ID: bridgeId }));
        } catch (err) {
            LOG.error('Failed to update bridge posting status:', err.message);
        }
    }

    // Build parameterized WHERE clause from common filter params.
    // Returns { clause: 'WHERE ...', params: [...] } for safe SQL execution.
    function buildAssetFilter(filterParams) {
        const conds = [];
        const params = [];
        // String filters: only apply if non-empty
        if (filterParams.assetClass)    { conds.push(`b.assetClass = ?`);    params.push(String(filterParams.assetClass).slice(0, 200)); }
        if (filterParams.state)         { conds.push(`b.state = ?`);         params.push(String(filterParams.state).slice(0, 200)); }
        if (filterParams.region)        { conds.push(`LOWER(b.region) LIKE LOWER(?)`); params.push('%' + String(filterParams.region).slice(0, 200) + '%'); }
        if (filterParams.postingStatus) { conds.push(`b.postingStatus = ?`); params.push(String(filterParams.postingStatus).slice(0, 200)); }
        if (filterParams.condition)     { conds.push(`b.condition = ?`);     params.push(String(filterParams.condition).slice(0, 200)); }
        if (filterParams.criticality)   { conds.push(`b.criticality = ?`);  params.push(String(filterParams.criticality).slice(0, 200)); }
        // Numeric range: OData passes null as 0, so only apply when > 0
        if (filterParams.conditionMin  && parseInt(filterParams.conditionMin)  > 0) { conds.push(`b.conditionRating >= ?`); params.push(parseInt(filterParams.conditionMin)); }
        if (filterParams.conditionMax  && parseInt(filterParams.conditionMax)  > 0) { conds.push(`b.conditionRating <= ?`); params.push(parseInt(filterParams.conditionMax)); }
        if (filterParams.yearBuiltFrom && parseInt(filterParams.yearBuiltFrom) > 0) { conds.push(`b.yearBuilt >= ?`);      params.push(parseInt(filterParams.yearBuiltFrom)); }
        if (filterParams.yearBuiltTo   && parseInt(filterParams.yearBuiltTo)   > 0) { conds.push(`b.yearBuilt <= ?`);      params.push(parseInt(filterParams.yearBuiltTo)); }
        // Boolean: only apply if explicitly true (OData converts null boolean to false)
        if (filterParams.isActive === true) conds.push(`b.isActive = 1`);
        const clause = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        return { clause, params };
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Enum Validation
    // ─────────────────────────────────────────────────────────
    function validateEnum(value, validValues, fieldName) {
        if (value && !validValues.includes(value)) {
            throw new Error(`Invalid ${fieldName}: '${value}'. Must be one of: ${validValues.join(', ')}`);
        }
    }

    // ─────────────────────────────────────────────────────────
    // HELPER: Tenant Context (Phase 8.1 — Multi-Tenancy Foundation)
    // ─────────────────────────────────────────────────────────
    /**
     * Extract tenant ID from request context.
     * Returns null for single-tenant mode (backward compatible).
     */
    function getTenantId(req) {
        // Check JWT claims for tenant info
        if (req.user && req.user.attr && req.user.attr.tenantId) {
            return req.user.attr.tenantId;
        }
        // Check custom header (for testing)
        if (req.headers && req.headers['x-nhvr-tenant']) {
            return req.headers['x-nhvr-tenant'];
        }
        return null; // Single-tenant mode
    }

    async function logRestrictionChange(restrictionId, changeType, oldStatus, newStatus, reason, req) {
        try {
            const tx = cds.tx(req);
            await tx.run(INSERT.into('nhvr.RestrictionChangeLog').entries({
                ID: cds.utils.uuid(),
                restriction_ID: restrictionId,
                changedBy: req?.user?.id || 'system',
                changeType,
                oldStatus,
                newStatus,
                reason: reason || null
            }));
        } catch (err) {
            LOG.warn('Failed to log restriction change', err.message);
        }
    }

    // Return an object with all helpers so handlers can use them
    const helpers = {
        getBridge,
        getBridgeByKey,
        getRestriction,
        getInspectionOrder,
        getBridgeDefect,
        writeHistory,
        logAudit,
        updateBridgePostingStatus,
        buildAssetFilter,
        validateEnum,
        getTenantId,
        logRestrictionChange
    };

    return helpers;
};
