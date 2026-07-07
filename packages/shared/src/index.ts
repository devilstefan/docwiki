/** 全局角色 */
export const GLOBAL_ROLES = ['ADMIN', 'USER'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** 知识库(Space)内角色,权限从左到右递减 */
export const SPACE_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

/** 文档树节点类型 */
export const NODE_TYPES = ['FOLDER', 'DOC'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** API Token 权限范围 */
export const TOKEN_SCOPES = ['read', 'write', 'admin'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** 编辑锁:心跳续期间隔与过期时间(毫秒) */
export const EDIT_LOCK_HEARTBEAT_MS = 30_000;
export const EDIT_LOCK_TTL_MS = 120_000;

export function hasSpaceRoleAtLeast(actual: SpaceRole, required: SpaceRole): boolean {
  return SPACE_ROLES.indexOf(actual) <= SPACE_ROLES.indexOf(required);
}
