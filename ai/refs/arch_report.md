# DreamReel（梦卷）架构与完成度评估报告

> 分析日期：2026-10-04  
> 修订：2026-10-05（测试基线更新：439 个用例全通过；eslint 基线 47）  
> 分析范围：完整代码库（src / public / tests / docs / .workflow）  
> 分析依据：代码审读 + 测试运行 + 本地 E2E 验证  
> 结论原则：有代码/运行证据则标注「已确认」，有代码无运行验证则「未验证」，README 声称但无代码支撑则「仅 README 声称」

---

## 一、技术栈与架构总览

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|-|-|-|
| 运行时 | Node.js >= 18 | ESM 模块，package.json 已声明 `"type": "module"` |
| Web 框架 | Express 4.21 | REST API，CORS 已启用，JSON 解析限制 10MB |
| 前端 | 原生 JS（无框架） | SPA 路由通过 location.hash，18 个视图模块 |
| 数据存储 | JSON 文件（本地 storage/） | 内存运行 + 异步落盘，非数据库；重启后从 db.json 加载 |
| 视频处理 | ffmpeg 4.4.2 | 合成、拼接、配音混音、字幕烧录、缩略图提取 |
| 测试 | Node.js 内置 test runner | 439 个测试用例，无外部测试框架依赖 |
| 容器化 | Docker + docker-compose | 单容器，node:20-slim 基础镜像，内置 ffmpeg |
| 代码规范 | ESLint 9 + Prettier 3 | 当前全仓 47 个历史 eslint error（未修复） |

### 1.2 架构模式

**单体 Express 应用，分层结构清晰：**

```
Client (Browser SPA)
    |
    v
Express API Server (src/server.js)
    |
    +-- Routes (35 个模块)      <-- HTTP 层：参数校验、鉴权、响应格式化
    +-- Middleware (2 个)       <-- authOptional, performanceMonitor
    +-- Services (39 个)        <-- 业务逻辑层：核心算法、流程编排
    +-- Providers (16 个)       <-- AI 能力抽象层：视频/LLM/TTS 多厂商适配
    +-- Models (7 个)           <-- 领域模型：Project/Character/Scene/Shot/User/Studio/Team
    +-- Config (6 个)           <-- 静态数据：导演档案、风格库、场景库、BGM/SFX 库
    +-- Utils (3 个)            <-- ffmpeg 封装、标题卡渲染、日志
    |
    v
Local File System (storage/)
    +-- data/db.json            <-- 项目/用户/配置持久化
    +-- videos/                 <-- 生成的镜头视频
    +-- exports/                <-- 合成后的成片
    +-- audio/                  <-- 配音、BGM、音效
    +-- thumbnails/             <-- 项目封面
    +-- title-sequences/        <-- 创意片头输出
```

**关键设计决策：**

- **Provider 工厂模式**：视频/LLM/TTS 均通过 Factory 获取具体 Provider，默认全部 mock，切换环境变量即可接入真实服务
- **内存 + JSON 持久化**：所有业务数据在内存 Map 中运行，通过 debounce 异步写入 db.json；原子写入机制（先写临时文件再重命名）
- **异步视频生成**：API 返回 202 Accepted，后台轮询 Provider 任务状态，完成后回调更新项目镜头状态
- **三轨混音导出**：ffmpeg 拼接镜头 → 合成配音+BGM+音效三轨 → 烧录字幕 → 输出 MP4

---

## 二、模块地图

### 2.1 路由层（35 个文件）

