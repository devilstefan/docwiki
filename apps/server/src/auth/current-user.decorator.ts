import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GlobalRole } from '@docwiki/shared';

/** JWT 载荷解出的当前用户,由 JwtAuthGuard 挂到 request 上 */
export interface AuthUser {
  id: string;
  email: string;
  role: GlobalRole;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
