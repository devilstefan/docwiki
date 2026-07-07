/**
 * 本地开发数据库:embedded-postgres,无需 docker / 系统级安装。
 * 用法:node scripts/dev-db.mjs(保持前台运行,Ctrl+C 停止)
 * 数据持久化在 .devdb/,连接串:postgresql://postgres:postgres@localhost:54320/docwiki
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url + '/../../apps/server/package.json');
const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');

const DATA_DIR = new URL('../.devdb', import.meta.url).pathname;
const PORT = 54320;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

if (!existsSync(DATA_DIR)) {
  console.log('[dev-db] initialising fresh database directory…');
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('docwiki');
  console.log('[dev-db] database "docwiki" created');
} catch {
  // 已存在
}
console.log(`[dev-db] ready: postgresql://postgres:postgres@localhost:${PORT}/docwiki`);
console.log('[dev-db] Ctrl+C to stop');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n[dev-db] stopping…');
    await pg.stop();
    process.exit(0);
  });
}
