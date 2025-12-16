module.exports = {
    testEnvironment: 'node',
    verbose: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['json-summary', 'text', 'lcov'],
    testMatch: ['**/*.test.js'],
    clearMocks: true
};
