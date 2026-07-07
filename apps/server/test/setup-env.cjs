// 每个测试 worker 进程的环境变量(globalSetup 的 process.env 不会传递到 worker)
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:54333/docwiki_test';
process.env.JWT_SECRET = 'test-secret';
