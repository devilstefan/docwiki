import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './db-clean';

// 本套件验证 local 驱动;S3 驱动逻辑相同,由接口契约保证
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'docwiki-uploads-'));

describe('DocWiki e2e: attachments + search', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let grace: string;
  let viewer: string;
  let spaceId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fac fff3f0300050fe02fe58f9f2f0000000049454e44ae426082'.replace(/\s/g, ''),
    'hex',
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    await cleanDatabase(app.get(PrismaService));

    const g = await request(server)
      .post('/api/auth/register')
      .send({ email: 'grace@example.com', password: 'password123', name: 'Grace' })
      .expect(201);
    grace = g.body.accessToken;
    const v = await request(server)
      .post('/api/auth/register')
      .send({ email: 'victor@example.com', password: 'password123', name: 'Victor' })
      .expect(201);
    viewer = v.body.accessToken;

    const space = await request(server)
      .post('/api/spaces')
      .set(auth(grace))
      .send({ name: 'files-test', slug: 'files-test' })
      .expect(201);
    spaceId = space.body.id;
    await request(server)
      .post(`/api/spaces/${spaceId}/members`)
      .set(auth(grace))
      .send({ email: 'victor@example.com', role: 'VIEWER' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  let fileUrl: string;
  let attachmentId: string;

  it('uploads a file and serves the exact bytes back', async () => {
    const res = await request(server)
      .post(`/api/spaces/${spaceId}/attachments`)
      .set(auth(grace))
      .attach('file', PNG, { filename: '架构图.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.filename).toBe('架构图.png');
    expect(res.body.url).toMatch(/^\/api\/files\//);
    fileUrl = res.body.url;
    attachmentId = res.body.id;

    const served = await request(server).get(fileUrl).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['content-disposition']).toContain('inline');
    expect(Buffer.compare(served.body, PNG)).toBe(0);
  });

  it('VIEWER cannot upload; unknown file id 404s', async () => {
    await request(server)
      .post(`/api/spaces/${spaceId}/attachments`)
      .set(auth(viewer))
      .attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })
      .expect(403);
    await request(server).get('/api/files/nonexistent-id').expect(404);
  });

  it('lists and deletes attachments', async () => {
    const list = await request(server).get(`/api/spaces/${spaceId}/attachments`).set(auth(viewer)).expect(200);
    expect(list.body).toHaveLength(1);

    await request(server)
      .delete(`/api/spaces/${spaceId}/attachments/${attachmentId}`)
      .set(auth(grace))
      .expect(200);
    await request(server).get(fileUrl).expect(404);
  });

  it('searches titles and content with snippets', async () => {
    const mk = (title: string) =>
      request(server)
        .post(`/api/spaces/${spaceId}/nodes`)
        .set(auth(grace))
        .send({ type: 'DOC', title })
        .expect(201);
    const a = await mk('部署指南');
    const b = await mk('FAQ');

    // 给 FAQ 写入含关键词的内容
    await request(server).post(`/api/spaces/${spaceId}/docs/${b.body.id}/lock`).set(auth(grace)).expect(201);
    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${b.body.id}/content`)
      .set(auth(grace))
      .send({ content: `${'x'.repeat(200)}生产环境部署需要先配置数据库${'y'.repeat(200)}`, baseVersion: 0 })
      .expect(200);

    const res = await request(server)
      .get(`/api/spaces/${spaceId}/search`)
      .query({ q: '部署' })
      .set(auth(viewer))
      .expect(200);

    const titles = res.body.map((r: any) => r.title).sort();
    expect(titles).toEqual(['FAQ', '部署指南']);
    const faq = res.body.find((r: any) => r.title === 'FAQ');
    expect(faq.titleHit).toBe(false);
    expect(faq.snippet).toContain('生产环境部署');
    expect(faq.snippet.startsWith('…')).toBe(true);
    expect(faq.snippet.endsWith('…')).toBe(true);

    const hit = res.body.find((r: any) => r.title === '部署指南');
    expect(hit.nodeId).toBe(a.body.id);
    expect(hit.titleHit).toBe(true);

    // 空查询返回空数组
    const empty = await request(server)
      .get(`/api/spaces/${spaceId}/search`)
      .query({ q: '  ' })
      .set(auth(viewer))
      .expect(200);
    expect(empty.body).toEqual([]);
  });
});
