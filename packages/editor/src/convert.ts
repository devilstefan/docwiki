/**
 * Markdown ⇄ TipTap(ProseMirror JSON)双向转换。
 *
 * 这是全项目保真度风险最高的模块(见 DESIGN §6)。设计取舍:
 * - 正向(MD→TipTap)用 remark 解析,不自研 Markdown parser;
 * - 反向(TipTap→MD)手写序列化器,因为我们完全掌控 JSON 模型,输出格式可控;
 * - 仅支持"可无损映射"的节点白名单;wikilink 作为独立 inline 节点往返。
 *
 * 所有转换必须通过 convert.test.ts 的往返幂等测试。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const WIKILINK_RE = /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g;
const DOC_ID_RE = /^doc_[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// 正向:Markdown → TipTap JSON
// ---------------------------------------------------------------------------

export function markdownToTiptap(md: string): TiptapNode {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as any;
  const content = mapBlocks(tree.children ?? []);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function mapBlocks(nodes: any[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const n of nodes) {
    const mapped = mapBlock(n);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mapBlock(n: any): TiptapNode | null {
  switch (n.type) {
    case 'paragraph': {
      const content = mapInline(n.children ?? []);
      return { type: 'paragraph', ...(content.length ? { content } : {}) };
    }
    case 'heading':
      return { type: 'heading', attrs: { level: n.depth }, content: mapInline(n.children ?? []) };
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: n.lang ?? null },
        ...(n.value ? { content: [{ type: 'text', text: n.value }] } : {}),
      };
    case 'blockquote':
      return { type: 'blockquote', content: mapBlocks(n.children ?? []) };
    case 'list': {
      const type = n.ordered ? 'orderedList' : 'bulletList';
      const attrs = n.ordered ? { start: n.start ?? 1 } : {};
      return { type, attrs, content: (n.children ?? []).map(mapListItem) };
    }
    case 'thematicBreak':
      return { type: 'horizontalRule' };
    case 'table':
      return mapTable(n);
    default:
      // 未支持的块降级为纯文本段落,保证内容不丢
      return { type: 'paragraph', content: [{ type: 'text', text: rawText(n) }] };
  }
}

function mapListItem(n: any): TiptapNode {
  const blocks = mapBlocks(n.children ?? []);
  return { type: 'listItem', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
}

function mapTable(n: any): TiptapNode {
  const rows = (n.children ?? []).map((row: any, rowIdx: number) => ({
    type: 'tableRow',
    content: (row.children ?? []).map((cell: any) => ({
      type: rowIdx === 0 ? 'tableHeader' : 'tableCell',
      content: [{ type: 'paragraph', content: mapInline(cell.children ?? []) }],
    })),
  }));
  return { type: 'table', content: rows };
}

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

function mapInline(nodes: any[], marks: Mark[] = []): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out.push(...splitWikilinks(n.value ?? '', marks));
        break;
      case 'strong':
        out.push(...mapInline(n.children ?? [], addMark(marks, { type: 'bold' })));
        break;
      case 'emphasis':
        out.push(...mapInline(n.children ?? [], addMark(marks, { type: 'italic' })));
        break;
      case 'delete':
        out.push(...mapInline(n.children ?? [], addMark(marks, { type: 'strike' })));
        break;
      case 'inlineCode':
        out.push(textNode(n.value ?? '', addMark(marks, { type: 'code' })));
        break;
      case 'link':
        out.push(
          ...mapInline(n.children ?? [], addMark(marks, { type: 'link', attrs: { href: n.url ?? '' } })),
        );
        break;
      case 'image':
        out.push({ type: 'image', attrs: { src: n.url ?? '', alt: n.alt ?? null, title: n.title ?? null } });
        break;
      case 'break':
        out.push({ type: 'hardBreak' });
        break;
      default:
        out.push(...splitWikilinks(rawText(n), marks));
    }
  }
  return out;
}

/** 把纯文本按 [[...]] 拆成 text 与 wikilink 节点 */
function splitWikilinks(value: string, marks: Mark[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKILINK_RE)) {
    if (m.index > last) out.push(textNode(value.slice(last, m.index), marks));
    const first = m[1].trim();
    const second = m[2]?.trim();
    const resolved = DOC_ID_RE.test(first);
    out.push({
      type: 'wikilink',
      attrs: {
        docId: resolved ? first : null,
        label: resolved ? (second ?? first) : first,
      },
    });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push(textNode(value.slice(last), marks));
  return out;
}

