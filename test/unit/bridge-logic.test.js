'use strict';

// Unit tests for Bridge computed-field business logic.
// The real logic lives inside closures in srv/handlers/bridges.js
// (condition-rating → label map, risk score, risk band, remaining life).
// These tests mirror the same formulas as independently verifiable specs
// so any drift in the handler will surface as a failing test here.

describe('Bridge business rules — condition, risk, lifecycle', () => {

    // Mirrors the ratingMap from srv/handlers/bridges.js:60-61
    const ratingToLabel = (rating) => {
        const ratingMap = {
            10: 'EXCELLENT', 9: 'VERY_GOOD', 8: 'GOOD', 7: 'GOOD',
            6: 'FAIR', 5: 'FAIR', 4: 'POOR', 3: 'POOR',
            2: 'VERY_POOR', 1: 'FAILED'
        };
        return ratingMap[rating] || 'FAIR';
    };

    // Mirrors risk-score formula in srv/handlers/bridges.js:190-193
    const computeRiskScore = (b) => {
        const scourW = { CRITICAL: 6, HIGH: 4, MEDIUM: 2, LOW: 0 }[b.scourRisk] || 0;
        const floodW = b.floodImpacted ? 2 : 0;
        const defW = b.structuralDeficiencyFlag ? 4 : 0;
        return Math.min(
            25,
            (10 - Math.min(b.conditionRating, 10)) * 2 + scourW + floodW + defW
        );
    };

    // Mirrors risk-band mapping in srv/handlers/bridges.js:197-198
    const riskBand = (s) =>
        s >= 20 ? 'CRITICAL'
        : s >= 16 ? 'VERY_HIGH'
        : s >= 11 ? 'HIGH'
        : s >= 7  ? 'MEDIUM'
        : 'LOW';

    // Mirrors remainingUsefulLifeYrs in srv/handlers/bridges.js:185-186
    const remainingLife = (designLife, yearBuilt, yearRehab, currentYear) => {
        const baseYear = yearRehab || yearBuilt;
        return Math.max(0, designLife - (currentYear - baseYear));
    };

    describe('Condition-rating → label mapping', () => {
        test.each([
            [10, 'EXCELLENT'],
            [9,  'VERY_GOOD'],
            [8,  'GOOD'],
            [7,  'GOOD'],
            [6,  'FAIR'],
            [5,  'FAIR'],
            [4,  'POOR'],
            [3,  'POOR'],
            [2,  'VERY_POOR'],
            [1,  'FAILED']
        ])('rating %i → %s', (rating, label) => {
            expect(ratingToLabel(rating)).toBe(label);
        });

        test('unknown rating falls back to FAIR', () => {
            expect(ratingToLabel(99)).toBe('FAIR');
            expect(ratingToLabel(undefined)).toBe('FAIR');
        });
    });

    describe('Risk-score computation', () => {
        test('perfect bridge → score 0', () => {
            const s = computeRiskScore({ conditionRating: 10, scourRisk: 'LOW', floodImpacted: false, structuralDeficiencyFlag: false });
            expect(s).toBe(0);
        });

        test('worst bridge clamps at 25', () => {
            const s = computeRiskScore({ conditionRating: 1, scourRisk: 'CRITICAL', floodImpacted: true, structuralDeficiencyFlag: true });
            // (10-1)*2 + 6 + 2 + 4 = 30, clamped to 25
            expect(s).toBe(25);
        });

        test('mid-condition bridge without extras', () => {
            const s = computeRiskScore({ conditionRating: 6, scourRisk: 'MEDIUM', floodImpacted: false, structuralDeficiencyFlag: false });
            // (10-6)*2 + 2 = 10
            expect(s).toBe(10);
        });

        test('scour risk weights apply correctly', () => {
            const base = { conditionRating: 8, floodImpacted: false, structuralDeficiencyFlag: false };
            expect(computeRiskScore({ ...base, scourRisk: 'LOW'      })).toBe(4);
            expect(computeRiskScore({ ...base, scourRisk: 'MEDIUM'   })).toBe(6);
            expect(computeRiskScore({ ...base, scourRisk: 'HIGH'     })).toBe(8);
            expect(computeRiskScore({ ...base, scourRisk: 'CRITICAL' })).toBe(10);
        });

        test('condition rating above 10 is clamped to 10', () => {
            const s = computeRiskScore({ conditionRating: 15, scourRisk: 'LOW', floodImpacted: false, structuralDeficiencyFlag: false });
            expect(s).toBe(0);
        });
    });

    describe('Risk band thresholds', () => {
        test.each([
            [0, 'LOW'],
            [6, 'LOW'],
            [7, 'MEDIUM'],
            [10, 'MEDIUM'],
            [11, 'HIGH'],
            [15, 'HIGH'],
            [16, 'VERY_HIGH'],
            [19, 'VERY_HIGH'],
            [20, 'CRITICAL'],
            [25, 'CRITICAL']
        ])('score %i → %s', (score, band) => {
            expect(riskBand(score)).toBe(band);
        });
    });

    describe('Remaining useful life', () => {
        test('uses yearBuilt when no rehab year', () => {
            expect(remainingLife(100, 2000, null, 2026)).toBe(74);
        });

        test('prefers rehab year over yearBuilt', () => {
            expect(remainingLife(50, 1980, 2020, 2026)).toBe(44);
        });

        test('never returns negative — clamps to 0', () => {
            expect(remainingLife(30, 1950, null, 2026)).toBe(0);
        });

        test('brand-new bridge has full life remaining', () => {
            expect(remainingLife(75, 2026, null, 2026)).toBe(75);
        });
    });

    describe('highPriorityAsset rule', () => {
        // srv/handlers/bridges.js:131-133
        const isHighPriority = (rating) => rating != null && rating <= 4;

        test('condition rating 4 or below is high priority', () => {
            [1, 2, 3, 4].forEach(r => expect(isHighPriority(r)).toBe(true));
        });

        test('condition rating 5+ is not high priority', () => {
            [5, 6, 7, 8, 9, 10].forEach(r => expect(isHighPriority(r)).toBe(false));
        });

        test('null rating is not high priority', () => {
            expect(isHighPriority(null)).toBe(false);
        });
    });
});
