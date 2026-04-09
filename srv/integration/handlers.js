// ============================================================
// Integration CAP Event Handlers
// Registers all integration actions defined in service.cds:
//
//   syncBridgeToS4, syncBridgeFromS4, syncAllBridgesToS4
//   createS4MaintenanceNotification, createS4MaintenanceOrder
//   exportToBANC, validateBancRecord
//   syncBridgeToESRI, syncAllBridgesToESRI
//   testIntegrationConnection, getIntegrationStatus
// ============================================================
'use strict';

const s4     = require('./s4hana-client');
const banc   = require('./banc-client');
const esri   = require('./esri-client');

// ── Helper: load active config for a system ─────────────────
async function loadConfig(db, systemCode) {
    const cfg = await db.run(
        SELECT.one.from('nhvr.IntegrationConfig')
            .where({ systemCode, isActive: true })
    );
    if (!cfg) throw new Error(`No active integration config found for ${systemCode}`);

    // Resolve extra config from additionalConfig JSON field
    // (in prod: use BTP Credential Store / Destination Service for secrets)
    if (cfg.additionalConfig) {
        try {
            const extra = JSON.parse(cfg.additionalConfig);
            Object.assign(cfg, extra);
        } catch { /* ignore */ }
    }
    return cfg;
}

// ── Helper: load bridge with associations ───────────────────
async function loadBridge(db, bridgeId) {
    return db.run(
        SELECT.one.from('nhvr.Bridge')
            .columns('*')
            .where({ ID: bridgeId })
    );
}

// ── Helper: load active restrictions for a bridge ───────────
async function loadActiveRestrictions(db, bridgeId) {
    return db.run(
        SELECT.from('nhvr.Restriction')
            .where({ bridge_ID: bridgeId, isActive: true })
    );
}

// ── Helper: load or create S4 equipment mapping ─────────────
async function getOrCreateMapping(db, bridgeId) {
    return db.run(
        SELECT.one.from('nhvr.S4EquipmentMapping')
            .where({ bridge_ID: bridgeId })
    );
}

// ── Helper: write integration log ───────────────────────────
// Maps to nhvr.IntegrationLog schema fields
async function writeLog(db, opts) {
    await db.run(
        INSERT.into('nhvr.IntegrationLog').entries({
            systemCode       : opts.systemCode,
            operationType    : opts.operationType,
            entityId         : opts.bridgeId   || null,
            status           : opts.status     || 'SUCCESS',
            recordsSuccess   : opts.recordsSynced || (opts.status !== 'ERROR' ? 1 : 0),
            recordsFailed    : opts.status === 'ERROR' ? 1 : 0,
            errorMessage     : opts.errorMessage || null,
            durationMs       : opts.durationMs   || 0,
            startedAt        : new Date().toISOString(),
            completedAt      : new Date().toISOString(),
            requestSummary   : opts.requestPayload
                                 ? JSON.stringify(opts.requestPayload).slice(0, 2000) : null,
            responseSummary  : opts.responsePayload
                                 ? JSON.stringify(opts.responsePayload).slice(0, 2000) : null
        })
    );
}

