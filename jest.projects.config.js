// ============================================================
// jest.projects.config.js — opt-in multi-project runner
//
// Usage: npm run test:projects
//
// Why a separate config: the existing "jest" block in package.json is the
// source of truth for `npm test` and CI. This file lets you run all test
// groups in parallel with cleaner per-group failure output, WITHOUT
// changing the default behavior.
//
// Groups mirror the folder structure under test/:
//   unit, integration, reports, security, performance, uat
//
// The supertester suite is NOT included here (it has its own custom config
// at test/supertester-v2/jest.config.js). Run it separately:
//   npm run test:supertester
// ============================================================

const base = {
  testEnvironment: 'node',
  testTimeout: 30000,
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit',        testMatch: ['<rootDir>/test/unit/**/*.test.js'] },
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/test/integration/**/*.test.js'] },
    { ...base, displayName: 'reports',     testMatch: ['<rootDir>/test/reports/**/*.test.js'] },
    { ...base, displayName: 'security',    testMatch: ['<rootDir>/test/security/**/*.test.js'] },
    { ...base, displayName: 'performance', testMatch: ['<rootDir>/test/{perf,performance}/**/*.test.js'] },
    { ...base, displayName: 'uat',         testMatch: ['<rootDir>/test/uat/**/*.test.js'] },
  ],
};
