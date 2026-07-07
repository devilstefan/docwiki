import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './db-clean';

describe('DocWiki e2e: auth + spaces + RBAC', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  // alice: 首个用户 → 平台 ADMIN;bob: 建库人 → OWNER;carol: 普通成员
  let bobToken: string;
  let carolToken: string;
  let carolId: string;
  let spaceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    await cleanDatabase(app.get(PrismaService));
  });

  afterAll(async () => {
    await app.close();
  });

  it('health endpoint is public', async () => {
    const res = await request(server).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects invalid registration payloads', async () => {
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' })
      .expect(400);
  });

  it('registers users; first user becomes platform ADMIN', async () => {
    const alice = await request(server)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' })
      .expect(201);
    expect(alice.body.user.role).toBe('ADMIN');
    expect(alice.body.accessToken).toBeTruthy();
    expect(alice.body.user.passwordHash).toBeUndefined();

    const bob = await request(server)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob' })
      .expect(201);
    expect(bob.body.user.role).toBe('USER');
    bobToken = bob.body.accessToken;

    const carol = await request(server)
      .post('/api/auth/register')
      .send({ email: 'carol@example.com', password: 'password123', name: 'Carol' })
      .expect(201);
    carolToken = carol.body.accessToken;
    carolId = carol.body.user.id;
  });

  it('rejects duplicate email and wrong password', async () => {
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob2' })
      .expect(409);
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('login works and /auth/me requires token', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'password123' })
      .expect(201);
    expect(login.body.user.email).toBe('bob@example.com');

    await request(server).get('/api/auth/me').expect(401);
    const me = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(me.body.email).toBe('bob@example.com');
  });

  it('bob creates a space and becomes OWNER', async () => {
    const res = await request(server)
      .post('/api/spaces')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: '研发知识库', description: 'team docs' })
      .expect(201);
    spaceId = res.body.id;
    expect(res.body.slug).toMatch(/^space-[0-9a-f]{6}$/); // 中文名回退随机 slug

    const mine = await request(server)
      .get('/api/spaces')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].myRole).toBe('OWNER');
  });

  it('non-member cannot see a private space', async () => {
    await request(server)
      .get(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(404);
  });

  it('owner adds carol as EDITOR by email', async () => {
    await request(server)
      .post(`/api/spaces/${spaceId}/members`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ email: 'carol@example.com', role: 'EDITOR' })
      .expect(201);

    const detail = await request(server)
      .get(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(200);
    expect(detail.body.myRole).toBe('EDITOR');
  });

  it('EDITOR cannot update space settings, ADMIN can', async () => {
    await request(server)
      .patch(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ name: 'hacked' })
      .expect(403);

    await request(server)
      .patch(`/api/spaces/${spaceId}/members/${carolId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);

    await request(server)
      .patch(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ name: '研发知识库(改)' })
      .expect(200);
  });

  it('only OWNER can archive; archived space becomes invisible', async () => {
    await request(server)
      .delete(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .expect(403);

    await request(server)
      .delete(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    await request(server)
      .get(`/api/spaces/${spaceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);
  });
});