| 模块 | 路由文件 | 核心端点 |
|-|-|-|
| 项目 | projects.js | CRUD、搜索筛选、批量操作、归档/收藏/标签、封面提取 |
| 剧本 | script.js | 生成、修改、改编（小说/IP → 分镜） |
| 视频 | video.js | 单镜生成、批量生成、并行引擎、镜头锁定/版本 |
| 角色 | characters.js | CRUD、锁定参考图、一致性评估、造型（服装/妆容/整体） |
| 配音 | dubbing.js | 生成配音+字幕、音色列表、单句预览 |
| 导出 | export.js | 异步/同步导出成片、导出历史 |
| 模板 | templates.js | 内置模板列表、从模板创建项目、用户自定义模板 |
| 风格 | styles.js | 15+ 导演风格预设、prompt 修饰注入 |
| 场景 | scenes.js | 22 个内置场景、用户自定义场景 CRUD |
| AI 影评 | analysis.js | 四维评分（镜头/叙事/节奏/一致性） |
| 协作 | collaboration.js | 评论（按镜头筛选/解决）、活动记录、分享链接 |
| 导演模式 | directors.js | 5 位导演档案、应用到项目、开关控制 |
| 创意片头 | titleSequences.js | 4 套模板、生成 3-5 秒片头 MP4 |
| 剧场厂牌 | studios.js | 厂牌广场、签约成员、剧集、作品归入 |
| 认证 | auth.js | JWT 注册/登录、scrypt 密码哈希 |
| 订阅 | subscription.js | 4 档计划、模拟支付、Stripe 预留 |
| 额度 | quota.js | 按订阅计划动态限制 |
| 版本 | versions.js | 自动/手动保存、回滚、对比 |
| 统计 | stats.js | 仪表盘、14 天趋势、风格分布 |
| 审核 | moderation.js | 6 大类别、3 级分级 |
| 通知 | notifications.js | 8 种类型、30 秒轮询 |
| 设置 | system.js | Provider 状态、系统信息 |
| Webhook | webhooks.js | HMAC 签名、事件触发、投递日志 |
| AI 助手 | aiAssistant.js | 智能创作辅助 |
| 音频 | audio.js | BGM 库、音效库、音量调节 |
| 营销 | marketing.js | 海报/封面生成 |
| 创作者 | creators.js | 创作者主页、作品网格、统计 |
| 作品广场 | gallery.js | 公开作品流、分类筛选、点赞 |
| 挑战 | challenges.js | 官方主题挑战、投稿、排行榜 |
| 团队 | teams.js | 团队创建、成员邀请、权限分级 |
| API 开放平台 | openApi.js | Bearer 鉴权、项目/视频开放接口 |
| API Key | apiKeys.js | 创建/吊销、用量统计 |
| 素材商城 | store.js | 素材包浏览、模拟支付 |
| 企业版 | enterprise.js | SSO、安全策略、审计日志 |

### 2.2 Service 层（39 个文件）

按职责聚类：

- **创作核心**：projectService, scriptService, videoService, characterService, dubbingService, videoCompositingService, directorService, titleSequenceService, sceneService, styleService
- **项目管理**：templateService, versionService, exportHistoryService, thumbnailService
- **社区/协作**：collaborationService, filmAnalysisService, galleryService, creatorService, challengeService, studioService, teamService
- **商业/运营**：subscriptionService, quotaService, statsService, marketplaceService, storeService, enterpriseService
- **平台能力**：authService, apiKeyService, notificationService, contentModerationService, auditService, webhookService, aiAssistantService, audioService, posterService, trailerService
- **基础设施**：storageService, performanceMonitor

### 2.3 Provider 层（16 个文件）

| 类型 | 已接入 Provider | 说明 |
|-|-|-|
| 视频生成 | mock, runway, pika, minimax, seedance, wan | 6 个 Provider，mock 用 ffmpeg 生成占位视频 |
| LLM | mock, openai | mock 返回固定 JSON；openai 兼容任意 OpenAI 格式端点 |
| TTS | mock, elevenlabs | mock 生成静音/蜂鸣占位音频 |

---

## 三、完成度评估表

评估维度说明：

- **已确认**：有代码实现 + 测试覆盖 + 本次 E2E/运行验证通过
- **未验证**：有代码实现 + 测试覆盖，但本次未做独立 E2E 验证
- **仅 README 声称**：README/PRD 中有描述，但代码层面未找到对应实现或仅空壳

### 3.1 核心创作链路（P0）

