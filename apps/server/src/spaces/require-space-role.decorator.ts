import { SetMetadata } from '@nestjs/common';
import type { SpaceRole } from '@docwiki/shared';

export const SPACE_ROLE_KEY = 'requiredSpaceRole';
/** 要求当前用户在 :spaceId 对应知识库中至少具备某角色(OWNER > ADMIN > EDITOR > VIEWER) */
export const RequireSpaceRole = (role: SpaceRole) => SetMetadata(SPACE_ROLE_KEY, role);
