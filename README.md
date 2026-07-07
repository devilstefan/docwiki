# DocWiki

开源、自托管的团队文档/知识库平台。对标飞书文档、语雀的核心体验:动态编辑、双向链接与关系图谱、细粒度权限、多格式导出,并原生内置 MCP Server 供 AI 工具读写知识库。

> ⚠️ 早期开发中(pre-alpha),尚不可用于生产。技术方案见 [DESIGN.md](./DESIGN.md)。

## 特性(规划)

- 📚 多知识库、无限层级文档树、拖拽整理
- ✍️ 双模式编辑器:所见即所得 ⇄ Markdown 源码,内容以 Markdown 为真源
- 🔗 Obsidian 式双向链接与关系图谱(改名不断链)
- 🕘 全量版本历史与回滚、编辑锁防冲突
- 🔐 用户/角色 RBAC,知识库级权限
- 🖼️ 可插拔存储:本地磁盘 / 阿里云 OSS / S3(MinIO、COS、R2)
- 🌐 公开门户(SSR + 缓存,SEO 友好)与分享链接
- 📤 导出 Markdown / PDF / Word,导出为 Docusaurus 静态站
- 🤖 内置 MCP Server + Open API,AI 开发工具可直接维护知识库

## 技术栈

pnpm + Turborepo monorepo;NestJS + Prisma + PostgreSQL;React + Vite + Ant Design;TipTap + CodeMirror。

```
apps/server      NestJS API(+ 公开门户 SSR)
apps/web         工作台 + 管理后台 SPA
packages/shared    共享常量与类型
packages/markdown  wikilink 解析、MD ⇄ 富文本转换
packages/storage   存储驱动接口与实现
```

## 开发

```bash
corepack enable pnpm
pnpm install
pnpm --dir apps/server exec prisma generate
pnpm build        # 构建全部
pnpm dev          # server + web 开发模式
```

数据库:`docker compose up -d db`,连接串见 [.env.example](./.env.example)。

## 部署

```bash
docker compose up -d   # postgres + server
```

## License

[MIT](./LICENSE)
