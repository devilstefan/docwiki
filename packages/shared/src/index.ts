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

const SORT_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const SORT_BASE = SORT_DIGITS.length;

/**
 * fractional index:生成字典序上 a < key < b 的排序键。
 * a = null 表示区间最前,b = null 表示区间最后。
 * 生成的键永不以 '0' 结尾,因此任意键之前都还能再插入。
 */
export function sortKeyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`sortKeyBetween: invalid range ${a} >= ${b}`);
  }
  let res = '';
  let i = 0;
  let upper = b;
  while (true) {
    const da = a !== null && i < a.length ? SORT_DIGITS.indexOf(a[i]) : 0;
    const db = upper !== null && i < upper.length ? SORT_DIGITS.indexOf(upper[i]) : SORT_BASE;
    if (db - da > 1) {
      return res + SORT_DIGITS[Math.floor((da + db) / 2)];
    }
    // db-da === 1:借位,锁定 da 后上界视为无穷;db===da:公共前缀,继续
    res += SORT_DIGITS[da];
    if (db - da === 1) upper = null;
    i++;
  }
}
