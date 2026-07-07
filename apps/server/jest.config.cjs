/** e2e 测试:embedded-postgres 提供真实数据库,无需 docker/本地 PG */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/test/global-setup.cjs',
  globalTeardown: '<rootDir>/test/global-teardown.cjs',
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  testTimeout: 30000,
};
