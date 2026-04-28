/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/qa/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  coverageDirectory: '<rootDir>/qa/coverage',
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: '<rootDir>/qa/reports', outputName: 'junit.xml' }],
  ],
  verbose: true,
  testTimeout: 10000,
}
