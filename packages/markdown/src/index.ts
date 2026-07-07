/**
 * Markdown 处理层:wikilink 解析、TipTap ⇄ Markdown 双向转换(后续接 remark 生态)。
 * 本包是全项目保真度风险最高的模块,所有转换必须有快照测试覆盖。
 */

/** 已解析链接:[[docId|显示标题]];悬空链接:[[标题]](尚无 docId) */
export interface Wikilink {
  /** 目标文档 id;悬空链接为 null */
  targetDocId: string | null;
  /** 显示文本(已解析链接)或目标标题(悬空链接) */
  label: string;
  /** 在源文本中的偏移,用于编辑器装饰渲染 */
  start: number;
  end: number;
}

const WIKILINK_RE = /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g;
/** 已解析链接的 id 形态:doc_ 前缀 + cuid/uuid 字符集 */
const DOC_ID_RE = /^doc_[A-Za-z0-9_-]+$/;

/** 提取文档中的全部 wikilink,DocLink 索引与图谱的数据来源 */
export function extractWikilinks(markdown: string): Wikilink[] {
  const links: Wikilink[] = [];
  for (const m of markdown.matchAll(WIKILINK_RE)) {
    const first = m[1].trim();
    const second = m[2]?.trim();
    const isResolved = DOC_ID_RE.test(first);
    links.push({
      targetDocId: isResolved ? first : null,
      label: isResolved ? (second ?? first) : first,
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return links;
}
