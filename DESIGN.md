# DocWiki — 开源动态文档平台 技术方案(v0.1 头脑风暴定稿)

> 定位:自托管、开源的团队文档/知识库平台,对标飞书文档、语雀的核心体验。
> 决策记录日期:2026-07-07

## 0. 已确认的关键决策

| 决策点 | 结论 | 说明 |
|---|---|---|
| 技术路线 | **路线 C:全动态平台** | 内容真源在数据库,阅读与编辑都是动态渲染,不依赖静态构建 |
| Docusaurus 的角色 | **降级为可选发布渠道 + 设计参考** | 平台不再"基于 Docusaurus 研发";V2 提供"导出为 Docusaurus 站点"插件,兼顾对外静态文档站/SEO 场景 |
| 编辑器 | **双模式:所见即所得 + Markdown 源码** | TipTap(ProseMirror)富文本模式 + CodeMirror 6 源码模式,底层以 Markdown 为规范格式 |
| 后端栈 | **Node.js / NestJS** | 全栈 TypeScript,单语言、单镜像,契合开源易部署定位 |
| 协同编辑 | **MVP 用编辑锁,不做实时协同** | 同一文档同时仅一人可编辑;内容存 Markdown 纯文本,后续如上 Yjs 再迁移文档格式 |
| 双向链接/图谱 | **Wikilink 双链进 M1,图谱视图 M2** | `[[链接]]` 语法与链接索引是数据模型地基,必须首版就有;可视化图谱可后置 |
| AI 接入 | **MCP Server + Open API 作为一等公民,M2 交付** | 平台原生暴露 MCP(Streamable HTTP + stdio),让 Claude Code/Cursor 等 AI 工具直接读写知识库 |

### 路线 C 的代价(明确接受)
- 公开文档页的 SEO 需要 SSR 或 HTML 缓存来解决(见 §4.5),不像静态站天然免费
- 站点性能依赖服务端,不能纯 CDN 托管
- Docusaurus 插件生态(版本化文档、MDX 组件)不再直接可用,需要的能力要自建或通过导出插件间接获得

## 1. 产品形态

三个使用面,一套服务:

1. **工作台(登录用户)**:知识库列表、文档树、编辑器、搜索、回收站 —— 类语雀主界面
2. **管理后台(管理员)**:用户/角色、知识库配置、存储配置(OSS 等)、审计日志、站点设置
3. **公开门户(匿名读者)**:被设为公开的知识库以文档站形式对外展示(目录树 + 正文 + 搜索),支持自定义域名

## 2. 功能清单与分期

### M1 — 可用的最小闭环(目标:内部先用起来)
- [ ] 用户注册/登录(邮箱密码 + 可插拔 OAuth:GitHub/企业微信/钉钉留接口)
- [ ] 知识库(Space):创建/归档,成员与角色(管理员/编辑者/只读)
- [ ] 文档树:无限层级目录,拖拽排序/移动,文档与目录节点统一建模
- [ ] 编辑器双模式:富文本(TipTap)⇄ Markdown 源码(CodeMirror),自动保存草稿
- [ ] 编辑锁:进入编辑即持锁(心跳续期),他人只读并可见"xx 正在编辑"
- [ ] 版本历史:每次保存产生版本,支持 diff 查看与回滚
- [ ] 图片/附件上传:存储驱动抽象,首发 **本地磁盘 + 阿里云 OSS**(接口按 S3 语义设计,MinIO/COS 顺带兼容)
- [ ] **双向链接**:编辑器输入 `[[` 弹出文档联想;保存时解析并落 DocLink 索引;文档页展示反向链接(Backlinks)面板;悬浮预览
- [ ] 全文搜索:PostgreSQL tsvector(中文用 pg_jieba 或简单 trigram 起步)
- [ ] 回收站与恢复
- [ ] 导出:单篇 Markdown(含图片打包 zip)

