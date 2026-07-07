import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Space as AntSpace, Spin, Tag, Typography, message } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined, HistoryOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import type { DocPayload } from '../api/types';

const HEARTBEAT_MS = 30_000;

/** 渲染前把 [[doc_xxx|标题]] / [[标题]] 转成可读样式(导航待 M2) */
function renderWikilinks(md: string) {
  return md.replace(/\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g, (_m, first, second) => {
    const label = second ?? (first.startsWith('doc_') ? '未知文档' : first);
    return `[🔗 ${label}](#wikilink)`;
  });
}

export default function DocPage() {
  const { spaceId, nodeId } = useParams() as { spaceId: string; nodeId: string };
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const baseVersion = useRef(0);
  const heartbeat = useRef<ReturnType<typeof setInterval>>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['doc', spaceId, nodeId],
    queryFn: () => api<DocPayload>('GET', `/spaces/${spaceId}/docs/${nodeId}`),
  });

  // 切换文档时退出编辑态并释放锁
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
      if (err.status === 423) {
        message.warning(`「${err.body?.holder ?? '他人'}」正在编辑该文档`);
        return;
      }
      message.error(err.body?.message ?? '获取编辑锁失败');
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
    } catch (err: any) {
      if (err.status === 409) {
        message.error(`文档已被改到 v${err.body?.currentVersion},请复制内容后刷新`);
      } else if (err.status === 423) {
        message.error('编辑锁已失效,请重新进入编辑');
      } else {
        message.error(err.body?.message ?? '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !doc) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const lockedByOther = doc.lock && doc.lock.holder !== undefined && !editing;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 32px' }}>
      {editing ? (
        <>
          <AntSpace style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ fontSize: 22, fontWeight: 600, width: 480 }}
            />
            <AntSpace>
              <Button icon={<CloseOutlined />} onClick={() => stopEditing()}>
                取消
              </Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                保存
              </Button>
            </AntSpace>
          </AntSpace>
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoSize={{ minRows: 20 }}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 14 }}
            placeholder="支持 Markdown 与 [[双向链接]] 语法"
          />
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
          {lockedByOther && (
            <Alert type="warning" showIcon message={`「${doc.lock!.holder}」正在编辑该文档`} style={{ marginBottom: 12 }} />
          )}
          <div className="markdown-body">
            {doc.document.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderWikilinks(doc.document.content)}</ReactMarkdown>
            ) : (
              <Typography.Text type="secondary">空文档,点击右上角开始编辑</Typography.Text>
            )}
          </div>
        </>
      )}
    </div>
  );
}