module.exports = function registerIntegrationHandlers(srv) {
    // cds.db is available at request time (CAP sets it during bootstrap)
    // Each handler accesses it via the `db` closure variable below
    const db = { run: (...a) => cds.db.run(...a) };

    // ============================================================
    // S/4HANA — Sync bridge TO S4
    // ============================================================
    srv.on('syncBridgeToS4', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        try {
            const [bridge, cfg] = await Promise.all([
                loadBridge(db, bridgeId),
                loadConfig(db, 'S4HANA')
            ]);
            if (!bridge) return req.error(404, `Bridge ${bridgeId} not found`);

            const result = await s4.syncBridgeToS4(cfg, bridge);

            // Upsert S4EquipmentMapping
            const existingMap = await getOrCreateMapping(db, bridgeId);
            if (existingMap) {
                await db.run(
                    UPDATE('nhvr.S4EquipmentMapping')
                        .set({
                            equipmentNumber  : result.equipmentNumber,
                            lastSyncStatus   : 'SUCCESS',
                            lastSyncAt       : new Date().toISOString(),
                            lastCharSnapshot : JSON.stringify(s4.buildCharacteristicsPayload(bridge, cfg))
                        })
                        .where({ bridge_ID: bridgeId })
                );
            } else {
                await db.run(
                    INSERT.into('nhvr.S4EquipmentMapping').entries({
                        bridge_ID       : bridgeId,
                        equipmentNumber : result.equipmentNumber,
                        lastSyncStatus  : 'SUCCESS',
                        lastSyncAt      : new Date().toISOString(),
                        syncDirection   : 'TO_S4',
                        lastCharSnapshot: JSON.stringify(s4.buildCharacteristicsPayload(bridge, cfg))
                    })
                );
            }

            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: result.isNew ? 'CREATE' : 'UPDATE',
                bridgeId,
                durationMs   : result.durationMs,
                responsePayload: result
            });

            return {
                success        : true,
                equipmentNumber: result.equipmentNumber,
                isNew          : result.isNew,
                charsUpdated   : result.charsUpdated,
                message        : result.isNew
                    ? `Equipment ${result.equipmentNumber} created in S/4HANA`
                    : `Equipment ${result.equipmentNumber} updated in S/4HANA`
            };
        } catch (e) {
            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: 'SYNC',
                bridgeId,
                status       : 'ERROR',
                errorMessage : e.message
            }).catch(() => {});
            return req.error(500, `S/4HANA sync failed: ${e.message}`);
        }
    });

    // ============================================================
    // S/4HANA — Sync bridge FROM S4 (pull characteristics)
    // ============================================================
    srv.on('syncBridgeFromS4', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        try {
            const [cfg, mapping] = await Promise.all([
                loadConfig(db, 'S4HANA'),
                getOrCreateMapping(db, bridgeId)
            ]);
            if (!mapping?.equipmentNumber) {
                return req.error(400, 'No S/4HANA equipment number mapped for this bridge. Sync to S4 first.');
            }

            const result = await s4.syncBridgeFromS4(cfg, mapping.equipmentNumber);

            // Apply numeric/validated fields back to Bridge
            const allowedUpdates = {};
            const updatableFields = [
                'conditionRating', 'postingStatus', 'scourRisk', 'yearBuilt',
                'spanLengthM', 'deckWidthM', 'clearanceHeightM', 'numberOfSpans',
                'assetOwner', 'gazetteRef', 'nhvrRouteAssessed'
            ];
            updatableFields.forEach(f => {
                if (result.updates[f] !== undefined) allowedUpdates[f] = result.updates[f];
            });

            if (Object.keys(allowedUpdates).length > 0) {
                await db.run(
                    UPDATE('nhvr.Bridge')
                        .set(allowedUpdates)
                        .where({ ID: bridgeId })
                );
            }

            await db.run(
                UPDATE('nhvr.S4EquipmentMapping')
                    .set({ lastSyncStatus: 'SUCCESS', lastSyncAt: new Date().toISOString() })
                    .where({ bridge_ID: bridgeId })
            );

            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: 'PULL',
                bridgeId,
                responsePayload: result
            });

            return {
                success     : true,
                fieldsUpdated: result.fieldsUpdated,
                updates     : result.updates,
                message     : `${result.fieldsUpdated} fields updated from S/4HANA equipment ${mapping.equipmentNumber}`
            };
        } catch (e) {
            return req.error(500, `S/4HANA pull failed: ${e.message}`);
        }
    });

    // ============================================================
    // S/4HANA — Bulk sync all bridges
    // ============================================================
    srv.on('syncAllBridgesToS4', async (req) => {
        try {
            const [bridges, cfg] = await Promise.all([
                db.run(SELECT.from('nhvr.Bridge').limit(500)),
                loadConfig(db, 'S4HANA')
            ]);

            let success = 0, failed = 0, errors = [];
            for (const bridge of bridges) {
                try {
                    const result = await s4.syncBridgeToS4(cfg, bridge);
                    // Upsert mapping
                    const existing = await getOrCreateMapping(db, bridge.ID);
                    if (existing) {
                        await db.run(
                            UPDATE('nhvr.S4EquipmentMapping')
                                .set({ equipmentNumber: result.equipmentNumber, lastSyncStatus: 'SUCCESS', lastSyncAt: new Date().toISOString() })
                                .where({ bridge_ID: bridge.ID })
                        );
                    } else {
                        await db.run(
                            INSERT.into('nhvr.S4EquipmentMapping').entries({
                                bridge_ID: bridge.ID, equipmentNumber: result.equipmentNumber,
                                lastSyncStatus: 'SUCCESS', lastSyncAt: new Date().toISOString(), syncDirection: 'TO_S4'
                            })
                        );
                    }
                    success++;
                } catch (e) {
                    failed++;
                    errors.push(`${bridge.bridgeId}: ${e.message}`);
                }
            }

            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: 'BULK_SYNC',
                status       : failed > 0 ? 'PARTIAL' : 'SUCCESS',
                recordsSynced: success,
                errorMessage : errors.slice(0, 5).join('; ')
            });

            return {
                success: true,
                totalBridges: bridges.length,
                synced : success,
                failed,
                errors : errors.slice(0, 10),
                message: `S/4HANA sync: ${success} succeeded, ${failed} failed`
            };
        } catch (e) {
            return req.error(500, `Bulk S/4HANA sync failed: ${e.message}`);
        }
    });

    // ============================================================
    // S/4HANA — Create Maintenance Notification from Defect
    // ============================================================
    srv.on('createS4MaintenanceNotification', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        const { defectId } = req.data;
        try {
            const [bridge, cfg, mapping] = await Promise.all([
                loadBridge(db, bridgeId),
                loadConfig(db, 'S4HANA'),
                getOrCreateMapping(db, bridgeId)
            ]);
            if (!bridge) return req.error(404, 'Bridge not found');

            const defect = defectId
                ? await db.run(SELECT.one.from('nhvr.BridgeDefect').where({ ID: defectId }))
                : null;
            if (!defect && defectId) return req.error(404, 'Defect not found');

            const defectData = defect || {
                description      : req.data.description || `Bridge ${bridge.bridgeId} — maintenance required`,
                severity         : req.data.severity || 'MEDIUM',
                detectedDate     : new Date().toISOString().slice(0, 10),
                detectedBy       : req.user?.id || 'NHVR_SYSTEM',
                _equipmentNumber : mapping?.equipmentNumber || '',
                _functionalLocation: ''
            };
            if (mapping?.equipmentNumber) defectData._equipmentNumber = mapping.equipmentNumber;

            const result = await s4.createMaintenanceNotification(cfg, defectData, bridge);

            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: 'CREATE_NOTIFICATION',
                bridgeId,
                responsePayload: result
            });

            return {
                success            : true,
                notificationNumber : result.notificationNumber,
                message            : `PM Notification ${result.notificationNumber} created in S/4HANA`
            };
        } catch (e) {
            return req.error(500, `Create notification failed: ${e.message}`);
        }
    });

    // ============================================================
    // S/4HANA — Create Maintenance Order from InspectionOrder
    // ============================================================
    srv.on('createS4MaintenanceOrder', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        const { inspectionOrderId } = req.data;
        try {
            const [bridge, cfg, mapping] = await Promise.all([
                loadBridge(db, bridgeId),
                loadConfig(db, 'S4HANA'),
                getOrCreateMapping(db, bridgeId)
            ]);
            if (!bridge) return req.error(404, 'Bridge not found');

            const inspOrder = inspectionOrderId
                ? await db.run(SELECT.one.from('nhvr.InspectionOrder').where({ ID: inspectionOrderId }))
                : null;

            const orderData = inspOrder || {
                orderNumber      : req.data.orderNumber || `NHVR-${bridge.bridgeId}-${Date.now()}`,
                plannedDate      : req.data.plannedDate || new Date().toISOString().slice(0, 10),
                inspector        : req.data.inspector  || '',
                _equipmentNumber : mapping?.equipmentNumber || ''
            };
            if (mapping?.equipmentNumber) orderData._equipmentNumber = mapping.equipmentNumber;

            const result = await s4.createMaintenanceOrder(cfg, orderData, bridge);

            await writeLog(db, {
                systemCode   : 'S4HANA',
                operationType: 'CREATE_ORDER',
                bridgeId,
                responsePayload: result
            });

            return {
                success    : true,
                orderNumber: result.orderNumber,
                message    : `PM Order ${result.orderNumber} created in S/4HANA`
            };
        } catch (e) {
            return req.error(500, `Create maintenance order failed: ${e.message}`);
        }
    });

    // ============================================================
    // BANC — Export bridges to BANC CSV package
    // ============================================================
    srv.on('exportToBANC', async (req) => {
        const { bridgeIds, includeInspections, includeDefects } = req.data;
        try {
            // Load bridges
            let bridgesQuery = SELECT.from('nhvr.Bridge');
            if (bridgeIds && bridgeIds.length > 0) {
                bridgesQuery = bridgesQuery.where({ ID: { in: bridgeIds } });
            } else {
                bridgesQuery = bridgesQuery.limit(2000);
            }
            const bridges = await db.run(bridgesQuery);

            // Load active restrictions for each bridge
            for (const b of bridges) {
                b._restrictions = await loadActiveRestrictions(db, b.ID);
            }

            let inspections = [], defects = [];
            if (includeInspections) {
                const bIds = bridges.map(b => b.ID);
                inspections = await db.run(
                    SELECT.from('nhvr.InspectionRecord').where({ bridge_ID: { in: bIds } })
                );
            }
            if (includeDefects) {
                const bIds = bridges.map(b => b.ID);
                defects = await db.run(
                    SELECT.from('nhvr.BridgeDefect').where({ bridge_ID: { in: bIds } })
                );
            }

            const exportPackage = banc.buildBancExport(bridges, inspections, defects);

            await writeLog(db, {
                systemCode   : 'BANC',
                operationType: 'EXPORT',
                status       : exportPackage.validation.invalidCount > 0 ? 'PARTIAL' : 'SUCCESS',
                recordsSynced: exportPackage.structures.count,
                errorMessage : exportPackage.validation.invalidCount > 0
                    ? `${exportPackage.validation.invalidCount} records failed validation`
                    : null
            });

            return {
                success          : true,
                structureCount   : exportPackage.structures.count,
                inspectionCount  : exportPackage.inspections.count,
                defectCount      : exportPackage.defects.count,
                validCount       : exportPackage.validation.validCount,
                invalidCount     : exportPackage.validation.invalidCount,
                validationErrors : exportPackage.validation.records.filter(v => !v.valid).slice(0, 20),
                exportedAt       : exportPackage.exportedAt,
                format           : exportPackage.format,
                // CSV content (base64 for OData transport)
                structuresCSV    : Buffer.from(exportPackage.structures.csv).toString('base64'),
                inspectionsCSV   : includeInspections
                    ? Buffer.from(exportPackage.inspections.csv).toString('base64') : null,
                defectsCSV       : includeDefects
                    ? Buffer.from(exportPackage.defects.csv).toString('base64') : null
            };
        } catch (e) {
            return req.error(500, `BANC export failed: ${e.message}`);
        }
    });

    // ============================================================
    // BANC — Validate a single bridge for BANC compliance
    // ============================================================
    srv.on('validateBancRecord', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        const bridge   = await loadBridge(db, bridgeId);
        if (!bridge) return req.error(404, 'Bridge not found');

        const result = banc.validateBancRecord(bridge);
        return {
            bridgeId : bridge.bridgeId,
            valid    : result.valid,
            errors   : result.errors,
            warnings : result.warnings,
            readyForSubmission: result.valid && result.warnings.length === 0
        };
    });

    // ============================================================
    // ESRI — Sync single bridge to ArcGIS
    // ============================================================
    srv.on('syncBridgeToESRI', 'Bridges', async (req) => {
        const bridgeId = req.params[0]?.ID || req.params[0];
        try {
            const [bridge, cfg, restrictions] = await Promise.all([
                loadBridge(db, bridgeId),
                loadConfig(db, 'ESRI'),
                loadActiveRestrictions(db, bridgeId)
            ]);
            if (!bridge) return req.error(404, 'Bridge not found');

            const result = await esri.syncBridgeToESRI(cfg, bridge, restrictions);

            await writeLog(db, {
                systemCode   : 'ESRI',
                operationType: result.isNew ? 'CREATE' : 'UPDATE',
                bridgeId,
                durationMs   : result.durationMs,
                responsePayload: { objectId: result.objectId }
            });

            return {
                success  : true,
                objectId : result.objectId,
                isNew    : result.isNew,
                message  : result.isNew
                    ? `Feature OID ${result.objectId} created in ArcGIS`
                    : `Feature OID ${result.objectId} updated in ArcGIS`
            };
        } catch (e) {
            await writeLog(db, {
                systemCode   : 'ESRI',
                operationType: 'SYNC',
                bridgeId,
                status       : 'ERROR',
                errorMessage : e.message
            }).catch(() => {});
            return req.error(500, `ESRI sync failed: ${e.message}`);
        }
    });

    // ============================================================
    // ESRI — Bulk sync all bridges
    // ============================================================
    srv.on('syncAllBridgesToESRI', async (req) => {
        try {
            const [bridges, cfg] = await Promise.all([
                db.run(SELECT.from('nhvr.Bridge').limit(2000)),
                loadConfig(db, 'ESRI')
            ]);

            // Load restrictions for all bridges in bulk
            const allRestrictions = await db.run(
                SELECT.from('nhvr.Restriction').where({ isActive: true })
            );
            const restrictionsMap = {};
            allRestrictions.forEach(r => {
                if (!restrictionsMap[r.bridge_ID]) restrictionsMap[r.bridge_ID] = [];
                restrictionsMap[r.bridge_ID].push(r);
            });

            const result = await esri.bulkSyncBridgesToESRI(cfg, bridges, restrictionsMap);

            await writeLog(db, {
                systemCode   : 'ESRI',
                operationType: 'BULK_SYNC',
                status       : result.failed > 0 ? 'PARTIAL' : 'SUCCESS',
                recordsSynced: result.success,
                errorMessage : result.errors.slice(0, 3).join('; '),
                durationMs   : result.durationMs
            });

            return {
                success     : true,
                totalBridges: result.totalBridges,
                synced      : result.success,
                failed      : result.failed,
                newFeatures : result.newFeatures,
                updFeatures : result.updFeatures,
                errors      : result.errors.slice(0, 10),
                message     : `ESRI sync: ${result.success} succeeded, ${result.failed} failed`
            };
        } catch (e) {
            return req.error(500, `Bulk ESRI sync failed: ${e.message}`);
        }
    });

    // ============================================================
    // Test integration connection
    // ============================================================
    srv.on('testIntegrationConnection', async (req) => {
        const { systemCode } = req.data;
        try {
            const cfg = await loadConfig(db, systemCode);
            let result;
            if (systemCode === 'S4HANA') {
                result = await s4.testConnection(cfg);
            } else if (systemCode === 'ESRI') {
                result = await esri.testConnection(cfg);
            } else if (systemCode === 'BANC') {
                // BANC has no live endpoint — validate config
                result = {
                    ok      : true,
                    message : 'BANC config validated (CSV export mode — no live endpoint)',
                    details : `State: ${cfg.bancStateCode || 'not set'}, Agency: ${cfg.bancAgencyCode || 'not set'}`,
                    durationMs: 0
                };
            } else {
                return req.error(400, `Unknown system code: ${systemCode}`);
            }

            await writeLog(db, {
                systemCode,
                operationType: 'TEST',
                status       : result.ok ? 'SUCCESS' : 'ERROR',
                errorMessage : result.ok ? null : result.message,
                durationMs   : result.durationMs
            });

            return {
                systemCode,
                ok        : result.ok,
                message   : result.message,
                details   : result.details,
                durationMs: result.durationMs
            };
        } catch (e) {
            return req.error(500, `Connection test failed: ${e.message}`);
        }
    });

    // ============================================================
    // Get integration status for all systems
    // ============================================================
    srv.on('getIntegrationStatus', async (req) => {
        const systems = ['S4HANA', 'BANC', 'ESRI'];
        const result  = [];

        for (const code of systems) {
            try {
                const [cfg, logs] = await Promise.all([
                    db.run(SELECT.one.from('nhvr.IntegrationConfig').where({ systemCode: code })),
                    db.run(
                        SELECT.from('nhvr.IntegrationLog')
                            .where({ systemCode: code })
                            .orderBy({ startedAt: 'desc' })
                            .limit(1)
                    )
                ]);
                const lastLog = logs?.[0];
                const totalSynced = await db.run(
                    SELECT.one(['count(*) as cnt']).from('nhvr.IntegrationLog')
                        .where({ systemCode: code, status: 'SUCCESS' })
                );

                result.push({
                    systemCode   : code,
                    systemName   : cfg?.systemName || code,
                    isActive     : cfg?.isActive   || false,
                    isConfigured : !!(cfg?.baseUrl  || cfg?.esriFeatureServiceUrl),
                    lastSyncAt   : lastLog?.startedAt || null,
                    lastSyncStatus: lastLog?.status   || null,
                    totalSynced  : totalSynced?.cnt   || 0,
                    lastError    : lastLog?.status === 'ERROR' ? lastLog.errorMessage : null
                });
            } catch {
                result.push({
                    systemCode: code,
                    systemName: code,
                    isActive  : false,
                    isConfigured: false,
                    lastSyncAt: null,
                    lastSyncStatus: null,
                    totalSynced: 0,
                    lastError: null
                });
            }
        }

        return result;
    });
};