### M2 — 对外发布与格式导出
- [ ] 公开门户:知识库级"公开发布"开关,SSR 渲染 + 缓存,sitemap
- [ ] 分享链接:单篇文档定链分享(可设密码/有效期)
- [ ] 导出 PDF(Playwright 服务端打印)、Word(pandoc 可选依赖,降级用 docx 库)、整库批量导出
- [ ] 导入:Markdown 文件/zip、语雀导出包
- [ ] **关系图谱视图**(Obsidian 式):全库图谱 + 以当前文档为中心的 N 度邻域局部图,力导向布局,按标签/知识库着色,孤儿文档高亮
- [ ] **MCP Server**:平台内置 `/mcp` 端点(Streamable HTTP)+ `npx docwiki-mcp` stdio 适配器,供 Claude Code/Cursor/Windsurf 等直接读写知识库(见 §4.7)
- [ ] **Open API + API Token**(从 M3 提前):REST 全量能力 + 细粒度 scope 的个人访问令牌,MCP 即建立在此之上
- [ ] 文档内评论、@提及、站内通知
- [ ] 搜索升级:Meilisearch 驱动(可选,默认仍 PG)
- [ ] 审计日志、细粒度权限(目录级/文档级覆盖)

### M3 — 生态与增强
- [ ] **Docusaurus 导出插件**:把公开知识库导出为完整 Docusaurus 项目(自动生成 sidebars、frontmatter),满足"要一个纯静态对外文档站"的场景
- [ ] Webhook;图谱增强(时间轴回放、标签过滤器、局部图嵌入文档页)
- [ ] `llms.txt` / 全库 RAG 友好导出(结构化 JSONL,供用户自建向量库)
- [ ] i18n 文档多语言、文档模板中心
- [ ] 实时协同编辑(Yjs)——仅在编辑锁被验证不够用后启动,启动前需完成内容格式迁移评估

## 3. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| Monorepo | pnpm workspace + Turborepo | 统一 TS 工具链 |
| 后端 | NestJS 11 + Prisma + PostgreSQL 16 | 模块化清晰、依赖注入利于驱动插件化;Prisma 迁移体验好 |
| 轻量模式 | Prisma 双 schema 支持 SQLite | 个人用户 `docker run` 单容器零依赖跑起来,对开源传播关键 |
| 缓存/队列 | 内置内存实现,Redis 可选 | 小部署不强制 Redis;导出等重任务走 BullMQ(有 Redis 时)或进程内队列 |
| 前端 | React 19 + Vite + Ant Design 5 + TanStack Query | 工作台与管理后台同一 SPA,按路由分包 |
| 公开门户 | NestJS 侧 SSR(React renderToString + 页面级缓存) | 避免为 SEO 再引入一个 Next.js 应用,保持单服务 |
| 编辑器 | TipTap 2(富文本)+ CodeMirror 6(源码)+ remark 生态做双向转换 | Markdown 为规范存储格式;富文本模式只允许可无损映射到 MD 的节点(表格/代码块/图片/callout/wikilink 等) |
| 图谱渲染 | graphology(图数据结构)+ sigma.js(WebGL 渲染) | 千节点以上仍流畅,比 D3 SVG 方案的性能上限高一个量级 |
| MCP | @modelcontextprotocol/sdk,Nest 模块封装 | 与 REST 共享同一 service 层,零业务逻辑重复 |
| API 风格 | REST + OpenAPI(Nest Swagger 自动生成) | 开源项目对外 API 友好度优先于 tRPC 的内部便利 |
| 鉴权 | 自签 JWT(access+refresh)+ Passport 策略插件化 | OAuth 提供商做成驱动 |
| 导出 | remark(MD)/ Playwright(PDF)/ pandoc 或 docx(Word) | pandoc 做成检测式可选依赖 |

### 仓库结构
```
docwiki/
├── apps/
│   ├── server/          # NestJS:API + 公开门户 SSR + 静态资源托管
│   └── web/             # React SPA:工作台 + 管理后台
├── packages/
│   ├── editor/          # 双模式编辑器(可独立发 npm)
│   ├── markdown/        # MD AST 转换、双向映射、导入导出共用
│   ├── storage/         # 存储驱动接口 + local/oss/s3 实现
│   ├── mcp/             # @docwiki/mcp:stdio→HTTP 适配器,独立发 npm
│   └── shared/          # DTO、权限常量、zod schema
├── docker/              # Dockerfile、docker-compose.yml
└── docs/                # 项目自身文档(最终用 DocWiki 自举)
```

