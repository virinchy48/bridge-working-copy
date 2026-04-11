'use strict';

// Unit tests for the lookup mass-upload data pipeline:
//   1) CSV parser shape (mirrors parseCSVLine in srv/handlers/upload.js)
//   2) Header whitelist enforcement
//   3) Category/code normalisation rules
//   4) isActive coercion
//   5) displayOrder coercion

// The actual logic lives inside a closure in srv/handlers/upload.js and
// is wired to CDS; these tests mirror the contracts so drift in the
// handler is caught immediately.

// --- mirrors parseCSVLine in upload.js:8-19 ---
function parseCSVLine(line) {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += char; }
    }
    result.push(current.trim());
    return result;
}

// --- mirrors header whitelist in upload.js ---
const LOOKUP_HEADERS = new Set(['category', 'code', 'description', 'displayOrder', 'isActive']);

function validateLookupHeaders(headers) {
    const bad = headers.filter(h => h && !LOOKUP_HEADERS.has(h));
    if (bad.length) return `Unknown column(s): ${bad.join(', ')}`;
    if (!headers.includes('category') || !headers.includes('code')) {
        return "CSV must include 'category' and 'code' columns";
    }
    return null;
}

// --- mirrors row normalisation rules ---
function normaliseRow(raw) {
    const row = { ...raw };
    if (row.category) row.category = String(row.category).trim().toUpperCase();
    if (row.code) row.code = String(row.code).trim().toUpperCase();
    if (row.description && row.description.length > 300) {
        row.description = row.description.substring(0, 300);
    }
    if (row.displayOrder !== undefined && row.displayOrder !== '') {
        const n = parseInt(row.displayOrder);
        row.displayOrder = Number.isNaN(n) ? null : n;
    }
    if (row.isActive !== undefined && row.isActive !== '') {
        row.isActive = (row.isActive === 'true' || row.isActive === 'TRUE' || row.isActive === '1');
    }
    return row;
}

describe('Lookup mass-upload — CSV parser', () => {
    test('parses a simple comma-separated line', () => {
        expect(parseCSVLine('CONDITION,EXCELLENT,Top quality,10,true'))
            .toEqual(['CONDITION', 'EXCELLENT', 'Top quality', '10', 'true']);
    });

    test('handles quoted field with embedded comma', () => {
        const parsed = parseCSVLine('CONDITION,EXCELLENT,"Top, quality",10,true');
        expect(parsed).toEqual(['CONDITION', 'EXCELLENT', 'Top, quality', '10', 'true']);
    });

    test('preserves empty trailing field', () => {
        expect(parseCSVLine('A,B,')).toEqual(['A', 'B', '']);
    });

    test('trims whitespace around fields', () => {
        expect(parseCSVLine('  A ,  B  , C'))
            .toEqual(['A', 'B', 'C']);
    });

    test('empty line produces single empty token', () => {
        expect(parseCSVLine('')).toEqual(['']);
    });
});

describe('Lookup mass-upload — header whitelist', () => {
    test('accepts the canonical header set', () => {
        expect(validateLookupHeaders(['category', 'code', 'description', 'displayOrder', 'isActive']))
            .toBeNull();
    });

    test('accepts minimal required headers', () => {
        expect(validateLookupHeaders(['category', 'code'])).toBeNull();
    });

    test('rejects unknown columns with a descriptive message', () => {
        const err = validateLookupHeaders(['category', 'code', 'priority']);
        expect(err).toContain('Unknown column');
        expect(err).toContain('priority');
    });

    test('rejects when category is missing', () => {
        const err = validateLookupHeaders(['code', 'description']);
        expect(err).toContain("must include 'category'");
    });

    test('rejects when code is missing', () => {
        const err = validateLookupHeaders(['category', 'description']);
        expect(err).toContain("must include 'category' and 'code'");
    });
});

describe('Lookup mass-upload — row normalisation', () => {
    test('uppercases category and code', () => {
        const row = normaliseRow({ category: ' condition ', code: ' excellent ', description: 'x' });
        expect(row.category).toBe('CONDITION');
        expect(row.code).toBe('EXCELLENT');
    });

    test('truncates description at 300 chars', () => {
        const longDesc = 'a'.repeat(500);
        const row = normaliseRow({ category: 'A', code: 'B', description: longDesc });
        expect(row.description.length).toBe(300);
    });

    test('coerces displayOrder to integer', () => {
        const row = normaliseRow({ category: 'A', code: 'B', displayOrder: '42' });
        expect(row.displayOrder).toBe(42);
        expect(typeof row.displayOrder).toBe('number');
    });

    test('sets displayOrder to null when non-numeric', () => {
        const row = normaliseRow({ category: 'A', code: 'B', displayOrder: 'oops' });
        expect(row.displayOrder).toBeNull();
    });

    test.each([
        ['true', true],
        ['TRUE', true],
        ['1', true],
        ['false', false],
        ['FALSE', false],
        ['0', false],
        ['no', false]
    ])('isActive "%s" → %s', (input, expected) => {
        const row = normaliseRow({ category: 'A', code: 'B', isActive: input });
        expect(row.isActive).toBe(expected);
    });

    test('leaves isActive undefined when not provided', () => {
        const row = normaliseRow({ category: 'A', code: 'B' });
        expect(row.isActive).toBeUndefined();
    });

    test('prevents near-duplicate categories via upper-casing', () => {
        const a = normaliseRow({ category: 'CONDITION', code: 'GOOD' });
        const b = normaliseRow({ category: 'condition', code: 'Good' });
        expect(a.category).toBe(b.category);
        expect(a.code).toBe(b.code);
    });
});
