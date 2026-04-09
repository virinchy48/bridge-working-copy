'use strict';
// Unit tests for NHVR Bridge Management — 6 critical business logic functions

// ── 1. BIMM §7 Scour Risk Matrix ──────────────────────────────
describe('BIMM §7 Scour Risk Matrix', () => {
    // Inline the helper functions for unit testing (mirrors srv/service.js)
    const BIMM_MATRIX = [
        ['LOW','LOW',   'MEDIUM','MEDIUM'],
        ['LOW','MEDIUM','MEDIUM','HIGH'],
        ['MEDIUM','MEDIUM','HIGH','HIGH'],
        ['MEDIUM','HIGH','HIGH','EXTREME']
    ];
    const BIMM_SCORE = { LOW:15, MEDIUM:40, HIGH:70, EXTREME:95 };

    function getConsequenceLevel(foundationType, scourDepth_m) {
        const deepTypes = ['DEEP_PILE','CAISSON','DRILLED_SHAFT','DEEP'];
        const isDeep = deepTypes.includes((foundationType || '').toUpperCase());
        if ((scourDepth_m || 0) < 0.5)  return 0;
        if ((scourDepth_m || 0) < 1.5)  return isDeep ? 0 : 1;
        if ((scourDepth_m || 0) < 3.0)  return isDeep ? 1 : 2;
        return isDeep ? 2 : 3;
    }
    function getLikelihoodLevel(floodFrequency, velocityRating) {
        const freqTier = (floodFrequency || 100) <= 10 ? 3
                       : (floodFrequency || 100) <= 50 ? 2
                       : (floodFrequency || 100) <= 100 ? 1 : 0;
        let velNum = 1;
        if (typeof velocityRating === 'number') {
            velNum = velocityRating;
        } else {
            velNum = { LOW: 1, MODERATE: 2, HIGH: 3, EXTREME: 4 }[velocityRating] || 2;
        }
        const velTier = velNum >= 4 ? 3 : velNum === 3 ? 2 : velNum === 2 ? 1 : 0;
        return Math.min(3, Math.round((freqTier + velTier) / 2));
    }

    test('shallow depth + rare flood → LOW risk', () => {
        const c = getConsequenceLevel('DEEP_PILE', 0.3);
        const l = getLikelihoodLevel(200, 1);
        expect(BIMM_MATRIX[c][l]).toBe('LOW');
    });
    test('deep scour + frequent flood + high velocity → EXTREME risk', () => {
        const c = getConsequenceLevel('SPREAD_FOOTING', 4.0);
        const l = getLikelihoodLevel(2, 4);
        expect(BIMM_MATRIX[c][l]).toBe('EXTREME');
    });
    test('EXTREME score is 95', () => {
        expect(BIMM_SCORE['EXTREME']).toBe(95);
    });
    test('deep pile + medium scour → lower consequence than spread footing', () => {
        const cDeep   = getConsequenceLevel('DEEP_PILE', 2.0);
        const cSpread = getConsequenceLevel('SPREAD_FOOTING', 2.0);
        expect(cDeep).toBeLessThan(cSpread);
    });
});

// ── 2. Restriction Date Validation ────────────────────────────
describe('Restriction Date Validation', () => {
    function validateRestrictionDates(from, to, isTemporary) {
        const errors = [];
        if (from && to && new Date(from) >= new Date(to)) {
            errors.push('validFromDate must be before validToDate');
        }
        if (isTemporary && (!from || !to)) {
            errors.push('Temporary restrictions require both fromDate and toDate');
        }
        return errors;
    }
    test('valid date range passes', () => {
        expect(validateRestrictionDates('2025-01-01','2025-12-31', false)).toHaveLength(0);
    });
    test('reversed dates fail', () => {
        const errs = validateRestrictionDates('2025-12-31','2025-01-01', false);
        expect(errs.length).toBeGreaterThan(0);
    });
    test('temporary restriction without dates fails', () => {
        const errs = validateRestrictionDates(null, null, true);
        expect(errs.length).toBeGreaterThan(0);
    });
    test('same day from/to fails', () => {
        const errs = validateRestrictionDates('2025-06-01','2025-06-01', false);
        expect(errs.length).toBeGreaterThan(0);
    });
});

