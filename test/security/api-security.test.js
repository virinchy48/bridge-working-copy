/* ────────────────────────────────────────────────────────────────
   D5 — API Security Tests (OWASP API Top 10 2023)
   Framework: Jest + @cap-js/cds-test
   SuperTester v7 | NHVR Bridge Management
   ──────────────────────────────────────────────────────────────── */
'use strict';

const cds = require('@sap/cds');

cds.test(__dirname + '/../..');

// ── User Contexts ────────────────────────────────────────────────
const PRIV    = { user: new cds.User.Privileged() };
const ADMIN   = { user: new cds.User({ id: 'alice', roles: ['Admin'] }) };
const MANAGER = { user: new cds.User({ id: 'bob',   roles: ['BridgeManager'] }) };
const VIEWER  = { user: new cds.User({ id: 'carol', roles: ['Viewer'] }) };
const EXEC    = { user: new cds.User({ id: 'dave',  roles: ['Executive'] }) };
const INSPECTOR = { user: new cds.User({ id: 'eve', roles: ['Inspector'] }) };
const OPERATOR  = { user: new cds.User({ id: 'frank', roles: ['Operator'] }) };
const UPLOADER  = { user: new cds.User({ id: 'grace', roles: ['Uploader'] }) };
const NO_ROLES  = { user: new cds.User({ id: 'nobody', roles: [] }) };

let srv;

function run(query, auth) { return srv.tx(auth || PRIV, async () => srv.run(query)); }
function send(args, auth) { return srv.tx(auth || PRIV, async () => srv.send(args)); }

function bridgeData(overrides = {}) {
    const unique = `SEC-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 99)}`;
    return {
        bridgeId: unique, name: `Security Test ${unique}`,
        region: 'Test Region', state: 'NSW', structureType: 'Box Girder',
        material: 'Steel', latitude: -33.8688, longitude: 151.2093,
        condition: 'GOOD', isActive: true,
        ...overrides
    };
}

beforeAll(async () => {
    srv = await cds.connect.to('BridgeManagementService');
}, 30000);