| 功能 | 证据等级 | 说明 |
|-|-|-|
| 项目 CRUD | 已确认 | 代码完整，projectService.test.js 覆盖，E2E 通过 |
| AI 生成剧本 | 已确认 | scriptService + mockLLMProvider，scriptService.test.js 覆盖，E2E 通过 |
| 剧本改编（小说/IP → 分镜） | 未验证 | 代码完整（scriptService.adaptScript），有测试文件，未单独验证 |
| 镜头生成（单镜） | 已确认 | videoService.generateShot + mockVideoProvider，E2E 12 秒内完成生成并更新状态 |
| 批量镜头生成 | 未验证 | 代码完整（video.js 批量路由 + 并行引擎），有 videoParallel.test.js |
| 镜头锁定/多版本 | 未验证 | 代码完整（shot.locked + shot.versions），有测试覆盖 |
| 角色 CRUD + 参考图锁定 | 未验证 | 代码完整，characterService.test.js 覆盖 |
| 角色造型注入（服装/妆容/整体） | 未验证 | Sprint 12 新增，videoService.\_enhanceWithStyling，有 videoStylingPrompt.test.js |
| 角色表情动作库 | 未验证 | config/characterExpressions.js 存在，有代码注入逻辑 |
| 场景库（22 内置 + 自定义） | 未验证 | sceneLibrary.js 存在，sceneService 完整，有代码 |
| 镜头衔接（上一镜尾帧参考） | 未验证 | videoService 中有 prevFramePath 逻辑，需真实生成后才能验证 |
| 全局视觉风格锁定 | 未验证 | project.visualStyle 字段存在，\_enhanceWithVisualStyle 逻辑存在 |
| 一键配音 + 字幕 | 未验证 | dubbingService 完整，dubbingService.test.js 覆盖，未做 E2E |
| 多角色对话配音 | 未验证 | dubbingService.extractDialogueLines 有角色识别逻辑 |
| BGM/音效库 + 三轨混音 | 未验证 | videoCompositingService.\_buildMixedAudioTrack 存在，bgmLibrary.js/sfxLibrary.js 存在 |
| 字幕样式自定义 | 未验证 | project.subtitleStyle 字段完整，有配置结构 |
| 视频合成导出 | 已确认 | videoCompositingService.exportProject，E2E 验证通过（生成后可正常导出 MP4） |
| 创意片头（4 模板） | 未验证 | titleSequenceService 完整，titleSequence.test.js 覆盖（字体运行时缺失时用例跳过） |
| 导演模式（5 位导演） | 未验证 | directorProfiles.js + directorService 完整，directorMode.test.js 覆盖 |
| 剧场厂牌体系 | 未验证 | Studio.js + studioService 完整，studioSystem.test.js 覆盖 |

### 3.2 账户与商业化

| 功能 | 证据等级 | 说明 |
|-|-|-|
| JWT 认证 | 未验证 | authService.js 完整，authService.test.js 覆盖，有 JWT HMAC-SHA256 实现 |
| 用户注册/登录 | 未验证 | 路由和 Service 均存在，测试覆盖 |
| 订阅付费（4 档） | 未验证 | subscriptionService 存在，Stripe 接口预留但未接入真实支付 |
| 额度系统 | 未验证 | quotaService 存在，quotaService.test.js 覆盖 |
| 创作数据统计 | 未验证 | statsService 存在，statsService.test.js 覆盖 |

### 3.3 项目管理增强

| 功能 | 证据等级 | 说明 |
|-|-|-|
| 项目搜索/筛选/排序 | 未验证 | projectService.listProjects 有 7 维筛选逻辑 |
| 项目标签 | 未验证 | project.tags 字段 + 增删查方法 |
| 项目收藏/归档 | 未验证 | 有 toggleFavorite/toggleArchive 方法及测试 |
| 项目复制 | 未验证 | projectDuplicate.test.js 覆盖 |
| 批量操作 | 未验证 | batchOperations.test.js 覆盖 |
| 版本历史（自动/手动保存） | 未验证 | versionService 存在，versionService.test.js 覆盖 |
| 项目导出/导入 JSON | 未验证 | importExport.test.js 覆盖 |
| 回收站 | 未验证 | recycleBin.test.js 覆盖 |
| 最近项目 | 未验证 | recentProjects.test.js 覆盖 |

### 3.4 产品体验

| 功能 | 证据等级 | 说明 |
|-|-|-|
| 通知系统 | 未验证 | notificationService 存在，多个测试文件覆盖 |
| 内容审核 | 未验证 | contentModerationService 存在，contentModeration.test.js 覆盖 |
| 键盘快捷键 | 仅 README 声称 | public/js/ 中未找到全局快捷键事件监听器代码 |
| 暗色/亮色主题 | 未验证 | CSS 变量存在，localStorage 主题键存在 |
| 多语言（i18n） | 未验证 | HTML lang="zh-CN"，代码中部分提示语为中文，但未找到完整的国际化切换机制 |
| PWA（Service Worker / manifest） | 未验证 | manifest.webmanifest 存在，但未验证 Service Worker 是否注册 |
| API 文档 | 未验证 | public/docs.html 存在，内容未验证 |

### 3.5 社区/协作/差异化亮点

