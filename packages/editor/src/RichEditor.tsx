import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Wikilink } from './wikilink-node';
import { markdownToTiptap, tiptapToMarkdown, type TiptapNode } from './convert';

export interface RichEditorProps {
  /** 初始 Markdown;组件以此为起点,变更通过 onChange 以 Markdown 抛出 */
  value: string;
  onChange: (markdown: string) => void;
}

/**
 * TipTap 所见即所得编辑器。内容真源始终是 Markdown:
 * 挂载时 markdownToTiptap(value) 转入,每次编辑 tiptapToMarkdown 转出。
 * 挂载后不再从 value 反向同步,避免编辑光标抖动(切换模式即重新挂载)。
 */
export function RichEditor({ value, onChange }: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({ inline: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Wikilink,
    ],
    content: markdownToTiptap(value) as unknown as Record<string, unknown>,
    onUpdate: ({ editor }) => {
      onChange(tiptapToMarkdown(editor.getJSON() as TiptapNode));
    },
  });

  return <EditorContent editor={editor} className="tiptap-editor" />;
}
