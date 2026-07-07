import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 前端 SPA 路由不带 /api 前缀,只给后端加前缀
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 3000);
  // 绑定 0.0.0.0 以便容器内可访问
  await app.listen(port, '0.0.0.0');
  console.log(`DocWiki server listening on http://localhost:${port}`);
}

bootstrap();