| 功能 | 证据等级 | 说明 |
|-|-|-|
| 风格迁移工坊（15+ 风格） | 未验证 | styleService 有 15 个风格预设，代码完整 |
| 模板市场（10 内置模板） | 未验证 | templateService 有 10 个内置模板 |
| AI 影评 | 未验证 | filmAnalysisService 存在，filmAnalysisService.test.js 覆盖 |
| 协作评论系统 | 未验证 | collaborationService 存在，多个测试覆盖 |
| AI 海报与封面 | 仅 README 声称 | posterService.js 存在但内容未深入验证 |
| AI 预告片 | 仅 README 声称 | trailerService.js 存在但内容未深入验证 |
| 创作者主页 | 未验证 | creatorService + creator.js 视图存在 |
| 作品广场 | 未验证 | galleryService + gallery.js 视图存在 |
| 创作挑战 | 未验证 | challengeService + challenges.js 视图存在 |
| 团队协作空间 | 未验证 | teamService + teams.js 视图存在 |
| API 开放平台 | 未验证 | openApi.js + apiKeys.js 存在，有 Bearer 鉴权中间件 |
| 素材商城 | 未验证 | store.js + store.js 视图存在，模拟支付 |
| 企业版与私有化 | 仅 README 声称 | enterpriseService.js 存在，但 SSO/SAML/OIDC 代码未深入验证 |
| 移动端与 PWA | 未验证 | viewport meta 存在，响应式 CSS 存在，但未在真机上验证 |

---

## 四、测试与本地运行结果

### 4.1 测试执行结果

```
命令：npm test（NODE_ENV=test node --test tests/*.test.js）
结果：439 tests / 53 suites
      439 pass / 0 fail / 0 skip
      耗时：~55 秒
```

**2026-10-05 修订说明：**

- 修复 `d28a368`（Phase 1 各阶段模型可自定义）引入的 10 个回归：`videoService.generateShot` 无条件调用 `getVideoProviderForProject`，绕过了 `videoService.provider` 注入点，导致 `directorMode` / `videoStylingPrompt` 的 stub provider 拿不到 prompt。
- `titleSequence` 用例：补齐 `python3` + Pillow 后本机全通过；Linux/容器通过 Dockerfile 预装 `fonts-noto-cjk`，缺少运行时则用例跳过而非失败。
- `videoParallel` 并发用例改为确定性断言（统计最大在飞并发数），不再依赖 ffmpeg 墙钟耗时。

**历史 eslint 错误：**

- 全仓 47 个历史 eslint error（非本期新增，未修复）

### 4.2 本地 E2E 验证结果

**环境：** Node.js 20 + ffmpeg 4.4.2 + mock provider（无需 API Key）

| 步骤 | 操作 | 结果 |
|-|-|-|
| 1 | 启动服务器 | ✅ 成功，http://localhost:3000/health 返回 ok |
| 2 | 创建项目 | ✅ 成功，返回项目 ID |
| 3 | 生成剧本 | ✅ 成功，15 秒目标时长生成 4 个分镜，自动同步到项目镜头列表 |
| 4 | 生成单镜视频 | ✅ 成功，12 秒内完成（mock 用 ffmpeg 生成占位视频） |
| 5 | 合成导出 | ✅ 成功，输出 MP4 文件到 storage/exports/ |

**关键发现：**

- 脚本接口返回的分镜 shotId 与项目内实际保存的 shotId **不一致**（脚本 Service 生成 UUID → 项目 addShot 又生成新 UUID）。前端正常流程无此问题（直接读取项目镜头列表），但直接调用 API 时需注意使用项目详情中的 shotId。
- 批量生成、配音字幕、风格注入、导演模式等链路因时间限制未逐一 E2E，但核心单镜链路已跑通。

### 4.3 关键端点可用性（快速探测）

| 端点 | 状态 | 备注 |
|-|-|-|
| GET /health | ✅ 200 | 正常 |
| POST /api/projects | ✅ 201 | 正常 |
| POST /api/script/generate | ✅ 200 | 正常，含 moderation |
| POST /api/video/generate | ✅ 202 | 正常，异步生成 |
| POST /api/export/project/:id/sync | ✅ 200 | 有完成镜头时正常导出 |
| GET /api/directors | ✅ 200 | 返回 5 位导演 |
| GET /api/title-sequences | ✅ 200 | 返回 4 套模板 |
| GET /api/templates | ✅ 200 | 返回 10 个内置模板 |
| GET /api/styles | ✅ 200 | 返回 15+ 风格 |
| GET /api/scenes | ✅ 200 | 返回 22 个内置场景 |
| GET /api/dubbing/voices | ✅ 200 | 返回 5 种预设音色 |

