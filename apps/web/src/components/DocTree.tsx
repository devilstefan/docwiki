import { useMemo, useState } from 'react';
import { Button, Dropdown, Input, Modal, Tree, message } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import { FileTextOutlined, FolderOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TreeNode } from '../api/types';

interface Props {
  spaceId: string;
  canEdit: boolean;
}

export default function DocTree({ spaceId, canEdit }: Props) {
  const navigate = useNavigate();
  const { nodeId: activeNodeId } = useParams();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const { data: nodes = [] } = useQuery({
    queryKey: ['nodes', spaceId],
    queryFn: () => api<TreeNode[]>('GET', `/spaces/${spaceId}/nodes`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['nodes', spaceId] });
  const onError = (err: any) => message.error(err.body?.message ?? '操作失败');

  const createNode = useMutation({
    mutationFn: (input: { type: 'FOLDER' | 'DOC'; title: string; parentId?: string }) =>
      api<TreeNode>('POST', `/spaces/${spaceId}/nodes`, input),
    onSuccess: (node) => {
      refresh();
      if (node.type === 'DOC') navigate(`/s/${spaceId}/d/${node.id}`);
    },
    onError,
  });
  const renameNode = useMutation({
    mutationFn: (input: { id: string; title: string }) =>
      api('PATCH', `/spaces/${spaceId}/nodes/${input.id}`, { title: input.title }),
    onSuccess: () => {
      refresh();
      setRenaming(null);
      queryClient.invalidateQueries({ queryKey: ['doc'] });
    },
    onError,
  });
  const deleteNode = useMutation({
    mutationFn: (id: string) => api('DELETE', `/spaces/${spaceId}/nodes/${id}`),
    onSuccess: () => {
      refresh();
      message.success('已移入回收站');
    },
    onError,
  });
  const moveNode = useMutation({
    mutationFn: (input: { id: string; parentId: string | null; afterId?: string | null }) =>
      api('POST', `/spaces/${spaceId}/nodes/${input.id}/move`, {
        parentId: input.parentId,
        afterId: input.afterId,
      }),
    onSuccess: refresh,
    onError,
  });

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, TreeNode[]>();
    for (const n of nodes) {
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    }
    // API 按 path 排序返回,同父内还需按 sortKey 排
    for (const list of map.values()) list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    return map;
  }, [nodes]);

  const treeData = useMemo(() => {
    const build = (parentId: string | null): TreeDataNode[] =>
      (childrenOf.get(parentId) ?? []).map((n) => ({
        key: n.id,
        isLeaf: n.type === 'DOC',
        icon: n.type === 'DOC' ? <FileTextOutlined /> : <FolderOutlined />,
        title: (
          <span className="tree-node-title">
            <span className="tree-node-text">{n.title}</span>
            {canEdit && (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    ...(n.type === 'FOLDER'
                      ? [
                          { key: 'newDoc', label: '新建文档' },
                          { key: 'newFolder', label: '新建目录' },
                        ]
                      : []),
                    { key: 'rename', label: '重命名' },
                    { key: 'delete', label: '删除', danger: true },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'newDoc') createNode.mutate({ type: 'DOC', title: '无标题文档', parentId: n.id });
                    if (key === 'newFolder') createNode.mutate({ type: 'FOLDER', title: '新目录', parentId: n.id });
                    if (key === 'rename') setRenaming({ id: n.id, title: n.title });
                    if (key === 'delete')
                      Modal.confirm({
                        title: `删除「${n.title}」?`,
                        content: '将连同子节点一起移入回收站,可恢复。',
                        onOk: () => deleteNode.mutate(n.id),
                      });
                  },
                }}
              >
                <MoreOutlined className="tree-node-more" onClick={(e) => e.stopPropagation()} />
              </Dropdown>
            )}
          </span>
        ),
        children: n.type === 'FOLDER' ? build(n.id) : undefined,
      }));
    return build(null);
  }, [childrenOf, canEdit]);

  /** antd Tree onDrop → 后端 move 语义(parentId + afterId) */
  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragId = String(info.dragNode.key);
    const targetId = String(info.node.key);
    const target = byId.get(targetId);
    if (!target) return;

    if (!info.dropToGap) {
      // 放到目标节点内部
      if (target.type !== 'FOLDER') {
        message.warning('只能放入目录');
        return;
      }
      moveNode.mutate({ id: dragId, parentId: targetId });
      return;
    }
    // 放到目标节点前/后(同为 target 的兄弟)
    const siblings = (childrenOf.get(target.parentId) ?? []).filter((s) => s.id !== dragId);
    const targetIdx = siblings.findIndex((s) => s.id === targetId);
    const dropPos = info.node.pos.split('-');
    const gapBefore = info.dropPosition - Number(dropPos[dropPos.length - 1]) === -1;
    const afterId = gapBefore ? (siblings[targetIdx - 1]?.id ?? null) : targetId;
    moveNode.mutate({ id: dragId, parentId: target.parentId, afterId });
  };

  return (
    <div style={{ padding: 8 }}>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, padding: '4px 8px 12px' }}>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => createNode.mutate({ type: 'DOC', title: '无标题文档' })}
          >
            文档
          </Button>
          <Button
            size="small"
            icon={<FolderOutlined />}
            onClick={() => createNode.mutate({ type: 'FOLDER', title: '新目录' })}
          >
            目录
          </Button>
        </div>
      )}
      <Tree
        showIcon
        blockNode
        draggable={canEdit ? { icon: false } : false}
        treeData={treeData}
        selectedKeys={activeNodeId ? [activeNodeId] : []}
        defaultExpandAll
        onSelect={(_, { node }) => {
          const n = byId.get(String(node.key));
          if (n?.type === 'DOC') navigate(`/s/${spaceId}/d/${n.id}`);
        }}
        onDrop={onDrop}
      />
      <Modal
        title="重命名"
        open={!!renaming}
        onCancel={() => setRenaming(null)}
        onOk={() => renaming && renameNode.mutate(renaming)}
        okButtonProps={{ loading: renameNode.isPending }}
      >
        <Input
          value={renaming?.title}
          onChange={(e) => renaming && setRenaming({ ...renaming, title: e.target.value })}
          onPressEnter={() => renaming && renameNode.mutate(renaming)}
        />
      </Modal>
    </div>
  );
}
