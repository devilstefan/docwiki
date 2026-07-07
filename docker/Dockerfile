# DocWiki 单镜像:构建前端 + 后端,运行时由 NestJS 同进程托管 web/dist 与 /api。
# 注:本仓库开发机无 docker,单进程拓扑已在本地生产模式下验证;此文件由 CI/部署环境构建。
FROM node:24-bookworm-slim AS builder
RUN corepack enable pnpm
WORKDIR /app
# .dockerignore 已排除宿主 node_modules,避免跨平台二进制污染
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --dir apps/server exec prisma generate \
  && pnpm build

FROM node:24-bookworm-slim
# prisma 运行时需要 openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# 连同 linux 版 node_modules、web/dist、server/dist 一起拷贝
COPY --from=builder /app /app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# 启动前执行数据库迁移;server 默认从 __dirname/../../web/dist 找前端产物
CMD ["sh", "-c", "cd apps/server && ./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