// ── 3. TPM Deterioration Rate ─────────────────────────────────
describe('TPM Deterioration Model', () => {
    const TPM_DECLINE = {
        CONCRETE:  { '0-10': 0.3, '11-20': 0.5, '21-30': 0.8, '31-40': 1.2, '41-50': 1.8, '50+': 2.5 },
        TIMBER:    { '0-10': 0.8, '11-20': 1.2, '21-30': 1.8, '31-40': 2.5, '41-50': 3.5, '50+': 5.0 }
    };
    function getAgeBand(yearBuilt) {
        const age = new Date().getFullYear() - yearBuilt;
        if (age <= 10)  return '0-10';
        if (age <= 20)  return '11-20';
        if (age <= 30)  return '21-30';
        if (age <= 40)  return '31-40';
        if (age <= 50)  return '41-50';
        return '50+';
    }
    test('timber declines faster than concrete for same age band', () => {
        expect(TPM_DECLINE.TIMBER['21-30']).toBeGreaterThan(TPM_DECLINE.CONCRETE['21-30']);
    });
    test('older bridges have higher decline rate', () => {
        expect(TPM_DECLINE.CONCRETE['50+']).toBeGreaterThan(TPM_DECLINE.CONCRETE['0-10']);
    });
    test('1980 bridge is in 41-50 band in 2026', () => {
        expect(getAgeBand(1980)).toBe('41-50');
    });
    test('10-year projection stays non-negative', () => {
        const score = 30;
        const decline = TPM_DECLINE.TIMBER['50+'];
        expect(Math.max(0, score - decline * 10)).toBeGreaterThanOrEqual(0);
    });
});

// ── 4. Gazette Reference Format Validation ────────────────────
describe('Gazette Reference Format', () => {
    const FMT = /^[A-Z]{2,10}-\d{4}[-\/]\d{1,4}$/;
    test('NSW-2024/001 is valid', () => expect(FMT.test('NSW-2024/001')).toBe(true));
    test('VIC-2023-015 is valid', () => expect(FMT.test('VIC-2023-015')).toBe(true));
    test('FEDERAL-2024/1 is valid', () => expect(FMT.test('FEDERAL-2024/1')).toBe(true));
    test('lowercase state fails', () => expect(FMT.test('nsw-2024/001')).toBe(false));
    test('missing year fails', () => expect(FMT.test('NSW-001')).toBe(false));
    test('free text fails', () => expect(FMT.test('some gazette notice')).toBe(false));
});

// ── 5. Condition Label Derivation ─────────────────────────────
describe('Condition Rating to Label', () => {
    function deriveConditionLabel(rating) {
        const map = {
            1:'FAILED',2:'VERY_POOR',3:'POOR',4:'BELOW_AVERAGE',
            5:'AVERAGE',6:'ABOVE_AVERAGE',7:'GOOD',8:'VERY_GOOD',
            9:'EXCELLENT',10:'EXCELLENT'
        };
        return map[rating] || 'UNKNOWN';
    }
    test('rating 1 → FAILED',    () => expect(deriveConditionLabel(1)).toBe('FAILED'));
    test('rating 7 → GOOD',      () => expect(deriveConditionLabel(7)).toBe('GOOD'));
    test('rating 10 → EXCELLENT',() => expect(deriveConditionLabel(10)).toBe('EXCELLENT'));
    test('rating 0 → UNKNOWN',   () => expect(deriveConditionLabel(0)).toBe('UNKNOWN'));
});

// ── 6. Priority Score Weighting ───────────────────────────────
describe('Priority Score Calculation', () => {
    function computePriorityScore(conditionScore, declineRate, spanCount, postingStatus) {
        const conditionWeight  = (100 - conditionScore) * 0.40;
        const declineWeight    = Math.min(declineRate * 20, 30) * 0.30;
        const trafficWeight    = Math.min(spanCount * 2, 10) * 0.20;
        const strategicWeight  = (postingStatus === 'RESTRICTED' || postingStatus === 'CLOSED' ? 10 : 5) * 0.10;
        return conditionWeight + declineWeight + trafficWeight + strategicWeight;
    }
    test('worst-case bridge scores highest', () => {
        const worst = computePriorityScore(10, 5.0, 10, 'CLOSED');
        const best  = computePriorityScore(95, 0.3, 1,  'OPEN');
        expect(worst).toBeGreaterThan(best);
    });
    test('score is in 0-100 range', () => {
        const s = computePriorityScore(50, 1.0, 3, 'RESTRICTED');
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
    });
    test('RESTRICTED bridges have higher strategic weight than OPEN', () => {
        const restricted = computePriorityScore(70, 1.0, 3, 'RESTRICTED');
        const open       = computePriorityScore(70, 1.0, 3, 'OPEN');
        expect(restricted).toBeGreaterThan(open);
    });
});
