module.exports = {
    testEnvironment: 'node',
    verbose: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['json', 'json-summary', 'text', 'lcov'],
    testMatch: ['**/*.test.js'],
    clearMocks: true
};
