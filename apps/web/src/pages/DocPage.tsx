import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Input,
  List,
  Segmented,
  Space as AntSpace,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined, HistoryOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownEditor } from '@docwiki/editor';
import { api, uploadFile } from '../api/client';
import type { DocPayload, TreeNode } from '../api/types';

const HEARTBEAT_MS = 30_000;
const WIKILINK_RE = /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g;

interface Backlink {
  nodeId: string;
  title: string;
}

/** [[doc_x|标题]] → 可点击链接;[[标题]](悬空)→ 虚线样式 */
function wikilinksToMarkdown(md: string) {
  return md.replace(WIKILINK_RE, (_m, first: string, second?: string) => {
    if (first.startsWith('doc_')) return `[${second ?? '文档'}](#wikilink:${first})`;
    return `[${first}](#wikilink-dangling)`;
  });
}

export default function DocPage() {
  const { spaceId, nodeId } = useParams() as { spaceId: string; nodeId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editView, setEditView] = useState<'编辑' | '分栏'>('编辑');
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const baseVersion = useRef(0);
  const heartbeat = useRef<ReturnType<typeof setInterval>>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['doc', spaceId, nodeId],
    queryFn: () => api<DocPayload>('GET', `/spaces/${spaceId}/docs/${nodeId}`),
  });
  const { data: nodes = [] } = useQuery({
    queryKey: ['nodes', spaceId],
    queryFn: () => api<TreeNode[]>('GET', `/spaces/${spaceId}/nodes`),
  });
  const { data: backlinks = [] } = useQuery({
    queryKey: ['backlinks', spaceId, nodeId],
    queryFn: () => api<Backlink[]>('GET', `/spaces/${spaceId}/docs/${nodeId}/backlinks`),
  });

  /** documentId → nodeId,wikilink 导航与补全共用 */
  const docIndex = useMemo(() => {
    const map = new Map<string, TreeNode>();
    for (const n of nodes) if (n.document) map.set(n.document.id, n);
    return map;
  }, [nodes]);
  const completionDocs = useMemo(
    () =>
      nodes
        .filter((n) => n.document && n.id !== nodeId)
        .map((n) => ({ documentId: n.document!.id, title: n.title })),
    [nodes, nodeId],
  );

  useEffect(() => {
    return () => stopEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  function stopEditing(releaseLock = true) {
    setEditing(false);
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
    if (releaseLock) {
      api('DELETE', `/spaces/${spaceId}/docs/${nodeId}/lock`).catch(() => {});
    }
  }

  async function startEditing() {
    if (!doc) return;
    try {
      await api('POST', `/spaces/${spaceId}/docs/${nodeId}/lock`);
    } catch (err: any) {
      if (err.status === 423) message.warning(`「${err.body?.holder ?? '他人'}」正在编辑该文档`);
      else message.error(err.body?.message ?? '获取编辑锁失败');
      return;
    }
    setDraft(doc.document.content);
    setTitle(doc.node.title);
    baseVersion.current = doc.document.version;
    setEditing(true);
    heartbeat.current = setInterval(() => {
      api('POST', `/spaces/${spaceId}/docs/${nodeId}/lock`).catch(() => {});
    }, HEARTBEAT_MS);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ version: number }>('PUT', `/spaces/${spaceId}/docs/${nodeId}/content`, {
        content: draft,
        title: title.trim() || undefined,
        baseVersion: baseVersion.current,
      });
      baseVersion.current = res.version;
      message.success(`已保存(v${res.version})`);
      stopEditing();
      queryClient.invalidateQueries({ queryKey: ['doc', spaceId, nodeId] });
      queryClient.invalidateQueries({ queryKey: ['nodes', spaceId] });
      queryClient.invalidateQueries({ queryKey: ['backlinks'] });
    } catch (err: any) {
      if (err.status === 409) message.error(`文档已被改到 v${err.body?.currentVersion},请复制内容后刷新`);
      else if (err.status === 423) message.error('编辑锁已失效,请重新进入编辑');
      else message.error(err.body?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function renderMarkdown(content: string) {
    return (
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children, ...rest }) => {
              if (href?.startsWith('#wikilink:')) {
                const target = docIndex.get(href.slice('#wikilink:'.length));
                return (
                  <a
                    href={href}
                    className="wikilink"
                    onClick={(e) => {
                      e.preventDefault();
                      if (target) navigate(`/s/${spaceId}/d/${target.id}`);
                      else message.info('目标文档不存在或已删除');
                    }}
                  >
                    <LinkOutlined /> {children}
                  </a>
                );
              }
              if (href === '#wikilink-dangling') {
                return (
                  <a
                    href={href}
                    className="wikilink wikilink-dangling"
                    onClick={(e) => {
                      e.preventDefault();
                      message.info('该文档尚未创建,在左侧新建同名文档即可自动关联');
                    }}
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" {...rest}>
                  {children}
                </a>
              );
            },
          }}
        >
          {wikilinksToMarkdown(content)}
        </ReactMarkdown>
      </div>
    );
  }

  if (isLoading || !doc) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  return (
    <div style={{ maxWidth: editing && editView === '分栏' ? 1280 : 860, margin: '0 auto', padding: '24px 32px' }}>
      {editing ? (
        <>
          <AntSpace style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ fontSize: 22, fontWeight: 600, width: 420 }}
            />
            <AntSpace>
              <Segmented options={['编辑', '分栏']} value={editView} onChange={(v) => setEditView(v as any)} />
              <Button icon={<CloseOutlined />} onClick={() => stopEditing()}>
                取消
              </Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                保存
              </Button>
            </AntSpace>
          </AntSpace>
          <div
            style={
              editView === '分栏'
                ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }
                : undefined
            }
          >
            <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                docs={completionDocs}
                onUploadImage={(file) => uploadFile(spaceId, file).then((r) => r.url)}
                placeholder="支持 Markdown;输入 [[ 引用其他文档;粘贴图片自动上传"
              />
            </div>
            {editView === '分栏' && (
              <div style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: 24, minWidth: 0 }}>
                {renderMarkdown(draft)}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <AntSpace style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {doc.node.title}
            </Typography.Title>
            <AntSpace>
              <Tag icon={<HistoryOutlined />}>v{doc.document.version}</Tag>
              <Button type="primary" icon={<EditOutlined />} onClick={startEditing}>
                编辑
              </Button>
            </AntSpace>
          </AntSpace>
          {doc.lock && (
            <Alert
              type="warning"
              showIcon
              message={`「${doc.lock.holder}」正在编辑该文档`}
              style={{ marginBottom: 12 }}
            />
          )}
          {doc.document.content ? (
            renderMarkdown(doc.document.content)
          ) : (
            <Typography.Text type="secondary">空文档,点击右上角开始编辑</Typography.Text>
          )}
          {backlinks.length > 0 && (
            <>
              <Divider plain style={{ marginTop: 48 }}>
                <LinkOutlined /> 反向链接({backlinks.length})
              </Divider>
              <List
                size="small"
                dataSource={backlinks}
                renderItem={(b) => (
                  <List.Item
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/s/${spaceId}/d/${b.nodeId}`)}
                  >
                    <Typography.Link>{b.title}</Typography.Link>
                  </List.Item>
                )}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
