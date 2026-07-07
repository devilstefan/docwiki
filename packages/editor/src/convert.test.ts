import { describe, it, expect } from 'vitest';
import { markdownToTiptap, tiptapToMarkdown } from './convert';

/** 往返:Markdown → TipTap → Markdown */
const rt = (md: string) => tiptapToMarkdown(markdownToTiptap(md));

/**
 * 保真度以"往返幂等"衡量:rt 一次得到规范形式后,再次往返应完全不变。
 * 这证明转换层不会在支持的节点白名单上丢失或损坏信息。
 */
function expectStable(md: string) {
  const once = rt(md);
  const twice = rt(once);
  expect(twice).toBe(once);
  return once;
}

describe('markdown ⇄ tiptap round-trip fidelity', () => {
  it('headings', () => {
    const out = expectStable('# 一级\n\n## 二级\n\n### 三级');
    expect(out).toContain('# 一级');
    expect(out).toContain('### 三级');
  });

  it('inline marks: bold / italic / code / strike / link', () => {
    const out = expectStable('**粗** 与 *斜* 与 `代码` 与 ~~删除~~ 与 [链接](https://a.com)');
    expect(out).toContain('**粗**');
    expect(out).toContain('*斜*');
    expect(out).toContain('`代码`');
    expect(out).toContain('~~删除~~');
    expect(out).toContain('[链接](https://a.com)');
  });

  it('nested marks: bold containing code', () => {
    // remark 会把 **`x`** 解析为 strong>inlineCode
    const out = expectStable('**`docwiki`**');
    expect(out).toBe('**`docwiki`**\n');
  });

  it('nested bullet lists preserve structure', () => {
    const md = '- 一\n  - 一甲\n  - 一乙\n- 二';
    const out = expectStable(md);
    expect(out).toContain('- 一');
    expect(out).toContain('  - 一甲');
    expect(out).toContain('- 二');
  });

  it('ordered lists keep numbering', () => {
    const out = expectStable('1. 甲\n2. 乙\n3. 丙');
    expect(out).toContain('1. 甲');
    expect(out).toContain('3. 丙');
  });

  it('code blocks preserve language and body', () => {
    const md = '```ts\nconst a = 1;\nconst b = 2;\n```';
    const out = expectStable(md);
    expect(out).toContain('```ts');
    expect(out).toContain('const a = 1;');
    expect(out).toContain('const b = 2;');
  });

  it('blockquotes', () => {
    const out = expectStable('> 引用第一行\n> 引用第二行');
    expect(out).toContain('> 引用第一行');
  });

  it('GFM tables', () => {
    const md = '| 名称 | 类型 |\n| --- | --- |\n| slug | string |\n| age | number |';
    const out = expectStable(md);
    expect(out).toContain('| 名称 | 类型 |');
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| slug | string |');
  });

  it('images', () => {
    const out = expectStable('![架构图](/api/files/abc.png)');
    expect(out).toBe('![架构图](/api/files/abc.png)\n');
  });

  it('resolved wikilinks survive as [[docId|label]]', () => {
    const out = expectStable('参见 [[doc_abc123|部署文档]] 了解详情');
    expect(out).toContain('[[doc_abc123|部署文档]]');
  });

  it('dangling wikilinks survive as [[label]]', () => {
    const out = expectStable('待补充 [[未来文档]]');
    expect(out).toContain('[[未来文档]]');
  });

  it('wikilink node has correct attrs after parse', () => {
    const doc = markdownToTiptap('[[doc_x1|标题]] 和 [[悬空]]');
    const wikilinks: any[] = [];
    JSON.stringify(doc, (_k, v) => {
      if (v?.type === 'wikilink') wikilinks.push(v);
      return v;
    });
    expect(wikilinks).toHaveLength(2);
    expect(wikilinks[0].attrs).toEqual({ docId: 'doc_x1', label: '标题' });
    expect(wikilinks[1].attrs).toEqual({ docId: null, label: '悬空' });
  });

  it('mixed document with everything stays stable', () => {
    const md = [
      '# 项目说明',
      '',
      '这是 **重点**,参见 [[doc_readme|README]]。',
      '',
      '## 步骤',
      '',
      '1. 安装依赖',
      '2. 运行 `pnpm dev`',
      '',
      '| 环境 | 端口 |',
      '| --- | --- |',
      '| dev | 3000 |',
      '',
      '> 注意:先启动数据库',
      '',
      '```bash',
      'pnpm dev:db',
      '```',
    ].join('\n');
    const once = expectStable(md);
    // 关键元素都在
    expect(once).toContain('# 项目说明');
    expect(once).toContain('[[doc_readme|README]]');
    expect(once).toContain('| dev | 3000 |');
    expect(once).toContain('pnpm dev:db');
  });

  it('empty input yields an empty doc, not a crash', () => {
    expect(rt('')).toBe('\n');
    const doc = markdownToTiptap('');
    expect(doc.type).toBe('doc');
    expect(doc.content?.[0].type).toBe('paragraph');
  });
});
