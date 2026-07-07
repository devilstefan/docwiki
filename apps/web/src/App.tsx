import { Layout, Typography, Tag, Space } from 'antd';

const { Header, Sider, Content } = Layout;

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          DocWiki
        </Typography.Title>
        <Tag color="blue">M1 骨架</Tag>
      </Header>
      <Layout>
        <Sider theme="light" width={260}>
          {/* TODO: 知识库列表 + 文档树 */}
        </Sider>
        <Content style={{ padding: 24 }}>
          <Space direction="vertical">
            <Typography.Title level={3}>工程骨架就绪</Typography.Title>
            <Typography.Paragraph type="secondary">
              下一步:认证 → 知识库 → 文档树 → 编辑器竖切。
            </Typography.Paragraph>
          </Space>
        </Content>
      </Layout>
    </Layout>
  );
}
