import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SNIPPET_RADIUS = 60;
const MAX_RESULTS = 20;

/**
 * M1 搜索:标题/内容 ILIKE 子串匹配(中文无需分词即可用)。
 * 升级路径:PG tsvector + pg_jieba,或 Meilisearch 驱动(见 DESIGN M2)。
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(spaceId: string, query: string) {
    const q = query.trim();
    if (!q) return [];

    const nodes = await this.prisma.node.findMany({
      where: {
        spaceId,
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { document: { is: { content: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      select: {
        id: true,
        type: true,
        title: true,
        document: { select: { content: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_RESULTS,
    });

    return nodes.map((n) => ({
      nodeId: n.id,
      type: n.type,
      title: n.title,
      titleHit: n.title.toLowerCase().includes(q.toLowerCase()),
      snippet: n.document ? this.snippet(n.document.content, q) : null,
      updatedAt: n.updatedAt,
    }));
  }

  private snippet(content: string, q: string): string | null {
    const idx = content.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return null;
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(content.length, idx + q.length + SNIPPET_RADIUS);
    return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
  }
}
