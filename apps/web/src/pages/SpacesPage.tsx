import { useState } from 'react';
import { Button, Card, Col, Empty, Form, Input, Layout, Modal, Row, Tag, Typography, message } from 'antd';
import { PlusOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, setToken } from '../api/client';
import type { Space, User } from '../api/types';

const ROLE_LABEL: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', EDITOR: '编辑者', VIEWER: '只读' };

export default function SpacesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<User>('GET', '/auth/me') });
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => api<Space[]>('GET', '/spaces'),
  });

  const createSpace = useMutation({
    mutationFn: (values: { name: string; description?: string }) => api<Space>('POST', '/spaces', values),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      setCreating(false);
      navigate(`/s/${space.id}`);
    },
    onError: (err: any) => message.error(err.body?.message ?? '创建失败'),
  });

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          DocWiki
        </Typography.Title>
        <div style={{ color: '#fff', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>{me?.name}</span>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            style={{ color: '#fff' }}
            onClick={() => {
              setToken(null);
              navigate('/login');
            }}
          />
        </div>
      </Layout.Header>
      <Layout.Content style={{ padding: 32, maxWidth: 1080, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            我的知识库
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            新建知识库
          </Button>
        </div>
        {!isLoading && !spaces?.length && <Empty description="还没有知识库,点击右上角创建一个" />}
        <Row gutter={[16, 16]}>
          {spaces?.map((s) => (
            <Col key={s.id} xs={24} sm={12} md={8}>
              <Card hoverable onClick={() => navigate(`/s/${s.id}`)}>
                <Card.Meta
                  title={
                    <span>
                      {s.name} {s.myRole && <Tag color="blue">{ROLE_LABEL[s.myRole]}</Tag>}
                    </span>
                  }
                  description={s.description || '暂无描述'}
                />
              </Card>
            </Col>
          ))}
        </Row>
        <Modal
          title="新建知识库"
          open={creating}
          onCancel={() => setCreating(false)}
          footer={null}
          destroyOnHidden
        >
          <Form layout="vertical" onFinish={(v) => createSpace.mutate(v)}>
            <Form.Item name="name" label="名称" rules={[{ required: true, max: 100 }]}>
              <Input placeholder="例如:研发知识库" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={createSpace.isPending}>
              创建
            </Button>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