## 4. 核心设计

### 4.1 数据模型(主干)
```
User ─┬─ SpaceMember(role) ─── Space ─── Node(树:folder|doc,materialized path + 兄弟排序键)
      │                                    └── Document ─┬─ Revision(版本,存全量 MD)
      │                                                  ├─ EditLock(user, expireAt 心跳)
      │                                                  ├─ DocLink(source→target, 未解析时存 targetTitle)
      │                                                  └─ Comment
      ├─ Attachment(storageDriver, key, meta)
      ├─ ApiToken(scopes[], 归属用户, 最近使用)
      └─ AuditLog(actor 可为 user 或 api-token/agent)
SiteSetting / StorageConfig / AuthProvider(加密存储密钥)
```
要点:
- **Node 与 Document 分离**:树结构操作(移动/排序/权限继承)不碰内容表
- **Revision 存全量 Markdown**,不存 diff——存储便宜,回滚与导出简单
- 树用 materialized path + fractional index 排序,拖拽排序无需重写兄弟节点
- **DocLink 是图谱与反链的唯一数据源**:保存文档时由 `packages/markdown` 解析 AST 增量重建该文档的出链;图谱查询就是对 DocLink 的一次聚合,无需图数据库

### 4.2 编辑锁协议
1. 进入编辑 → `POST /docs/:id/lock`,成功则返回锁,失败返回持锁人
2. 前端每 30s 心跳续期;关闭页面 `sendBeacon` 释放;锁超时 2 分钟自动过期
3. 保存时校验锁归属,防止过期后脏写;冲突时提示"另存为新版本"兜底

### 4.3 存储驱动接口
```ts
interface StorageDriver {
  put(key: string, body: Readable, meta: ObjectMeta): Promise<void>
  getSignedUrl(key: string, ttl: number): Promise<string>  // 私有读走签名 URL
  delete(key: string): Promise<void>
}
```
- 驱动:`local`(默认,签名 URL 由 server 代理)、`aliyun-oss`、`s3`(兼容 MinIO/COS/R2)
- 上传走服务端直传或 STS 临时凭证客户端直传(OSS/S3),大文件不过 Node

### 4.4 权限模型
- 全局角色:超管 / 普通用户
- Space 角色:owner / admin / editor / viewer;M2 加节点级 override(继承 + 就近覆盖)
- 公开门户 = 把 `anonymous` 视为携带 viewer 角色访问被标记 public 的 Space,同一套鉴权代码

### 4.5 双向链接与关系图谱(Obsidian 式)
**链接语法与稳定性**
- 编辑器输入 `[[` 触发文档联想,支持 `[[标题]]` 与 `[[标题|显示别名]]`
- 关键决策:**内部持久化按 docId,展示按标题**。链接一旦被解析(用户从联想中选中),Markdown 中序列化为 `[[docId|当时标题]]`,渲染时实时取目标文档最新标题——文档改名不产生死链,无需全库重写
- 允许悬空链接(dangling link):目标不存在时 DocLink 记录 `targetTitle`,渲染为"待创建"样式,点击即建文档(Obsidian 核心心流);新文档标题命中悬空链接时自动回填解析
- 导出时降级:导出 Markdown/Docusaurus 时 wikilink 转为相对路径标准链接,保证外部工具可读

**图谱视图(M2)**
- 数据即 `SELECT source, target FROM DocLink`(按 Space 或全局过滤),前端 graphology 建图 + sigma.js WebGL 渲染,力导向布局在 Web Worker 里跑
- 两种入口:全库图谱页;文档详情侧栏的 N 度邻域局部图
- 节点大小按反链数,颜色按知识库/标签,孤儿文档(零出入链)高亮以驱动整理

