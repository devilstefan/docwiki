# DocWiki server 镜像(注:本机无 docker,此文件由 CI/部署环境验证)
FROM node:24-bookworm-slim AS builder
RUN corepack enable pnpm
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --dir apps/server exec prisma generate \
  && pnpm build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# 首次启动前执行数据库迁移
CMD ["sh", "-c", "cd apps/server && ./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