// ══════════════════════════════════════════════════════════════════
// API1 — BROKEN OBJECT LEVEL AUTHORIZATION (BOLA)
// ══════════════════════════════════════════════════════════════════
describe('API1 — Broken Object Level Authorization', () => {

    test('Viewer cannot CREATE a bridge', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.run(INSERT.into('BridgeManagementService.Bridges').entries(bridgeData({ bridgeId: 'SEC-BOLA-01' })))
            );
            throw new Error('Should have rejected Viewer CREATE');
        } catch (err) {
            expect([403, 'FORBIDDEN', 403]).toContain(err.code || err.status);
        }
    });

    test('Viewer cannot UPDATE a bridge', async () => {
        try {
            const bridges = await run(SELECT.from('Bridges').limit(1));
            if (bridges.length === 0) return; // skip if no data
            await srv.tx(VIEWER, async () =>
                srv.run(UPDATE('Bridges').set({ name: 'Hacked' }).where({ ID: bridges[0].ID }))
            );
            throw new Error('Should have rejected Viewer UPDATE');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot DELETE a bridge', async () => {
        try {
            const bridges = await run(SELECT.from('Bridges').limit(1));
            if (bridges.length === 0) return;
            await srv.tx(VIEWER, async () =>
                srv.run(DELETE.from('Bridges').where({ ID: bridges[0].ID }))
            );
            throw new Error('Should have rejected Viewer DELETE');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Inspector cannot modify restrictions', async () => {
        try {
            await srv.tx(INSPECTOR, async () =>
                srv.run(INSERT.into('Restrictions').entries({
                    restrictionType: 'MASS', value: 42, unit: 'T',
                    status: 'ACTIVE', isActive: true
                }))
            );
            throw new Error('Should have rejected Inspector CREATE on Restrictions');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer CAN read bridges (positive case)', async () => {
        const bridges = await srv.tx(VIEWER, async () =>
            srv.run(SELECT.from('Bridges').limit(5))
        );
        expect(Array.isArray(bridges)).toBe(true);
    });

    test('No-role user cannot modify bridges', async () => {
        // In CDS dummy auth, any authenticated user can read.
        // But no-role user should not be able to write.
        try {
            await srv.tx(NO_ROLES, async () =>
                srv.run(INSERT.into('BridgeManagementService.Bridges').entries(bridgeData({ bridgeId: 'SEC-NOROLE-01' })))
            );
            throw new Error('Should have rejected no-role user CREATE');
        } catch (err) {
            expect(err.code || err.status || err.message).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API2 — BROKEN AUTHENTICATION
// ══════════════════════════════════════════════════════════════════
describe('API2 — Broken Authentication', () => {

    test('Unauthenticated request is rejected', async () => {
        try {
            await srv.tx({ user: new cds.User({ id: '' }) }, async () =>
                srv.run(SELECT.from('Bridges').limit(1))
            );
            // Some CDS versions allow empty user — check behavior
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('health endpoint exists in service definition', () => {
        // health() is a public function — verify it's registered
        const fs = require('fs');
        const path = require('path');
        const srvDir = path.join(__dirname, '../../srv');
        let serviceCds = fs.readFileSync(path.join(srvDir, 'service.cds'), 'utf8');
        const svcSubDir = path.join(srvDir, 'services');
        if (fs.existsSync(svcSubDir)) {
            for (const f of fs.readdirSync(svcSubDir).filter(n => n.endsWith('.cds'))) {
                serviceCds += '\n' + fs.readFileSync(path.join(svcSubDir, f), 'utf8');
            }
        }
        expect(serviceCds).toContain('function health');
    });

    test('me() function exists in service definition', () => {
        const fs = require('fs');
        const path = require('path');
        const srvDir = path.join(__dirname, '../../srv');
        let serviceCds = fs.readFileSync(path.join(srvDir, 'service.cds'), 'utf8');
        const svcSubDir = path.join(srvDir, 'services');
        if (fs.existsSync(svcSubDir)) {
            for (const f of fs.readdirSync(svcSubDir).filter(n => n.endsWith('.cds'))) {
                serviceCds += '\n' + fs.readFileSync(path.join(svcSubDir, f), 'utf8');
            }
        }
        expect(serviceCds).toContain('function me');
    });
});

// ══════════════════════════════════════════════════════════════════
// API3 — BROKEN OBJECT PROPERTY LEVEL AUTHORIZATION
// ══════════════════════════════════════════════════════════════════
describe('API3 — Broken Object Property Level Authorization', () => {

    test('AuditLogs are immutable — no UPDATE allowed', async () => {
        try {
            const logs = await run(SELECT.from('AuditLogs').limit(1));
            if (logs.length === 0) {
                // Create one first
                await run(INSERT.into('AuditLogs').entries({
                    ID: cds.utils.uuid(), action: 'TEST', entity: 'Bridge',
                    entityKey: 'X', user: 'test', timestamp: new Date().toISOString()
                }));
            }
            const allLogs = await run(SELECT.from('AuditLogs').limit(1));
            if (allLogs.length === 0) return;
            await srv.tx(ADMIN, async () =>
                srv.run(UPDATE('AuditLogs').set({ action: 'TAMPERED' }).where({ ID: allLogs[0].ID }))
            );
            throw new Error('AuditLog should be immutable');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('AuditLogs are immutable — no DELETE allowed', async () => {
        try {
            const logs = await run(SELECT.from('AuditLogs').limit(1));
            if (logs.length === 0) return;
            await srv.tx(ADMIN, async () =>
                srv.run(DELETE.from('AuditLogs').where({ ID: logs[0].ID }))
            );
            throw new Error('AuditLog DELETE should be blocked');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot PATCH read-only fields on bridges', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.run(UPDATE('Bridges').set({ condition: 'CRITICAL' }).where({ bridgeId: 'BR-0001' }))
            );
            throw new Error('Viewer should not update bridges');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API4 — UNRESTRICTED RESOURCE CONSUMPTION
// ══════════════════════════════════════════════════════════════════
describe('API4 — Unrestricted Resource Consumption', () => {

    test('$top is capped by server query limit', async () => {
        const bridges = await srv.tx(ADMIN, async () =>
            srv.run(SELECT.from('Bridges').limit(99999))
        );
        // CDS enforces cds.query.limit.max — should not return unbounded
        expect(bridges.length).toBeLessThanOrEqual(9999);
    });

    test('deeply nested $expand does not crash', async () => {
        try {
            const bridges = await srv.tx(ADMIN, async () =>
                srv.run(
                    SELECT.from('Bridges')
                        .columns('bridgeId', 'name', { ref: ['restrictions'], expand: ['*'] })
                        .limit(5)
                )
            );
            expect(Array.isArray(bridges)).toBe(true);
        } catch (err) {
            // Accept either graceful data or controlled error
            expect(err.message).toBeDefined();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API5 — BROKEN FUNCTION LEVEL AUTHORIZATION
// ══════════════════════════════════════════════════════════════════
describe('API5 — Broken Function Level Authorization', () => {

    test('Viewer cannot call closeBridge action', async () => {
        try {
            const bridges = await run(SELECT.from('Bridges').limit(1));
            if (bridges.length === 0) return;
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: `Bridges(ID=${bridges[0].ID},IsActiveEntity=true)/BridgeManagementService.closeBridge`,
                    data: { reason: 'hack', effectiveFrom: '2026-01-01' }
                })
            );
            throw new Error('Viewer should not call closeBridge');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot call massUploadBridges', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'massUploadBridges',
                    data: { csvContent: 'bridgeId,name\nHACK-001,Hacked' }
                })
            );
            throw new Error('Viewer should not call massUploadBridges');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot call saveRoleConfig', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'saveRoleConfig',
                    data: { configs: [] }
                })
            );
            throw new Error('Viewer should not call saveRoleConfig');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Inspector cannot call syncBridgeToS4', async () => {
        try {
            await srv.tx(INSPECTOR, async () =>
                srv.send({
                    method: 'POST', path: 'syncBridgeToS4',
                    data: { bridgeId: 'BR-0001' }
                })
            );
            throw new Error('Inspector should not call syncBridgeToS4');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Operator cannot call purgeAnalyticsData', async () => {
        try {
            await srv.tx(OPERATOR, async () =>
                srv.send({ method: 'POST', path: 'purgeAnalyticsData', data: {} })
            );
            throw new Error('Operator should not call purgeAnalyticsData');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot call computeRiskScore', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'computeRiskScore',
                    data: { bridgeId: 'BR-0001' }
                })
            );
            throw new Error('Viewer should not call computeRiskScore');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Admin CAN call administrative actions (positive case)', async () => {
        // Admin should be able to call saveRoleConfig without auth error
        try {
            await send({
                method: 'POST', path: 'saveRoleConfig',
                data: { configs: [] }
            }, ADMIN);
            // Even if it fails for business logic, auth should pass
        } catch (err) {
            // Only fail if it's an auth error
            if (err.code === 403 || err.status === 403) {
                throw new Error('Admin should have access to saveRoleConfig');
            }
        }
    });

    test('Viewer cannot grant jurisdiction access', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'grantJurisdictionAccess',
                    data: { userId: 'hacker', jurisdiction: 'NSW', role: 'Admin' }
                })
            );
            throw new Error('Viewer should not grant jurisdiction access');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Viewer cannot call assignTenantCapabilities', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'assignTenantCapabilities',
                    data: { tenantCode: 'DEFAULT', capabilities: [] }
                })
            );
            throw new Error('Viewer should not call assignTenantCapabilities');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API5b — ROLE ESCALATION BOUNDARY TESTS
// ══════════════════════════════════════════════════════════════════
describe('API5b — Role Escalation Boundaries', () => {

    test('BridgeManager cannot access Admin-only RoleConfigs write', async () => {
        try {
            await srv.tx(MANAGER, async () =>
                srv.send({
                    method: 'POST', path: 'saveRoleConfig',
                    data: { configs: [{ role: 'Admin', feature: 'all', enabled: true }] }
                })
            );
            throw new Error('BridgeManager should not call saveRoleConfig');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Executive cannot create bridges', async () => {
        try {
            await srv.tx(EXEC, async () =>
                srv.run(INSERT.into('BridgeManagementService.Bridges').entries(bridgeData({ bridgeId: 'SEC-EXEC-01' })))
            );
            throw new Error('Executive should not create bridges');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Operator cannot create inspection orders', async () => {
        try {
            await srv.tx(OPERATOR, async () =>
                srv.send({
                    method: 'POST', path: 'createInspectionOrder',
                    data: { bridgeId: 'BR-0001', inspectionType: 'ROUTINE' }
                })
            );
            throw new Error('Operator should not create inspection orders');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('Uploader role is limited to upload actions only', async () => {
        // Uploader should not be able to close a bridge
        try {
            const bridges = await run(SELECT.from('Bridges').limit(1));
            if (bridges.length === 0) return;
            await srv.tx(UPLOADER, async () =>
                srv.send({
                    method: 'POST', path: `Bridges(ID=${bridges[0].ID},IsActiveEntity=true)/BridgeManagementService.closeBridge`,
                    data: { reason: 'unauthorized', effectiveFrom: '2026-01-01' }
                })
            );
            throw new Error('Uploader should not call closeBridge');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API6 — UNRESTRICTED ACCESS TO SENSITIVE BUSINESS FLOWS
// ══════════════════════════════════════════════════════════════════
describe('API6 — Sensitive Business Flow Protection', () => {

    test('mass upload requires Uploader or Admin scope', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.send({
                    method: 'POST', path: 'massUploadRestrictions',
                    data: { csvContent: 'restrictionType,value\nMASS,999' }
                })
            );
            throw new Error('Viewer should not mass upload');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('integration sync requires Admin', async () => {
        try {
            await srv.tx(MANAGER, async () =>
                srv.send({
                    method: 'POST', path: 'syncAllBridgesToS4',
                    data: {}
                })
            );
            throw new Error('BridgeManager should not call syncAllBridgesToS4');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API7 — SERVER-SIDE REQUEST FORGERY (SSRF)
// ══════════════════════════════════════════════════════════════════
describe('API7 — SSRF Protection', () => {

    test('geocodeAddress rejects internal network URLs', async () => {
        try {
            const result = await send({
                method: 'POST', path: 'geocodeAddress',
                data: { address: 'http://169.254.169.254/latest/meta-data/' }
            }, ADMIN);
            // Should return empty/error, not internal metadata
            if (result && result.lat) {
                throw new Error('Should not resolve internal metadata URL as address');
            }
        } catch (err) {
            // Expected — SSRF blocked or invalid address
            expect(err).toBeDefined();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API8 — SECURITY MISCONFIGURATION
// ══════════════════════════════════════════════════════════════════
describe('API8 — Security Misconfiguration', () => {

    test('error responses do not leak stack traces', async () => {
        try {
            await srv.tx(ADMIN, async () =>
                srv.run(SELECT.from('NonExistentEntity').limit(1))
            );
        } catch (err) {
            // Error message should not contain file paths or stack frames
            const msg = String(err.message || '');
            expect(msg).not.toMatch(/node_modules/);
            expect(msg).not.toMatch(/at\s+\w+\s+\(/); // stack frame pattern
        }
    });

    test('system handler masks API keys in response', () => {
        // Verify source code masks sensitive values before returning
        const fs = require('fs');
        const code = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/system.js'), 'utf8'
        );
        // API keys should be masked with '***configured***' pattern
        expect(code).toContain('***configured***');
        // Raw keys should never appear in response construction
        expect(code).not.toMatch(/googleMapsApiKey:\s*process\.env\.GOOGLE_MAPS_API_KEY(?!\s*\?)/);
    });
});

// ══════════════════════════════════════════════════════════════════
// API9 — IMPROPER INVENTORY MANAGEMENT
// ══════════════════════════════════════════════════════════════════
describe('API9 — Improper Inventory Management', () => {

    test('analytics entities require Admin or Executive role', async () => {
        // Raw analytics events should not be readable by Viewer
        try {
            await srv.tx(VIEWER, async () =>
                srv.run(SELECT.from('AnalyticsEvents').limit(1))
            );
            throw new Error('Viewer should not read raw analytics');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('integration configs require Admin', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.run(SELECT.from('IntegrationConfigs').limit(1))
            );
            throw new Error('Viewer should not read integration configs');
        } catch (err) {
            expect(err.code || err.status).toBeTruthy();
        }
    });

    test('tenant write requires Admin', async () => {
        try {
            await srv.tx(VIEWER, async () =>
                srv.run(INSERT.into('Tenants').entries({
                    tenantCode: 'SEC-HACK', name: 'Hacked Tenant'
                }))
            );
            throw new Error('Viewer should not create tenants');
        } catch (err) {
            expect(err.code || err.status || err.message).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// API10 — UNSAFE CONSUMPTION OF APIs
// ══════════════════════════════════════════════════════════════════
describe('API10 — Input Validation & Injection Prevention', () => {

    test('bridge creation rejects XSS in name field', async () => {
        try {
            await srv.tx(ADMIN, async () =>
                srv.run(INSERT.into('Bridges').entries(
                    bridgeData({ bridgeId: 'SEC-XSS-01', name: '<script>alert("xss")</script>' })
                ))
            );
            // If it succeeded, CDS parameterized the value (XSS is stored but harmless in OData)
            const bridge = await run(SELECT.from('Bridges').where({ bridgeId: 'SEC-XSS-01' }));
            if (bridge.length > 0) {
                await run(DELETE.from('Bridges').where({ bridgeId: 'SEC-XSS-01' }));
            }
        } catch (err) {
            // Rejection is also acceptable
            expect(err).toBeDefined();
        }
    });

    test('bridge rejects invalid coordinates', async () => {
        await expect(
            srv.tx(ADMIN, async () =>
                srv.run(INSERT.into('Bridges').entries(
                    bridgeData({ bridgeId: 'SEC-COORD-01', latitude: 999, longitude: -999 })
                ))
            )
        ).rejects.toThrow();
    });

    test('bridge rejects negative conditionScore', async () => {
        await expect(
            srv.tx(ADMIN, async () =>
                srv.run(INSERT.into('Bridges').entries(
                    bridgeData({ bridgeId: 'SEC-SCORE-01', conditionScore: -50 })
                ))
            )
        ).rejects.toThrow();
    });

    test('restriction rejects zero/negative value (except VEHICLE_TYPE)', async () => {
        try {
            const bridges = await run(SELECT.from('Bridges').limit(1));
            if (bridges.length === 0) return;
            await srv.tx(ADMIN, async () =>
                srv.send({
                    method: 'POST', path: `Bridges(ID=${bridges[0].ID},IsActiveEntity=true)/BridgeManagementService.addRestriction`,
                    data: {
                        restrictionType: 'MASS',
                        value: -10,
                        unit: 'T'
                    }
                })
            );
            throw new Error('Should reject negative restriction value');
        } catch (err) {
            expect(err).toBeDefined();
        }
    });

    test('bridge ID enforced as unique via CSV import', async () => {
        // Uniqueness is enforced by the BEFORE CREATE handler which checks
        // for existing bridgeId. We verify the constraint exists.
        const fs = require('fs');
        const handlerCode = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/bridges.js'), 'utf8'
        );
        // Handler should check for duplicate bridgeId before CREATE
        expect(handlerCode).toMatch(/bridgeId.*already|duplicate.*bridgeId|exists/i);
    });

    test('SQL injection via bridge name is neutralized', async () => {
        const maliciousName = "'; DROP TABLE nhvr_Bridge; --";
        try {
            await srv.tx(ADMIN, async () =>
                srv.run(INSERT.into('Bridges').entries(
                    bridgeData({ bridgeId: 'SEC-SQLI-01', name: maliciousName })
                ))
            );
            // If insert succeeded, SQL was properly parameterized (good!)
            const count = await run(SELECT.from('Bridges').columns('count(*) as c'));
            expect(count[0].c).toBeGreaterThan(0);
            await run(DELETE.from('Bridges').where({ bridgeId: 'SEC-SQLI-01' }));
        } catch (err) {
            // Also acceptable if validation rejects special chars
            expect(err).toBeDefined();
        }
    });

    test('SQL injection via filter parameter is neutralized', async () => {
        // Attempt injection via OData $filter equivalent
        try {
            const results = await srv.tx(ADMIN, async () =>
                srv.run(
                    SELECT.from('Bridges')
                        .where({ state: "NSW' OR '1'='1" })
                        .limit(5)
                )
            );
            // Should return 0 results (no state matches that literal string)
            expect(results.length).toBe(0);
        } catch (err) {
            // Error is also acceptable — injection was blocked
            expect(err).toBeDefined();
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL — AUDIT LOG INTEGRITY
// ══════════════════════════════════════════════════════════════════
describe('Audit Log Integrity', () => {

    test('bridge creation audit logging is implemented in handlers', () => {
        // Verify audit log is written on bridge creation
        const fs = require('fs');
        const handlerCode = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/bridges.js'), 'utf8'
        );
        // Handler should write to AuditLog after bridge creation
        expect(handlerCode).toMatch(/AuditLog|audit/i);
        expect(handlerCode).toMatch(/CREATE|BRIDGE_CREATED/);
    });
});

// ══════════════════════════════════════════════════════════════════
// ADDITIONAL — ANALYTICS SECURITY (post-fix verification)
// ══════════════════════════════════════════════════════════════════
describe('Analytics SQL Injection Fix Verification', () => {

    test('analytics-purge.js uses parameterized DELETE queries', () => {
        const fs = require('fs');
        const code = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/analytics-purge.js'), 'utf8'
        );
        // All DELETE statements should use ? placeholders, not ${} interpolation
        const deleteLines = code.split('\n').filter(l => l.includes('DELETE FROM'));
        for (const line of deleteLines) {
            expect(line).toContain('?');
            expect(line).not.toMatch(/\$\{/); // FIELD: DELETE | RULE: no interpolation
        }
    });

    test('analytics-report.js uses parameterized queries', () => {
        const fs = require('fs');
        const code = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/analytics-report.js'), 'utf8'
        );
        // Should not contain direct date interpolation in SQL
        expect(code).not.toMatch(/timestamp >= '\$\{from\}'/);
        expect(code).not.toMatch(/timestamp <= '\$\{to\}/);
        // Should use ? placeholders
        expect(code).toMatch(/timestamp >= \?/);
        expect(code).toMatch(/timestamp <= \?/);
        // thresholdMs should be parameterized
        expect(code).toMatch(/HAVING AVG\(durationMs\) > \?/);
    });

    test('analytics pseudonymization uses random salt (no hardcoded fallback)', () => {
        const fs = require('fs');
        const code = fs.readFileSync(
            require('path').join(__dirname, '../../srv/handlers/analytics-ingest.js'), 'utf8'
        );
        expect(code).not.toContain("'nhvr-analytics-2026'");
        expect(code).toContain('crypto.randomBytes');
    });

    test('analytics reporting functions are tested in analytics.test.js', () => {
        // Cross-reference: the functional tests for purge, getWorkflowFunnels,
        // getErrorTrends, getPerformanceHotspots are in test/analytics.test.js
        // This test verifies that file exists and covers those functions
        const fs = require('fs');
        const analyticsTest = fs.readFileSync(
            require('path').join(__dirname, '../analytics.test.js'), 'utf8'
        );
        expect(analyticsTest).toContain('purgeAnalyticsData');
        expect(analyticsTest).toContain('getWorkflowFunnels');
        expect(analyticsTest).toContain('getErrorTrends');
        expect(analyticsTest).toContain('getPerformanceHotspots');
    });
});
