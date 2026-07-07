import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasSpaceRoleAtLeast, type SpaceRole } from '@docwiki/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { SPACE_ROLE_KEY } from './require-space-role.decorator';

/**
 * 校验 Space 内角色。依赖:JwtAuthGuard 已挂 req.user;路由含 :spaceId 参数。
 * 平台 ADMIN 直通。命中后把 membership 挂到 req.spaceMembership。
 */
@Injectable()
export class SpaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SpaceRole | undefined>(SPACE_ROLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    const spaceId: string | undefined = req.params?.spaceId;
    if (!user || !spaceId) throw new ForbiddenException('space role check misconfigured');

    if (user.role === 'ADMIN') return true;

    const membership = await this.prisma.spaceMember.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId } },
    });
    if (!membership) throw new NotFoundException('space not found');
    if (!hasSpaceRoleAtLeast(membership.role, required)) {
      throw new ForbiddenException(`requires space role ${required}`);
    }
    req.spaceMembership = membership;
    return true;
  }
}
