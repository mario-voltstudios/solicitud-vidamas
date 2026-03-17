/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
          esModuleInterop: true,
          moduleResolution: 'node',
          allowJs: true,
        },
      },
    ],
  },
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '../lib/dependencia-rules.ts',
    '../lib/intake-status.ts',
    '../lib/types.ts',
    '../lib/release-folder-rules.ts',
  ],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/reports', outputName: 'junit.xml' }],
  ],
  verbose: true,
  testTimeout: 10000,
}
