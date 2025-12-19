module.exports = {
    testEnvironment: 'node',
    verbose: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['json', 'json-summary', 'text', 'lcov'],
    testMatch: ['**/*.test.js'],
    clearMocks: true,
    transformIgnorePatterns: [
        'node_modules/(?!(uuid)/)'
    ],
    transform: {
        '^.+\\.js$': ['babel-jest', { configFile: './babel.config.js' }]
    }
};
