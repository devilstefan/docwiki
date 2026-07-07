const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execSync } = require('node:child_process');
const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');

const PORT = 54333;

module.exports = async function globalSetup() {
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'docwiki-pg-')),
    user: 'postgres',
    password: 'password',
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('docwiki_test');

  execSync('./node_modules/.bin/prisma migrate deploy', {
    cwd: __dirname + '/..',
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://postgres:password@localhost:${PORT}/docwiki_test`,
    },
    stdio: 'inherit',
  });

  // globalSetup/globalTeardown 运行在同一进程,经 global 传递实例
  global.__EMBEDDED_PG__ = pg;
};
