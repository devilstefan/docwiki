import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { sortKeyBetween } from '@docwiki/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodeDto, MoveNodeDto, RenameNodeDto } from './dto/node.dto';

/** wikilink 以 doc_ 前缀识别已解析链接,Document id 统一带此前缀 */
export function newDocumentId() {
  return `doc_${randomBytes(12).toString('base64url')}`;
}

const NODE_SELECT = {
  id: true,
  parentId: true,
  type: true,
  title: true,
  path: true,
  sortKey: true,
  updatedAt: true,
  document: { select: { id: true } },
} as const;

@Injectable()
export class NodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量树(扁平返回,客户端按 parentId 组装),按 path + sortKey 稳定排序 */
  async list(spaceId: string) {
    return this.prisma.node.findMany({
      where: { spaceId, deletedAt: null },
      select: NODE_SELECT,
      orderBy: [{ path: 'asc' }, { sortKey: 'asc' }],
    });
  }

  async create(spaceId: string, dto: CreateNodeDto) {
    const parent = dto.parentId ? await this.mustGetFolder(spaceId, dto.parentId) : null;
    const path = parent ? `${parent.path}${parent.id}/` : '';
    const sortKey = await this.endSortKey(spaceId, dto.parentId ?? null);

    const node = await this.prisma.node.create({
      data: {
        spaceId,
        parentId: dto.parentId ?? null,
        type: dto.type,
        title: dto.title,
        path,
        sortKey,
        ...(dto.type === 'DOC' ? { document: { create: { id: newDocumentId() } } } : {}),
      },
      select: NODE_SELECT,
    });

    if (dto.type === 'DOC') {
      await this.resolveDanglingLinks(spaceId, dto.title, node.document!.id);
    }
    return node;
  }

  async rename(spaceId: string, nodeId: string, dto: RenameNodeDto) {
    const node = await this.mustGet(spaceId, nodeId);
    const updated = await this.prisma.node.update({
      where: { id: node.id },
      data: { title: dto.title },
      select: NODE_SELECT,
    });
    if (updated.type === 'DOC' && updated.document) {
      await this.resolveDanglingLinks(spaceId, dto.title, updated.document.id);
    }
    return updated;
  }

  async move(spaceId: string, nodeId: string, dto: MoveNodeDto) {
    const node = await this.mustGet(spaceId, nodeId);
    const parent = dto.parentId ? await this.mustGetFolder(spaceId, dto.parentId) : null;

    // 防环:目标父节点不能是自己或自己的后代
    const selfPrefix = `${node.path}${node.id}/`;
    if (parent && (parent.id === node.id || parent.path.startsWith(selfPrefix))) {
      throw new BadRequestException('cannot move a node into itself or its descendant');
    }

    const newPath = parent ? `${parent.path}${parent.id}/` : '';
    const sortKey = await this.sortKeyAt(spaceId, dto.parentId ?? null, dto.afterId, node.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.node.update({
        where: { id: node.id },
        data: { parentId: dto.parentId ?? null, path: newPath, sortKey },
      });
      // 后代 path 前缀整体替换
      const descendants = await tx.node.findMany({
        where: { spaceId, path: { startsWith: selfPrefix } },
        select: { id: true, path: true },
      });
      const newSelfPrefix = `${newPath}${node.id}/`;
      for (const d of descendants) {
        await tx.node.update({
          where: { id: d.id },
          data: { path: newSelfPrefix + d.path.slice(selfPrefix.length) },
        });
      }
    });
    return this.prisma.node.findUnique({ where: { id: node.id }, select: NODE_SELECT });
  }

  /** 软删除整棵子树进回收站 */
  async softDelete(spaceId: string, nodeId: string) {
    const node = await this.mustGet(spaceId, nodeId);
    const selfPrefix = `${node.path}${node.id}/`;
    const { count } = await this.prisma.node.updateMany({
      where: {
        spaceId,
        deletedAt: null,
        OR: [{ id: node.id }, { path: { startsWith: selfPrefix } }],
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: count };
  }

  /** 回收站:只列被删除子树的根(父节点存活或不存在) */
  async listTrash(spaceId: string) {
    return this.prisma.node.findMany({
      where: {
        spaceId,
        deletedAt: { not: null },
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      },
      select: { ...NODE_SELECT, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /** 恢复子树;父节点已不可用时恢复到根层级 */
  async restore(spaceId: string, nodeId: string) {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, spaceId, deletedAt: { not: null } },
      include: { parent: { select: { deletedAt: true } } },
    });
    if (!node) throw new NotFoundException('node not found in trash');

    const parentAlive = node.parentId && node.parent && !node.parent.deletedAt;
    const selfPrefix = `${node.path}${node.id}/`;

    await this.prisma.$transaction(async (tx) => {
      const sortKey = await this.endSortKey(spaceId, parentAlive ? node.parentId : null, tx);
      await tx.node.update({
        where: { id: node.id },
        data: {
          deletedAt: null,
          ...(parentAlive ? {} : { parentId: null, path: '' }),
          sortKey,
        },
      });
      const descendants = await tx.node.findMany({
        where: { spaceId, path: { startsWith: selfPrefix } },
        select: { id: true, path: true },
      });
      const newSelfPrefix = parentAlive ? selfPrefix : `${node.id}/`;
      for (const d of descendants) {
        await tx.node.update({
          where: { id: d.id },
          data: { deletedAt: null, path: newSelfPrefix + d.path.slice(selfPrefix.length) },
        });
      }
    });
    return this.prisma.node.findUnique({ where: { id: node.id }, select: NODE_SELECT });
  }

  // --- helpers ---

  private async mustGet(spaceId: string, nodeId: string) {
    const node = await this.prisma.node.findFirst({ where: { id: nodeId, spaceId, deletedAt: null } });
    if (!node) throw new NotFoundException('node not found');
    return node;
  }

  private async mustGetFolder(spaceId: string, nodeId: string) {
    const node = await this.mustGet(spaceId, nodeId);
    if (node.type !== 'FOLDER') throw new BadRequestException('parent must be a folder');
    return node;
  }

  /** 追加到兄弟末尾的排序键 */
  private async endSortKey(
    spaceId: string,
    parentId: string | null,
    tx: Pick<PrismaService, 'node'> = this.prisma,
  ) {
    const last = await tx.node.findFirst({
      where: { spaceId, parentId, deletedAt: null },
      orderBy: { sortKey: 'desc' },
      select: { sortKey: true },
    });
    return sortKeyBetween(last?.sortKey ?? null, null);
  }

  /** 按 afterId 语义计算插入位置的排序键(排除正在移动的节点自身) */
  private async sortKeyAt(
    spaceId: string,
    parentId: string | null,
    afterId: string | null | undefined,
    movingId: string,
  ) {
    const siblings = await this.prisma.node.findMany({
      where: { spaceId, parentId, deletedAt: null, id: { not: movingId } },
      orderBy: { sortKey: 'asc' },
      select: { id: true, sortKey: true },
    });
    if (afterId === undefined) {
      // 缺省追加到末尾
      return sortKeyBetween(siblings.at(-1)?.sortKey ?? null, null);
    }
    if (afterId === null) {
      return sortKeyBetween(null, siblings[0]?.sortKey ?? null);
    }
    const idx = siblings.findIndex((s) => s.id === afterId);
    if (idx === -1) throw new BadRequestException('afterId is not a sibling under the target parent');
    return sortKeyBetween(siblings[idx].sortKey, siblings[idx + 1]?.sortKey ?? null);
  }

  /** 新文档标题命中同空间悬空链接时自动回填解析 */
  private async resolveDanglingLinks(spaceId: string, title: string, documentId: string) {
    await this.prisma.docLink.updateMany({
      where: {
        targetDocId: null,
        targetTitle: title,
        source: { node: { spaceId } },
      },
      data: { targetDocId: documentId },
    });
  }
}