function textNode(text: string, marks: Mark[]): TiptapNode {
  return { type: 'text', text, ...(marks.length ? { marks } : {}) };
}

function addMark(marks: Mark[], mark: Mark): Mark[] {
  if (marks.some((m) => m.type === mark.type)) return marks;
  return [...marks, mark];
}

function rawText(n: any): string {
  if (typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(rawText).join('');
  return '';
}

// ---------------------------------------------------------------------------
// 反向:TipTap JSON → Markdown
// ---------------------------------------------------------------------------

export function tiptapToMarkdown(doc: TiptapNode): string {
  return blocksToMarkdown(doc.content ?? []).trim() + '\n';
}

function blocksToMarkdown(nodes: TiptapNode[]): string {
  return nodes.map(blockToMarkdown).join('\n\n');
}

function blockToMarkdown(n: TiptapNode): string {
  switch (n.type) {
    case 'paragraph':
      return inlineToMarkdown(n.content ?? []);
    case 'heading':
      return '#'.repeat(Number(n.attrs?.level ?? 1)) + ' ' + inlineToMarkdown(n.content ?? []);
    case 'codeBlock': {
      const lang = (n.attrs?.language as string) ?? '';
      const text = (n.content ?? []).map((c) => c.text ?? '').join('');
      return '```' + lang + '\n' + text + '\n```';
    }
    case 'blockquote':
      return prefixLines(blocksToMarkdown(n.content ?? []), '> ');
    case 'bulletList':
      return listToMarkdown(n.content ?? [], false, 1);
    case 'orderedList':
      return listToMarkdown(n.content ?? [], true, Number(n.attrs?.start ?? 1));
    case 'horizontalRule':
      return '---';
    case 'table':
      return tableToMarkdown(n);
    case 'image':
      return imageToMarkdown(n);
    default:
      return inlineToMarkdown(n.content ?? []);
  }
}

function listToMarkdown(items: TiptapNode[], ordered: boolean, start: number): string {
  return items
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- ';
      const pad = ' '.repeat(marker.length);
      const blocks = item.content ?? [];
      // 首块跟在 marker 后;后续块(含嵌套列表)按 marker 宽度缩进
      const rendered = blocks.map(blockToMarkdown);
      const lines: string[] = [];
      rendered.forEach((md, idx) => {
        const mdLines = md.split('\n');
        mdLines.forEach((line, li) => {
          if (idx === 0 && li === 0) lines.push(marker + line);
          else lines.push(line ? pad + line : '');
        });
      });
      return lines.join('\n');
    })
    .join('\n');
}

function tableToMarkdown(n: TiptapNode): string {
  const rows = n.content ?? [];
  if (!rows.length) return '';
  const cellText = (cell: TiptapNode) => inlineToMarkdown(cell.content?.[0]?.content ?? []);
  const header = (rows[0].content ?? []).map(cellText);
  const sep = header.map(() => '---');
  const body = rows.slice(1).map((row) => (row.content ?? []).map(cellText));
  const line = (cells: string[]) => '| ' + cells.join(' | ') + ' |';
  return [line(header), line(sep), ...body.map(line)].join('\n');
}

function imageToMarkdown(n: TiptapNode): string {
  const { src = '', alt } = (n.attrs ?? {}) as { src?: string; alt?: string | null };
  return `![${alt ?? ''}](${src})`;
}

function inlineToMarkdown(nodes: TiptapNode[]): string {
  return nodes.map(inlineNodeToMarkdown).join('');
}

function inlineNodeToMarkdown(n: TiptapNode): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') return imageToMarkdown(n);
  if (n.type === 'wikilink') {
    const docId = n.attrs?.docId as string | null;
    const label = (n.attrs?.label as string) ?? '';
    return docId ? `[[${docId}|${label}]]` : `[[${label}]]`;
  }
  if (n.type === 'text') return applyMarks(n.text ?? '', n.marks ?? []);
  return '';
}

/** 标记从内到外:code → bold → italic → strike → link */
function applyMarks(text: string, marks: { type: string; attrs?: Record<string, unknown> }[]): string {
  let s = text;
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has('code')) s = '`' + s + '`';
  if (has('bold')) s = '**' + s + '**';
  if (has('italic')) s = '*' + s + '*';
  if (has('strike')) s = '~~' + s + '~~';
  const link = marks.find((m) => m.type === 'link');
  if (link) s = `[${s}](${(link.attrs?.href as string) ?? ''})`;
  return s;
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((l) => (l ? prefix + l : prefix.trimEnd()))
    .join('\n');
}
