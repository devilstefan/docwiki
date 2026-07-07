import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './db-clean';

describe('DocWiki e2e: node tree + documents', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let dave: string; // OWNER
  let erin: string; // EDITOR
  let spaceId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(email: string, name: string) {
    const res = await request(server)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name })
      .expect(201);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
    await cleanDatabase(app.get(PrismaService));

    dave = await register('dave@example.com', 'Dave');
    erin = await register('erin@example.com', 'Erin');
    const space = await request(server)
      .post('/api/spaces')
      .set(auth(dave))
      .send({ name: 'tree-test', slug: 'tree-test' })
      .expect(201);
    spaceId = space.body.id;
    await request(server)
      .post(`/api/spaces/${spaceId}/members`)
      .set(auth(dave))
      .send({ email: 'erin@example.com', role: 'EDITOR' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  let folderA: string;
  let docB: string;
  let docC: string;
  let docCDocumentId: string;

  it('creates folders and docs; DOC nodes get a doc_-prefixed document', async () => {
    const a = await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(dave))
      .send({ type: 'FOLDER', title: '目录A' })
      .expect(201);
    folderA = a.body.id;
    expect(a.body.document).toBeNull();

    const b = await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(dave))
      .send({ type: 'DOC', title: '文档B' })
      .expect(201);
    docB = b.body.id;
    expect(b.body.document.id).toMatch(/^doc_/);

    const c = await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(erin))
      .send({ type: 'DOC', title: '文档C', parentId: folderA })
      .expect(201);
    docC = c.body.id;
    docCDocumentId = c.body.document.id;
    expect(c.body.path).toBe(`${folderA}/`);

    // 不能把节点挂到 DOC 下
    await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(dave))
      .send({ type: 'DOC', title: 'x', parentId: docB })
      .expect(400);
  });

  it('reorders siblings with afterId semantics', async () => {
    // 根层级顺序:目录A, 文档B → 把文档B移到最前
    await request(server)
      .post(`/api/spaces/${spaceId}/nodes/${docB}/move`)
      .set(auth(dave))
      .send({ parentId: null, afterId: null })
      .expect(201);

    const tree = await request(server).get(`/api/spaces/${spaceId}/nodes`).set(auth(dave)).expect(200);
    const roots = tree.body.filter((n: any) => n.parentId === null);
    expect(roots.map((n: any) => n.title)).toEqual(['文档B', '目录A']);
  });

  it('moves subtree and rewrites descendant paths; rejects cycles', async () => {
    // 建 目录A/目录D,把 文档C 移入 目录D,再把 目录A 移到根验证 path
    const d = await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(dave))
      .send({ type: 'FOLDER', title: '目录D', parentId: folderA })
      .expect(201);
    const folderD = d.body.id;

    await request(server)
      .post(`/api/spaces/${spaceId}/nodes/${docC}/move`)
      .set(auth(dave))
      .send({ parentId: folderD })
      .expect(201);

    const tree = await request(server).get(`/api/spaces/${spaceId}/nodes`).set(auth(dave)).expect(200);
    const c = tree.body.find((n: any) => n.id === docC);
    expect(c.path).toBe(`${folderA}/${folderD}/`);

    // 防环:目录A 不能移到其后代 目录D 下
    await request(server)
      .post(`/api/spaces/${spaceId}/nodes/${folderA}/move`)
      .set(auth(dave))
      .send({ parentId: folderD })
      .expect(400);
  });

  it('save requires edit lock; lock conflicts return 423', async () => {
    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${docB}/content`)
      .set(auth(dave))
      .send({ content: 'hello', baseVersion: 0 })
      .expect(423);

    await request(server).post(`/api/spaces/${spaceId}/docs/${docB}/lock`).set(auth(dave)).expect(201);

    // 他人抢锁 → 423 并返回持锁人
    const conflict = await request(server)
      .post(`/api/spaces/${spaceId}/docs/${docB}/lock`)
      .set(auth(erin))
      .expect(423);
    expect(conflict.body.holder).toBe('Dave');

    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${docB}/content`)
      .set(auth(dave))
      .send({ content: '# 文档B\n\n第一版', baseVersion: 0 })
      .expect(200);
  });

  it('optimistic version check rejects stale saves', async () => {
    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${docB}/content`)
      .set(auth(dave))
      .send({ content: '基于过期版本的写入', baseVersion: 0 })
      .expect(409);

    const doc = await request(server).get(`/api/spaces/${spaceId}/docs/${docB}`).set(auth(dave)).expect(200);
    expect(doc.body.document.version).toBe(1);
    expect(doc.body.document.content).toBe('# 文档B\n\n第一版');
    expect(doc.body.lock.holder).toBe('Dave');
  });

  it('wikilinks build backlinks; dangling links resolve when the doc is created', async () => {
    // 文档B 引用 文档C(已解析)和 [[未来文档]](悬空)
    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${docB}/content`)
      .set(auth(dave))
      .send({ content: `参见 [[${docCDocumentId}|文档C]] 与 [[未来文档]]`, baseVersion: 1 })
      .expect(200);

    const backlinksC = await request(server)
      .get(`/api/spaces/${spaceId}/docs/${docC}/backlinks`)
      .set(auth(dave))
      .expect(200);
    expect(backlinksC.body).toEqual([expect.objectContaining({ nodeId: docB, title: '文档B' })]);

    // 创建同名文档,悬空链接自动解析
    const future = await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(dave))
      .send({ type: 'DOC', title: '未来文档' })
      .expect(201);
    const backlinksFuture = await request(server)
      .get(`/api/spaces/${spaceId}/docs/${future.body.id}/backlinks`)
      .set(auth(dave))
      .expect(200);
    expect(backlinksFuture.body).toEqual([expect.objectContaining({ nodeId: docB })]);
  });

  it('lists revisions and restores an old version as a new head', async () => {
    const revisions = await request(server)
      .get(`/api/spaces/${spaceId}/docs/${docB}/revisions`)
      .set(auth(dave))
      .expect(200);
    expect(revisions.body.map((r: any) => r.version)).toEqual([2, 1]);
    expect(revisions.body[0].author.name).toBe('Dave');

    const restored = await request(server)
      .post(`/api/spaces/${spaceId}/docs/${docB}/revisions/1/restore`)
      .set(auth(dave))
      .expect(201);
    expect(restored.body).toEqual({ version: 3, restoredFrom: 1 });

    const doc = await request(server).get(`/api/spaces/${spaceId}/docs/${docB}`).set(auth(dave)).expect(200);
    expect(doc.body.document.content).toBe('# 文档B\n\n第一版');
    // 回滚到无链接版本后,反链索引同步清空
    const backlinksC = await request(server)
      .get(`/api/spaces/${spaceId}/docs/${docC}/backlinks`)
      .set(auth(dave))
      .expect(200);
    expect(backlinksC.body).toEqual([]);
  });

  it('soft-deletes a subtree into trash and restores it', async () => {
    await request(server).delete(`/api/spaces/${spaceId}/nodes/${folderA}`).set(auth(dave)).expect(200);

    const tree = await request(server).get(`/api/spaces/${spaceId}/nodes`).set(auth(dave)).expect(200);
    expect(tree.body.find((n: any) => n.id === folderA)).toBeUndefined();
    expect(tree.body.find((n: any) => n.id === docC)).toBeUndefined();

    // 已删除文档不可读
    await request(server).get(`/api/spaces/${spaceId}/docs/${docC}`).set(auth(dave)).expect(404);

    const trash = await request(server).get(`/api/spaces/${spaceId}/trash`).set(auth(dave)).expect(200);
    expect(trash.body.map((n: any) => n.id)).toEqual([folderA]); // 只列子树根

    await request(server).post(`/api/spaces/${spaceId}/nodes/${folderA}/restore`).set(auth(dave)).expect(201);
    const restored = await request(server).get(`/api/spaces/${spaceId}/nodes`).set(auth(dave)).expect(200);
    expect(restored.body.find((n: any) => n.id === docC)).toBeDefined();
  });

  it('VIEWER cannot mutate the tree', async () => {
    const frank = await register('frank@example.com', 'Frank');
    await request(server)
      .post(`/api/spaces/${spaceId}/members`)
      .set(auth(dave))
      .send({ email: 'frank@example.com', role: 'VIEWER' })
      .expect(201);

    await request(server).get(`/api/spaces/${spaceId}/nodes`).set(auth(frank)).expect(200);
    await request(server)
      .post(`/api/spaces/${spaceId}/nodes`)
      .set(auth(frank))
      .send({ type: 'DOC', title: 'nope' })
      .expect(403);
    await request(server)
      .put(`/api/spaces/${spaceId}/docs/${docB}/content`)
      .set(auth(frank))
      .send({ content: 'nope', baseVersion: 3 })
      .expect(403);
  });
});
