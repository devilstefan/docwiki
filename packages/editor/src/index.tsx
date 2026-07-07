import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

/** wikilink 补全候选:知识库内的文档 */
export interface DocRef {
  documentId: string;
  title: string;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** [[ 自动补全候选列表 */
  docs?: DocRef[];
  /** 粘贴图片时上传,返回可引用 URL;不传则禁用粘贴上传 */
  onUploadImage?: (file: File) => Promise<string>;
  placeholder?: string;
  minHeight?: string;
}

/** 输入 [[ 后按文档标题模糊补全,选中插入 [[docId|标题]] */
function wikilinkCompletion(docs: DocRef[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\[\[([^\[\]]*)$/);
    if (!before) return null;
    const query = before.text.slice(2).toLowerCase();
    const options = docs
      .filter((d) => d.title.toLowerCase().includes(query))
      .slice(0, 20)
      .map((d) => ({
        label: d.title,
        detail: '文档',
        apply: `${d.documentId}|${d.title}]]`,
      }));
    if (!options.length) return null;
    return { from: before.from + 2, options, filter: false };
  };
}

/** 粘贴/拖入图片 → 上传 → 光标处插入 ![](url) */
function imageUploadHandler(onUploadImage: (file: File) => Promise<string>) {
  const insert = (view: EditorView, files: FileList) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    for (const file of images) {
      const pos = view.state.selection.main.head;
      const placeholder = `![上传中 ${file.name}…]()`;
      view.dispatch({ changes: { from: pos, insert: placeholder } });
      onUploadImage(file)
        .then((url) => {
          const current = view.state.doc.toString();
          const idx = current.indexOf(placeholder);
          if (idx === -1) return;
          view.dispatch({
            changes: { from: idx, to: idx + placeholder.length, insert: `![${file.name}](${url})` },
          });
        })
        .catch(() => {
          const current = view.state.doc.toString();
          const idx = current.indexOf(placeholder);
          if (idx !== -1) {
            view.dispatch({ changes: { from: idx, to: idx + placeholder.length, insert: '' } });
          }
        });
    }
    return true;
  };
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      if (event.clipboardData?.files.length) {
        event.preventDefault();
        return insert(view, event.clipboardData.files);
      }
      return false;
    },
    drop: (event, view) => {
      if (event.dataTransfer?.files.length) {
        event.preventDefault();
        return insert(view, event.dataTransfer.files);
      }
      return false;
    },
  });
}

export function MarkdownEditor({
  value,
  onChange,
  docs = [],
  onUploadImage,
  placeholder,
  minHeight = '480px',
}: MarkdownEditorProps) {
  const extensions = useMemo(() => {
    const exts = [
      markdown({ base: markdownLanguage }),
      autocompletion({ override: [wikilinkCompletion(docs)] }),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { fontSize: '14px' },
        '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight },
        '&.cm-focused': { outline: 'none' },
      }),
    ];
    if (onUploadImage) exts.push(imageUploadHandler(onUploadImage));
    return exts;
  }, [docs, onUploadImage, minHeight]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      placeholder={placeholder}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
    />
  );
}
