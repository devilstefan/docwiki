import { useState } from 'react';
import { Button, Input, Layout, List, Modal, Typography } from 'antd';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SearchHit, Space } from '../api/types';
import DocTree from '../components/DocTree';

export default function SpacePage() {
  const { spaceId } = useParams() as { spaceId: string };
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: space } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: () => api<Space>('GET', `/spaces/${spaceId}`),
  });
  const { data: hits = [] } = useQuery({
    queryKey: ['search', spaceId, query],
    queryFn: () => api<SearchHit[]>('GET', `/spaces/${spaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: searchOpen && query.trim().length > 0,
  });

  const canEdit = !!space?.myRole && ['OWNER', 'ADMIN', 'EDITOR'].includes(space.myRole);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="light" width={280} style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} />
          <Typography.Text strong ellipsis style={{ flex: 1 }}>
            {space?.name ?? '…'}
          </Typography.Text>
          <Button type="text" size="small" icon={<SearchOutlined />} onClick={() => setSearchOpen(true)} />
        </div>
        <DocTree spaceId={spaceId} canEdit={canEdit} />
      </Layout.Sider>
      <Layout.Content style={{ background: '#fff' }}>
        <Outlet />
      </Layout.Content>
      <Modal open={searchOpen} onCancel={() => setSearchOpen(false)} footer={null} title="搜索">
        <Input
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="搜索标题或内容…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <List
          style={{ marginTop: 12, maxHeight: 400, overflow: 'auto' }}
          dataSource={hits}
          locale={{ emptyText: query.trim() ? '无结果' : '输入关键词开始搜索' }}
          renderItem={(hit) => (
            <List.Item
              style={{ cursor: hit.type === 'DOC' ? 'pointer' : 'default' }}
              onClick={() => {
                if (hit.type !== 'DOC') return;
                setSearchOpen(false);
                navigate(`/s/${spaceId}/d/${hit.nodeId}`);
              }}
            >
              <List.Item.Meta
                title={hit.title}
                description={hit.snippet ?? (hit.titleHit ? '标题命中' : undefined)}
              />
            </List.Item>
          )}
        />
      </Modal>
    </Layout>
  );
}
