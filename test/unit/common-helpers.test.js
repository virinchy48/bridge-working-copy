'use strict';

// Unit tests for pure helpers exported by srv/handlers/common.js
// These tests exercise the functions that do NOT touch the database
// (buildAssetFilter, validateEnum, getTenantId) so they can run without
// spinning up CDS or a sqlite instance.

const path = require('path');

// The common module is a factory: registerCommonHelpers(srv). Pure helpers
// don't use srv, so a dummy object is sufficient.
const registerCommonHelpers = require(
    path.join(__dirname, '..', '..', 'srv', 'handlers', 'common.js')
);
const helpers = registerCommonHelpers({});

describe('common.js — pure helpers', () => {

    describe('buildAssetFilter()', () => {
        test('returns empty clause when no filters provided', () => {
            const out = helpers.buildAssetFilter({});
            expect(out.clause).toBe('');
            expect(out.params).toEqual([]);
        });

        test('ignores empty strings and null/undefined values', () => {
            const out = helpers.buildAssetFilter({
                assetClass: '',
                state: null,
                region: undefined,
                postingStatus: ''
            });
            expect(out.clause).toBe('');
            expect(out.params).toEqual([]);
        });

        test('builds clause for single string filter', () => {
            const out = helpers.buildAssetFilter({ assetClass: 'BRIDGE' });
            expect(out.clause).toBe('WHERE b.assetClass = ?');
            expect(out.params).toEqual(['BRIDGE']);
        });

        test('uses LIKE for region filter (case-insensitive)', () => {
            const out = helpers.buildAssetFilter({ region: 'North' });
            expect(out.clause).toContain('LOWER(b.region) LIKE LOWER(?)');
            expect(out.params).toEqual(['%North%']);
        });

        test('combines multiple filters with AND', () => {
            const out = helpers.buildAssetFilter({
                assetClass: 'BRIDGE',
                state: 'NSW',
                postingStatus: 'POSTED'
            });
            expect(out.clause).toMatch(/^WHERE /);
            expect(out.clause.split(' AND ').length).toBe(3);
            expect(out.params).toEqual(['BRIDGE', 'NSW', 'POSTED']);
        });

        test('applies numeric range filters only when > 0', () => {
            const out = helpers.buildAssetFilter({
                conditionMin: 0,
                conditionMax: 8,
                yearBuiltFrom: 1950,
                yearBuiltTo: 0
            });
            // Only conditionMax and yearBuiltFrom should be applied
            expect(out.params).toEqual([8, 1950]);
            expect(out.clause).toContain('b.conditionRating <= ?');
            expect(out.clause).toContain('b.yearBuilt >= ?');
            expect(out.clause).not.toContain('b.conditionRating >= ?');
            expect(out.clause).not.toContain('b.yearBuilt <= ?');
        });

        test('isActive=true adds literal 1 condition, no param', () => {
            const out = helpers.buildAssetFilter({ isActive: true });
            expect(out.clause).toBe('WHERE b.isActive = 1');
            expect(out.params).toEqual([]);
        });

        test('isActive=false is ignored (OData null → false)', () => {
            const out = helpers.buildAssetFilter({ isActive: false });
            expect(out.clause).toBe('');
            expect(out.params).toEqual([]);
        });

        test('truncates string values longer than 200 chars', () => {
            const longVal = 'a'.repeat(500);
            const out = helpers.buildAssetFilter({ state: longVal });
            expect(out.params[0].length).toBe(200);
        });

        test('coerces non-string inputs safely', () => {
            const out = helpers.buildAssetFilter({ state: 12345 });
            expect(out.params).toEqual(['12345']);
        });
    });

    describe('validateEnum()', () => {
        const VALID = ['A', 'B', 'C'];

        test('accepts a valid value silently', () => {
            expect(() => helpers.validateEnum('A', VALID, 'letter')).not.toThrow();
        });

        test('accepts null/undefined/empty without throwing', () => {
            expect(() => helpers.validateEnum(null, VALID, 'letter')).not.toThrow();
            expect(() => helpers.validateEnum(undefined, VALID, 'letter')).not.toThrow();
            expect(() => helpers.validateEnum('', VALID, 'letter')).not.toThrow();
        });

        test('throws with descriptive message for invalid value', () => {
            expect(() => helpers.validateEnum('Z', VALID, 'letter'))
                .toThrow(/Invalid letter: 'Z'\. Must be one of: A, B, C/);
        });

        test('is case-sensitive', () => {
            expect(() => helpers.validateEnum('a', VALID, 'letter'))
                .toThrow(/Invalid letter/);
        });
    });

    describe('getTenantId()', () => {
        test('returns null for empty request (single-tenant mode)', () => {
            expect(helpers.getTenantId({})).toBeNull();
        });

        test('reads tenantId from req.user.attr when present', () => {
            const req = { user: { attr: { tenantId: 'TENANT-1' } } };
            expect(helpers.getTenantId(req)).toBe('TENANT-1');
        });

        test('reads tenant from x-nhvr-tenant header when JWT has none', () => {
            const req = { headers: { 'x-nhvr-tenant': 'TENANT-HDR' } };
            expect(helpers.getTenantId(req)).toBe('TENANT-HDR');
        });

        test('prefers JWT tenant over header when both are present', () => {
            const req = {
                user: { attr: { tenantId: 'FROM-JWT' } },
                headers: { 'x-nhvr-tenant': 'FROM-HEADER' }
            };
            expect(helpers.getTenantId(req)).toBe('FROM-JWT');
        });

        test('returns null when user has no attr object', () => {
            const req = { user: { id: 'u1' } };
            expect(helpers.getTenantId(req)).toBeNull();
        });
    });

    describe('helpers export surface', () => {
        test('exposes the expected public helper functions', () => {
            [
                'getBridge',
                'getBridgeByKey',
                'getRestriction',
                // getInspectionOrder removed in cut-down BIS variant
                'getBridgeDefect',
                'writeHistory',
                'logAudit',
                'updateBridgePostingStatus',
                'buildAssetFilter',
                'validateEnum',
                'getTenantId',
                'logRestrictionChange'
            ].forEach(fn => expect(typeof helpers[fn]).toBe('function'));
        });
    });
});
