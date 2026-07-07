import { Module, ValidationPipe, type DynamicModule } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SpacesModule } from './spaces/spaces.module';
import { NodesModule } from './nodes/nodes.module';
import { DocsModule } from './docs/docs.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SearchModule } from './search/search.module';

/**
 * 生产模式下托管前端静态产物(单进程部署)。仅当 web/dist 存在时启用:
 * 开发时前端由 Vite(:5173)伺服,此处返回空,不干扰。
 * 所有后端路由都在 /api 前缀下,exclude 后由 SPA fallback 兜底非 API 路由。
 */
function serveWebStatic(): DynamicModule[] {
  const webDist = process.env.WEB_DIST_PATH || resolve(__dirname, '..', '..', 'web', 'dist');
  if (!existsSync(join(webDist, 'index.html'))) return [];
  return [ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}'] })];
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...serveWebStatic(),
    PrismaModule,
    StorageModule,
    AuthModule,
    SpacesModule,
    NodesModule,
    DocsModule,
    AttachmentsModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true }) },
  ],
})
export class AppModule {}