---

## 五、MVP 范围建议

### 5.1 当前代码库已覆盖的 MVP 能力

以「输入文字/图片生成短视频」为 MVP 目标，代码库已具备的**可用能力**：

1. **项目创建与管理** — 完整可用
2. **AI 剧本生成** — mock 模式下可用（接入 OpenAI 后真实可用）
3. **分镜同步到镜头列表** — 完整可用
4. **单镜/批量视频生成** — mock 模式下可用（接入 Runway/Pika 后真实可用）
5. **角色创建与参考图锁定** — 代码完整
6. **视频合成导出（含字幕）** — 完整可用
7. **导演风格/场景/造型 prompt 注入** — 代码完整

### 5.2 距离可发布 MVP 的差距

| 差距项 | 严重程度 | 说明 |
|-|-|-|
| 无真实 AI 模型接入 | P0 | 当前全部 mock，需配置 API Key 才能产出真实视频/剧本/配音 |
| 数据持久化为本地 JSON | P0 | 无数据库，无法多实例部署，重启后数据在但无法水平扩展 |
| 无用户认证（仅有 JWT 框架） | P1 | 默认使用 default 用户，真实用户系统需补充注册流程 |
| 前端为原生 JS，维护成本高 | P1 | 无组件化框架，长期迭代 technical debt 高 |
| 无真实支付接入 | P1 | Stripe 仅预留接口，订阅系统为模拟 |
| 无云存储（视频/图片） | P1 | 全部存在本地磁盘，无法做 CDN 分发 |
| 无 CI/CD 流水线 | P2 | 仅 Docker 配置，无构建/部署自动化 |
| 无日志聚合与监控 | P2 | 仅有控制台日志，无结构化日志与告警 |

### 5.3 建议 MVP 范围

**最小可发布集（MVP Core）：**

- 项目创建 + AI 剧本生成（接入 OpenAI 或兼容 API）
- 单镜视频生成（接入 1 个真实视频模型，如 Runway）
- 视频合成导出（ffmpeg 已有）
- 基础用户认证（JWT 已有，需补齐注册页）
- 额度限制（已有配额系统）

**MVP+（发布后 2-4 周）：**

- 角色参考图注入 + 一致性评分
- 配音 + 字幕（接入 ElevenLabs 或兼容 TTS）
- 导演风格/场景选择
- 项目分享链接

---

## 六、云端部署路径建议

### 6.1 部署可行性评估

**当前状态：可容器化部署，但需关键适配才能上线。**

| 部署目标 | 可行性 | 需适配内容 |
|-|-|-|
| 单机 Docker（VPS/云服务器） | ✅ 高 | 直接 `docker-compose up` 即可运行 |
| 平台即服务（Railway/Render/ fly.io） | ⚠️ 中 | 需解决无状态化（JSON 存储 → 外挂卷或数据库） |
| Kubernetes | ⚠️ 中 | 需 StatefulSet + PVC 挂载存储卷，或多实例共享存储方案 |
| Serverless（Vercel/Cloud Functions） | ❌ 低 | 不适合：ffmpeg 依赖大、有状态、长时任务 |

### 6.2 推荐部署路径

**阶段一：快速上线（1-2 周）**

- 目标：单台云服务器（如阿里云 ECS / AWS EC2）
- 方案：Docker Compose 单机部署
- 存储：本地 volume 挂载（足够支持 MVP 阶段用户量）
- 域名 + Nginx 反向代理 + HTTPS（Let's Encrypt）
- 成本：低

**阶段二：生产级（1-2 月）**

- 数据库迁移：将 JSON 文件存储替换为 PostgreSQL / MongoDB

  - projectService、userService、studioService 等需重写持久化层
  - 建议保留现有 Model 接口，替换 storageService 实现
- 对象存储：视频/图片上传至 OSS/S3，URL 指向 CDN
- 异步队列：视频生成改为消息队列（Redis/Bull/RabbitMQ），解耦 API 与生成任务
- 多实例：无状态化后可通过负载均衡水平扩展 API 层

**阶段三：高可用（3-6 月）**

- K8s 编排
- 独立视频生成 Worker 节点（GPU 实例）
- 监控：Prometheus + Grafana
- 日志：ELK / Loki

### 6.3 部署风险

