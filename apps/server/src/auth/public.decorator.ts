import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** 标记无需登录即可访问的端点(默认全局 JwtAuthGuard 拦截) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
