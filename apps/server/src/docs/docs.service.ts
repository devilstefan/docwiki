import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EDIT_LOCK_TTL_MS } from '@docwiki/shared';
import { extractWikilinks } from '@docwiki/markdown';
import { PrismaService } from '../prisma/prisma.service';
import { SaveContentDto } from './dto/doc.dto';
import type { AuthUser } from '../auth/current-user.decorator';

const HTTP_LOCKED = 423;
const LOCK_HOLDER_SELECT = { user: { select: { id: true, name: true, email: true } } } as const;

@Injectable()
export class DocsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(spaceId: string, nodeId: string) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const [latest, lock] = await Promise.all([
      this.latestRevision(node.document!.id),
      this.activeLock(node.document!.id),
    ]);
    return {
      node: { id: node.id, title: node.title, parentId: node.parentId, updatedAt: node.updatedAt },
      document: {
        id: node.document!.id,
        content: node.document!.content,
        version: latest?.version ?? 0,
      },
      lock: lock && { userId: lock.userId, holder: lock.user.name, expiresAt: lock.expiresAt },
    };
  }

  /** 获取或续期编辑锁;他人持有未过期锁时返回 423 */
  async acquireLock(spaceId: string, nodeId: string, user: AuthUser) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const documentId = node.document!.id;
    const expiresAt = new Date(Date.now() + EDIT_LOCK_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.editLock.findUnique({
        where: { documentId },
        include: LOCK_HOLDER_SELECT,
      });
      if (existing && existing.userId !== user.id && existing.expiresAt > new Date()) {
        throw new HttpException(
          { message: 'document is being edited', holder: existing.user.name, expiresAt: existing.expiresAt },
          HTTP_LOCKED,
        );
      }
      return tx.editLock.upsert({
        where: { documentId },
        create: { documentId, userId: user.id, expiresAt },
        update: { userId: user.id, acquiredAt: new Date(), expiresAt },
        include: LOCK_HOLDER_SELECT,
      });
    });
  }

  async releaseLock(spaceId: string, nodeId: string, user: AuthUser) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const lock = await this.prisma.editLock.findUnique({ where: { documentId: node.document!.id } });
    if (!lock) return { released: true };
    // 平台管理员可强制解锁
    if (lock.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('lock is held by another user');
    }
    await this.prisma.editLock.delete({ where: { documentId: lock.documentId } });
    return { released: true };
  }

  /**
   * 保存内容:要求持有未过期编辑锁 + baseVersion 乐观校验;
   * 产生新 Revision、重建 DocLink 出链、顺带续期锁。
   */
  async saveContent(spaceId: string, nodeId: string, user: AuthUser, dto: SaveContentDto) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const documentId = node.document!.id;

    const lock = await this.activeLock(documentId);
    if (!lock || lock.userId !== user.id) {
      throw new HttpException(
        { message: 'acquire the edit lock before saving', holder: lock?.user.name ?? null },
        HTTP_LOCKED,
      );
    }

    const title = dto.title ?? node.title;
    const saved = await this.prisma.$transaction(async (tx) => {
      const latest = await this.latestRevision(documentId, tx);
      const currentVersion = latest?.version ?? 0;
      if (dto.baseVersion !== currentVersion) {
        throw new ConflictException({
          message: 'document changed since you loaded it',
          currentVersion,
          baseVersion: dto.baseVersion,
        });
      }

      const revision = await tx.revision.create({
        data: {
          documentId,
          version: currentVersion + 1,
          title,
          content: dto.content,
          authorId: user.id,
          actorType: 'USER',
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { content: dto.content, headRevisionId: revision.id },
      });
      if (dto.title && dto.title !== node.title) {
        await tx.node.update({ where: { id: node.id }, data: { title: dto.title } });
      }
      await this.rebuildLinks(tx, spaceId, documentId, dto.content);
      await tx.editLock.update({
        where: { documentId },
        data: { expiresAt: new Date(Date.now() + EDIT_LOCK_TTL_MS) },
      });
      return revision;
    });

    return { version: saved.version, savedAt: saved.createdAt };
  }

  async listRevisions(spaceId: string, nodeId: string) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    return this.prisma.revision.findMany({
      where: { documentId: node.document!.id },
      select: {
        version: true,
        title: true,
        actorType: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { version: 'desc' },
    });
  }

  async getRevision(spaceId: string, nodeId: string, version: number) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const revision = await this.prisma.revision.findUnique({
      where: { documentId_version: { documentId: node.document!.id, version } },
      include: { author: { select: { id: true, name: true } } },
    });
    if (!revision) throw new NotFoundException('revision not found');
    return revision;
  }

  /** 回滚 = 用旧版本内容产生一个新的头版本,历史不可变 */
  async restoreRevision(spaceId: string, nodeId: string, version: number, user: AuthUser) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const documentId = node.document!.id;

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.revision.findUnique({
        where: { documentId_version: { documentId, version } },
      });
      if (!target) throw new NotFoundException('revision not found');
      const latest = await this.latestRevision(documentId, tx);

      const revision = await tx.revision.create({
        data: {
          documentId,
          version: (latest?.version ?? 0) + 1,
          title: target.title,
          content: target.content,
          authorId: user.id,
          actorType: 'USER',
        },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { content: target.content, headRevisionId: revision.id },
      });
      await tx.node.update({ where: { id: node.id }, data: { title: target.title } });
      await this.rebuildLinks(tx, spaceId, documentId, target.content);
      return { version: revision.version, restoredFrom: version };
    });
  }

  /** 反向链接:引用了本文档的同空间文档 */
  async backlinks(spaceId: string, nodeId: string) {
    const node = await this.mustGetDocNode(spaceId, nodeId);
    const links = await this.prisma.docLink.findMany({
      where: { targetDocId: node.document!.id, source: { node: { spaceId, deletedAt: null } } },
      include: { source: { include: { node: { select: { id: true, title: true } } } } },
    });
    return links.map((l) => ({ nodeId: l.source.node.id, title: l.source.node.title, documentId: l.sourceDocId }));
  }

  // --- helpers ---

  private async mustGetDocNode(spaceId: string, nodeId: string) {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, spaceId, type: 'DOC', deletedAt: null },
      include: { document: true },
    });
    if (!node?.document) throw new NotFoundException('document not found');
    return node;
  }

  private latestRevision(documentId: string, tx: Pick<PrismaService, 'revision'> = this.prisma) {
    return tx.revision.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { version: true, id: true },
    });
  }

  private async activeLock(documentId: string) {
    const lock = await this.prisma.editLock.findUnique({
      where: { documentId },
      include: LOCK_HOLDER_SELECT,
    });
    return lock && lock.expiresAt > new Date() ? lock : null;
  }

  /** 解析 wikilink 重建本文档出链;已解析 id 校验必须是同空间存活文档 */
  private async rebuildLinks(
    tx: Pick<PrismaService, 'docLink' | 'document'>,
    spaceId: string,
    sourceDocId: string,
    content: string,
  ) {
    const links = extractWikilinks(content);
    const resolvedIds = [...new Set(links.filter((l) => l.targetDocId).map((l) => l.targetDocId!))];
    const valid = resolvedIds.length
      ? await tx.document.findMany({
          where: { id: { in: resolvedIds }, node: { spaceId, deletedAt: null } },
          select: { id: true },
        })
      : [];
    const validIds = new Set(valid.map((d) => d.id));

    const rows = new Map<string, { targetDocId: string | null; targetTitle: string | null }>();
    for (const l of links) {
      if (l.targetDocId && !validIds.has(l.targetDocId)) continue; // 跨空间/失效 id 不入索引
      if (l.targetDocId === sourceDocId) continue; // 自引用不入索引
      const key = l.targetDocId ?? `title:${l.label}`;
      rows.set(key, { targetDocId: l.targetDocId, targetTitle: l.targetDocId ? null : l.label });
    }

    await tx.docLink.deleteMany({ where: { sourceDocId } });
    if (rows.size) {
      await tx.docLink.createMany({ data: [...rows.values()].map((r) => ({ sourceDocId, ...r })) });
    }
  }
}
