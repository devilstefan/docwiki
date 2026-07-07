import { Node, mergeAttributes } from '@tiptap/core';

/**
 * 自定义 inline atom 节点,承载 [[docId|label]] 双向链接。
 * 渲染为不可拆分的胶囊;编辑 label 请在源码模式进行(spike 阶段取舍)。
 */
export const Wikilink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      docId: { default: null },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        'data-doc-id': node.attrs.docId ?? '',
        class: node.attrs.docId ? 'tiptap-wikilink' : 'tiptap-wikilink tiptap-wikilink-dangling',
      }),
      `🔗 ${node.attrs.label}`,
    ];
  },
});