### 4.6 MCP Server 与 AI 接入
目标:用户的 AI 开发工具(Claude Code、Cursor 等)把 DocWiki 当成可读写的知识库,AI 既能查资料也能替人维护文档。

**双形态接入**
1. **内置 Streamable HTTP 端点** `https://your-docwiki/mcp`:远程/团队场景,零安装,Header 带 API Token
2. **`npx @docwiki/mcp` stdio 适配器**:本地工具链场景,薄壳进程把 stdio 转发到 HTTP 端点,配置只需 `DOCWIKI_URL` + `DOCWIKI_TOKEN`

**工具集(首批)**
| Tool | 说明 |
|---|---|
| `search_docs` | 全文/标题搜索,返回 id+摘要 |
| `read_doc` | 按 id/路径读 Markdown 全文与元数据 |
| `list_tree` | 列知识库/目录树,AI 了解结构 |
| `create_doc` / `update_doc` | 写入 Markdown;**走与人类相同的编辑锁**,锁被占用时返回持锁人而非静默覆盖 |
| `move_node` / `delete_doc` | 结构维护(delete 进回收站,不硬删) |
| `get_backlinks` / `get_graph` | 反链与 N 度邻域,AI 可利用链接关系做关联推理 |
| `attach_image` | 上传图片返回可引用 URL |

**安全与审计**
- API Token 带 scope(`read` / `write` / `admin`)与 Space 白名单,权限收敛于持有者本人的 RBAC 之内(token 权限 = 用户权限 ∩ scope)
- AI 的每次写入都产生 Revision + AuditLog(actor 标记为 token),误操作可回滚——这是敢让 AI 维护知识库的前提
- 写入默认软性防护:单 token 频率限制;`update_doc` 要求先 `read_doc` 拿到当前 revision 号,提交时校验,防止 AI 基于过期内容盲写(乐观锁)

**对 AI 友好的底层红利**:内容规范格式就是 Markdown,LLM 读写零转换损耗;这是当初选"MD 为真源"的重要加分项。

### 4.7 公开门户 SEO
- 文档发布后渲染 HTML 存缓存表(或 Redis),命中直接吐;内容变更失效
- 输出 sitemap.xml、OpenGraph meta;这是路线 C 换取动态能力后必须补的课

## 5. 部署与开源策略

- **一键部署**:`docker compose up -d`(postgres + server;web 构建产物由 server 托管)——只有两个容器
- **单容器模式**:SQLite + 本地存储,面向个人试用
- 配置全部走环境变量 + 后台可视化设置(存 DB),密钥加密落库
- CI:GitHub Actions 出多架构镜像(amd64/arm64),tag 即 release
- **License:MIT**(已定,仓库 https://github.com/devilstefan/docwiki )
- 必备门面:README(中英)、在线 Demo、30 秒部署 GIF、贡献指南、good-first-issue
- 动手前精读:Outline(权限与分享模型)、AFFiNE(编辑器工程)、Halo(插件体系与国内开源运营)

## 6. 主要风险

| 风险 | 缓解 |
|---|---|
| 富文本 ⇄ Markdown 双向转换的保真度是最大技术难点 | 富文本模式限制为"可无损映射 MD"的节点白名单;转换层 `packages/markdown` 独立包 + 快照测试覆盖 |
| SSR 门户性能 | 页面级缓存 + 失效策略,压测纳入 CI |
| pandoc/Playwright 依赖使镜像变重 | 导出功能拆为可选 worker 镜像,主镜像保持精简 |
| 范围蔓延(对标飞书永远做不完) | 严格按 M1→M3 分期,M1 不含任何"对外"功能 |
| wikilink 按 docId 序列化导致原始 MD 可读性下降 | 导出时统一转标准链接;编辑器源码模式对 `[[id|title]]` 做装饰渲染,用户看到的仍是标题 |
| AI 通过 MCP 大批量误写 | 乐观锁 + 全量 Revision + 回收站 + token 频率限制,四层兜底 |
