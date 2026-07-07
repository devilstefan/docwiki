import { useState } from 'react';
import { Button, Card, Form, Input, Tabs, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';
import type { User } from '../api/types';

type AuthResponse = { user: User; accessToken: string };

export default function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);

  async function submit(values: Record<string, string>) {
    setLoading(true);
    try {
      const res = await api<AuthResponse>(
        'POST',
        tab === 'login' ? '/auth/login' : '/auth/register',
        values,
      );
      setToken(res.accessToken);
      navigate('/');
    } catch (err: any) {
      message.error(err.status === 401 ? '邮箱或密码错误' : (err.body?.message ?? '操作失败'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f5f5' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          DocWiki
        </Typography.Title>
        <Tabs
          centered
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />
        <Form layout="vertical" onFinish={submit} key={tab}>
          {tab === 'register' && (
            <Form.Item name="name" label="昵称" rules={[{ required: true, max: 50 }]}>
              <Input placeholder="你的名字" />
            </Form.Item>
          )}
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="you@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, min: tab === 'register' ? 8 : 1, message: '密码至少 8 位' }]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            {tab === 'login' ? '登录' : '注册'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