| 风险 | 等级 | 缓解措施 |
|-|-|-|
| JSON 存储并发写入损坏 | 高 | 短期：确保单实例运行；中期：迁移数据库 |
| ffmpeg 资源消耗导致 OOM | 中 | 限制并发生成数（VIDEO_MAX_CONCURRENT），设置内存限制 |
| 视频文件堆积占满磁盘 | 中 | 配置定时清理策略，或迁移对象存储 |
| 无健康检查自动恢复 | 中 | Docker 已配置 HEALTHCHECK，配合 restart: unless-stopped |
| 敏感信息硬编码在 .env | 低 | 生产环境使用密钥管理服务（KMS/Secrets Manager） |

---

## 七、P0/P1/P2 风险清单

### P0（阻断上线）

| # | 风险 | 证据 | 建议措施 |
|-|-|-|-|
| 1 | 全部 AI 能力为 mock，无真实模型产出 | 视频/LLM/TTS 默认 mock；真实 Provider 代码存在但未验证 | 接入至少 1 个真实视频模型 + 1 个 LLM + 1 个 TTS；配置 API Key 并做端到端验证 |
| 2 | 数据持久化为本地 JSON，无法支撑多实例 | storageService 直接读写文件系统 | 短期强制单实例部署；中期（MVP 后 4 周内）迁移数据库 |
| 3 | 视频生成异步状态无 WebSocket/SSE 推送 | 前端需轮询获取生成进度 | 增加 SSE 或 WebSocket 推送，或前端轮询（当前已有轮询逻辑） |

### P1（严重影响体验）

| # | 风险 | 证据 | 建议措施 |
|-|-|-|-|
| 4 | 用户系统仅为占位（default 用户） | authOptional 中间件允许所有请求通过 | 补齐注册/登录前端页面，或接入 OAuth（GitHub/Google） |
| 5 | 无云存储，视频无法 CDN 分发 | 视频 URL 为 /storage/videos/xxx.mp4 | 接入 OSS/S3 + CDN，修改 resolveVideoPath 逻辑 |
| 6 | 前端无框架，长期维护成本高 | 原生 JS 约 14,749 行 | MVP 阶段可接受；MVP 后评估迁移至 React/Vue |
| 7 | 额度/订阅系统为模拟 | subscriptionService 无真实支付回调 | 接入 Stripe 或国内支付（支付宝/微信） |
| 8 | 内容审核为本地规则，无 AI 审核 | contentModerationService 基于关键词/规则匹配 | 接入第三方内容审核 API（如阿里云绿网） |
| 9 | 片头标题卡渲染依赖系统字体 | 缺失字体时片头自动回退、测试跳过 | 已在 Dockerfile 预装 `fonts-noto-cjk`；仍可评估改用 Canvas/Sharp 替代 Pillow |

### P2（优化项）

| # | 风险 | 证据 | 建议措施 |
|-|-|-|-|
| 10 | 47 个历史 eslint error | `npm run lint` 输出 | 安排一次技术债清理 Sprint |
| 11 | 无 API 限流，易受滥用 | server.js 中未配置 rate limiter | 增加 express-rate-limit |
| 12 | 无结构化日志与监控 | 仅有 console/logger 输出 | 接入 Winston + Logstash 或 APM |
| 13 | 视频生成失败无自动重试 | videoService 中失败即标记 failed | 增加有限次自动重试 + 降级策略 |
| 14 | 无数据备份机制 | db.json 单文件 | 配置定时备份到远程存储 |

---

## 八、总结

**代码库健康度：良好。**

- **结构清晰**：分层明确（Routes → Services → Providers → Models），Provider 抽象层设计合理，便于切换真实模型。
- **测试覆盖较全**：439 个测试覆盖核心 Service，全部通过。
- **核心链路可运行**：创建项目 → 生成剧本 → 生成镜头 → 导出成片，mock 模式下端到端可跑通。
- **功能丰富度过剩于 MVP**：README 宣称的功能远超 MVP 所需，大量 P1/P2 功能（广场、挑战、商城、企业版）代码已存在，但多数未经真实模型验证。

**最大阻碍上线的因素：**

1. 全部为 mock 模式，需接入真实 AI 服务
2. JSON 文件存储无法支撑生产环境
3. 用户认证为占位实现

**建议后续执行优先级：**

1. 接入真实视频生成模型（Runway/Pika）并验证核心链路
2. 将 JSON 存储迁移至数据库（保留现有接口，替换 storageService）
3. 补齐用户注册/登录前端
4. 单机 Docker 部署上线，验证真实用户场景
5. 逐步迭代社区/协作/商业化功能
