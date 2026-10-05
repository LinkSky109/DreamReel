# DreamReel / 梦卷

> AI 短片创作平台 — 从一句话想法到成片输出

DreamReel 让每个人都能像做梦一样拍电影。覆盖剧本、分镜、生成、配音、字幕全链路，核心解决 AI 视频角色/场景不一致和创作流程碎片化两大痛点。

## 功能总览

### 核心创作（P0）

| 功能 | 说明 |
|------|------|
| AI 视频生成 | 集成主流模型，prompt → 短片，支持单镜/批量/并行生成（默认 3 并发）；**单镜头重生成 + 多版本候选（3个）+ 镜头锁定**，批量生成自动跳过已锁定镜头 |
| 智能剧本助手 | 一句话 → 完整分镜脚本（含角色、台词、运镜、时长） |
| 角色/场景一致性 | 角色锁定 + 参考图注入 + 一致性评分；**角色表情动作库（12种表情 + 10种动作 + 5种位置，按镜头逐角色配置并自动注入 prompt）**；**角色造型室（服装/妆容/整体造型）在镜头生成时自动注入该镜头关联角色的造型 prompt，服务重启后造型不丢失** |
| 场景库 | **22 个内置场景（科幻/自然/城市/室内/奇幻 5 大类），支持用户自定义场景 CRUD，镜头中快速选择并自动关联** |
| 可视化故事板 | **横向时间轴展示所有镜头，支持拖拽排序，实时显示总时长，已生成镜头显示缩略图** |
| 一键配音 + 字幕 | 多语种旁白 + SRT 字幕自动生成，5 种预设音色；**多角色对话配音（按角色自动识别台词并分配独立音色、句间停顿控制、多段时间轴拼接）；BGM 库（20首/9种情绪，AI 推荐）+ 音效库（30个/6类）+ 三轨音量独立调节（配音/BGM/音效）+ BGM 淡入淡出；字幕样式自定义（字体/字号/颜色/描边/位置/粗斜体/阴影 + 双语字幕 + 实时预览）** |
| 镜头衔接与一致性 | **上一镜头尾帧作为下一镜头参考图（img2img，顺序生成时自动衔接）；全局视觉风格锁定（色温/饱和度/对比度/亮度，生成时自动注入）；场景与角色连续性自动检查并给出提示** |
| 视频合成导出 | ffmpeg 合成多镜头成片，含配音字幕，MP4 输出；**导出时自动三轨混音（amix）** |

### 差异化亮点（P1）

| 功能 | 说明 |
|------|------|
| 风格迁移工坊 | 10 种导演风格预设（诺兰、韦斯·安德森、昆汀、王家卫、吉卜力等），自动注入 prompt 修饰词 |
| 模板市场 | 6 个内置模板（产品广告、旅行 Vlog、故事短片、知识科普、社媒推广、音乐可视化），一键创建 |
| AI 影评分析 | 四维评分（镜头语言/叙事结构/节奏控制/角色一致性）+ 逐镜点评 + 改进建议 |
| 协作共创空间 | 评论系统（按镜头筛选/标记解决）+ 活动记录时间线 + 项目公开分享链接 |
| AI 海报与封面 | **基于剧本/镜头自动生成海报文案与版式，3 种比例（竖版海报/横版封面/方形社媒）× 4 种视觉风格，实时预览** |
| AI 预告片 | **自动挑选高光镜头（特写/对话/已生成优先），生成悬念字幕 + 短镜头快节奏序列 + 标题卡，目标时长可调** |
| 创意片头 | **4 套片头模板（黑底金字经典/故障赛博/水墨国风/霓虹复古），片名与副标题真实绘制上屏（Pillow 渲染标题卡 PNG → ffmpeg loop 合成），3-5 秒 mp4 含静音音轨，可一键插入项目最前；musicMood 为 BGM 选曲建议**（顶部导航「🎞️ 片头」进入） |
| 导演模式 | **5 位导演档案（黑色电影·暗夜低语 / 都市迷离·王家卫式 / 冷峻对称·库布里克式 / 爆裂商业·动作大片 / 治愈自然·吉卜力式），一键为全部分镜编排运镜、镜头时长节奏与角色表演指导，导演指令真实注入视频生成 prompt；含导演阐述与逐镜指导表、可随时开关；配乐情绪仅为 BGM 选曲建议、不自动生成配乐**（顶部导航「🎬 导演」进入） |
| 剧场计划厂牌 | **厂牌 Studio（名称/简介/logo/风格定位/主理人），厂牌下聚合剧集 Shows 与作品、签约创作者；厂牌广场与厂牌详情，作品可归入厂牌或具体剧集并回写作品归属、自动去重**（顶部导航「🎭 剧场」进入） |
| 创作者主页 | **创作者资料编辑、作品网格、作品统计（数量/总时长/完成/获赞），支持公开主页链接** |
| 作品广场 | **公开作品流，7 大分类筛选 + 最新/最热排序，支持播放统计与点赞（防重复），点击作者跳转主页** |
| 创作挑战 | **官方主题挑战（主题/规则/周期/奖励），一键参与创建投稿项目，挑战详情含按热度排行的作品榜** |
| 团队协作空间 | **创建团队、邀请成员并分配角色（所有者/编辑者/查看者，权限分级），团队项目共享与团队工作台** |
| API 开放平台 | **API Key 创建/吊销、Bearer 鉴权与权限范围（project:read/write、video:generate），开放接口创建项目/生成视频/查询，含开发者控制台与用量统计** |
| 素材商城 | **风格/模板/音效素材包浏览与分类筛选，免费领取或付费购买（模拟支付），我的素材资产与订单记录** |
| 企业版与私有化 | **企业管理概览（团队/成员/项目归集）、SSO(SAML/OIDC)与安全策略（IP白名单/水印/禁止公开分享/数据驻留）、审计日志查询、私有化部署信息** |
| 移动端与 PWA | **响应式适配（小屏紧凑导航/单列/横向滚动标签）、触屏优化（≥40px 触控目标、底部导航栏）、PWA 可安装到主屏幕、Service Worker 离线应用外壳** |

### 账户与商业化

| 功能 | 说明 |
|------|------|
| 用户认证 | 注册/登录/JWT，scrypt 密码哈希，未登录自动使用 default 用户 |
| 订阅付费 | 4 档计划（免费¥0/基础¥29/专业¥99/企业¥499），模拟支付，Stripe 接口预留 |
| 额度系统 | 按订阅计划动态读取额度，视频生成次数/配音时长/分辨率/角色数限制 |
| 数据统计 | 仪表盘（概览/14天趋势/风格分布/平台分布/额度使用/完成率） |

### 项目管理

| 功能 | 说明 |
|------|------|
| 项目搜索筛选 | 搜索框 + 状态/风格/平台/标签/收藏/归档/排序 7 维筛选 |
| 项目标签 | 自定义标签，最多显示 3 个 + 更多 |
| 项目收藏 | 星标收藏，筛选仅看收藏 |
| 项目归档 | 归档/取消归档，默认列表排除归档项目 |
| 项目复制 | 深拷贝项目，镜头状态重置为 pending，不复制视频文件 |
| 批量操作 | 多选模式，批量删除/归档/收藏 |
| 项目版本历史 | 自动保存 + 手动保存，一键回滚，版本对比，最多 50 个版本 |
| 项目导出/导入 | JSON 格式导出/导入，支持跨设备迁移 |
| 项目封面 | 从视频自动提取首帧作为项目封面 |

### 产品体验

| 功能 | 说明 |
|------|------|
| 数据持久化 | JSON 文件存储，debounce 异步落盘，原子写入，启动自动加载 |
| 通知系统 | 8 种通知类型，未读角标，30 秒轮询刷新 |
| 内容审核 | 6 大类别（暴力/色情/仇恨/违法/自残/毒品），3 级分级，审计日志 |
| 键盘快捷键 | 全局 + 编辑器快捷键，Vim 风格双键序列，? 帮助面板 |
| 暗色/亮色主题 | 一键切换，自动检测系统偏好，localStorage 持久化 |
| 多语言支持 | 中英文切换，核心界面全面国际化 |
| 多 Provider 支持 | 视频（Mock/Runway/Pika）、LLM（Mock/OpenAI）、TTS（Mock/ElevenLabs） |
| 系统设置页面 | Provider 状态 + 系统信息 + 配置摘要 |
| API 文档 | 40+ 端点文档，在线浏览 |
| Docker 部署 | 一键容器化部署 |

## 技术栈

- **运行时**: Node.js >= 18
- **框架**: Express 4
- **语言**: JavaScript (ES Modules)
- **视频处理**: ffmpeg（合成、拼接、配音、缩略图提取）
- **测试**: Node.js built-in test runner（365 个测试）
- **代码规范**: ESLint + Prettier
- **提交规范**: Conventional Commits
- **认证**: JWT (HMAC-SHA256, 零依赖)
- **密码哈希**: scrypt (Node.js 内置 crypto)

## 快速开始

### 本地运行

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env

# 启动服务器（默认 mock 模式，无需 API Key）
npm start

# 打开浏览器访问
open http://localhost:3000

# 运行测试
npm test
```

> **创意片头渲染依赖（可选）**：片头的片名/副标题上屏由 Python + Pillow 绘制标题卡（`scripts/render_title_card.py`），再由 ffmpeg 合成。本机需具备 `python3`、`pip install pillow` 及系统中文字体（macOS 自带 Songti/STHeiti，开箱可用）。缺少该运行时，片头会自动回退为纯色氛围背景，并在接口返回中如实标记 `titleRendered:false`，不影响其余功能。Docker 部署需在镜像中预装 Python3 + Pillow。

### Docker 部署

```bash
# 构建并启动
docker-compose up -d

# 访问
open http://localhost:3000

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

### 完整创作流程

1. **创建项目** — 从模板创建或空白创建
2. **生成剧本** — 输入一句话想法，AI 扩写为完整分镜脚本
3. **锁定角色** — 创建角色并上传参考图，保持多镜头形象一致
4. **选择风格** — 选择导演风格（诺兰/韦斯·安德森等）
5. **生成视频** — 单镜或批量生成，实时预览
6. **配音字幕** — 选择音色和语言，一键生成
7. **导出成片** — 合成 MP4，含配音字幕，可下载
8. **AI 影评** — 获取专业级镜头语言和叙事结构分析
9. **协作分享** — 邀请评论，生成公开分享链接

## API 端点

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 项目详情 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/projects/:id/thumbnail` | 生成项目封面 |

### 剧本

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/script/generate` | AI 生成剧本 |
| POST | `/api/script/revise` | 修改剧本 |

### 视频生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/video/generate` | 生成单个镜头 |
| POST | `/api/video/generate-all/:projectId` | 批量生成所有镜头（并行，默认 3 并发） |

> 批量生成采用并行引擎，可通过 `VIDEO_MAX_CONCURRENT` 环境变量调整并发数。相比串行生成，4 个镜头的生成时间从 ~22 秒缩短至 ~14 秒。

### 角色

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/characters` | 创建角色 |
| POST | `/api/characters/:id/lock` | 锁定角色（添加参考图） |
| POST | `/api/characters/:id/evaluate` | 评估角色一致性 |
| PATCH | `/api/characters/:id/styling` | 更新角色造型（wardrobe 服装 / makeup 妆容 / styling 整体风格），生成视频时自动注入该角色造型 prompt |

### 创意片头

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/title-sequences` | 片头模板列表（4 套模板，含 id/name/visualDescription/musicMood/ffmpeg 标题卡参数） |
| POST | `/api/title-sequences/:id/generate` | 生成 3-5 秒片头 mp4，body `{ projectId, title, subtitle }`，返回 `videoUrl/duration/titleRendered/audioTrack/audio`；片名与副标题真实上屏，视频含静音音轨（`audio:'silent'`），`musicMood` 是 BGM 选曲情绪建议而非自带配乐 |

### 导演模式

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/directors` | 导演档案列表（5 位，含运镜/节奏/表演/色调光影/配乐情绪/导演阐述） |
| GET | `/api/directors/:id` | 单个导演档案（不存在 → 404） |
| POST | `/api/directors/:id/apply` | 启用导演并为项目全部分镜编排运镜/时长/表演指导，body `{ projectId }`，返回 `{ director, project, guidance }`；缺 projectId → 400，未知导演/项目 → 404 |
| POST | `/api/directors/disable` | 关闭导演模式（停止向 prompt 注入，保留导演选择与已生成指导），body `{ projectId }`；缺 projectId → 400，未知项目 → 404 |

> 导演模式本质是 **prompt 编排增强**：应用后每个分镜的 cameraMovement / duration / directorGuidance 真实写入项目，生成视频时导演指令（本镜运镜、节奏、表演指导、色调光影、配乐情绪建议）真实拼入**发给视频模型的最终 prompt**；关闭或选择未知导演时不污染 prompt。`配乐情绪` 仅为 BGM 选曲参考，导演模式**不会自动生成配乐或视频**。

### 剧场计划厂牌

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/studios` | 厂牌广场列表 |
| POST | `/api/studios` | 创建厂牌，body `{ name, description, logo, stylePositioning, curatorName }`（name 空 → 400，成功 201） |
| GET | `/api/studios/:id` | 厂牌详情（含签约成员、剧集、聚合作品与计数；不存在 → 404） |
| PUT | `/api/studios/:id` | 更新厂牌资料 |
| POST | `/api/studios/:id/members` | 签约创作者，body `{ userId, name, role }`（重复签约 → 400） |
| DELETE | `/api/studios/:id/members/:userId` | 移除签约成员 |
| POST | `/api/studios/:id/shows` | 创建剧集 Show，body `{ title, synopsis, coverIcon }`（title 空 → 400，成功 201） |
| GET | `/api/studios/:id/shows` | 厂牌剧集列表 |
| GET | `/api/studios/:id/shows/:showId` | 剧集详情（含其下作品；剧集不存在 → 404） |
| POST | `/api/studios/:id/projects/:projectId` | 把作品归入厂牌（项目不存在 → 404），回写 `project.studioId` |
| GET | `/api/studios/:id/projects` | 厂牌全部作品 |
| POST | `/api/studios/:id/shows/:showId/projects/:projectId` | 把作品归入剧集（自动并入厂牌、重复归入自动去重） |

### 配音字幕

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/dubbing/generate` | 生成配音 + 字幕 |
| GET | `/api/dubbing/voices` | 可用音色列表 |
| POST | `/api/dubbing/preview` | 预览单句配音 |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/export/project/:id` | 异步导出成片 |
| POST | `/api/export/project/:id/sync` | 同步导出成片 |
| GET | `/api/export/project/:id/history` | 导出历史 |

### 模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 模板列表（支持分类筛选） |
| GET | `/api/templates/:id` | 模板详情 |
| POST | `/api/templates/:id/create` | 从模板创建项目 |

### 风格

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/styles` | 风格列表 |
| GET | `/api/styles/:id` | 风格详情 |
| POST | `/api/styles/preview` | 风格 prompt 预览 |

### AI 影评

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analysis/project/:id` | 异步触发分析 |
| POST | `/api/analysis/project/:id/sync` | 同步分析 |
| GET | `/api/analysis/project/:id` | 获取分析结果 |

### 协作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/collab/:id/comments` | 评论列表（支持按镜头筛选） |
| POST | `/api/collab/:id/comments` | 添加评论 |
| PATCH | `/api/collab/:id/comments/:cid/resolve` | 标记评论已解决 |
| DELETE | `/api/collab/:id/comments/:cid` | 删除评论 |
| GET | `/api/collab/:id/activities` | 活动记录 |
| GET | `/api/collab/:id/share` | 获取分享设置 |
| PUT | `/api/collab/:id/share` | 更新分享设置 |
| GET | `/api/collab/shared/:token` | 通过分享链接访问 |

### 额度

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/quota/:userId` | 额度概览 |

### Provider 配置（Phase 1 — 各阶段模型可自定义）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/providers/available` | 获取全部可用 Provider 目录（含 configured 状态） |
| GET | `/api/providers/available?stage=video` | 按阶段过滤 Provider 目录 |
| GET | `/api/projects/:id/model-config` | 获取项目级 Provider 配置 + 实际生效值 |
| PUT | `/api/projects/:id/model-config` | 更新项目级 Provider 配置（仅所有者/管理员） |
| GET | `/api/auth/me/model-preferences` | 获取用户全局默认 Provider 偏好 + 实际生效值 |
| PUT | `/api/auth/me/model-preferences` | 更新用户全局默认 Provider 偏好 |

> **四级回退链**：项目级配置 → 用户全局默认 → 系统全局默认（`.env`）→ Mock。每次回退前校验目标 Provider 是否已配置 API Key；未配置则自动置灰不可选。切换 Provider 不影响已生成内容（任务级 Provider 快照）。

## 项目结构

```
DreamReel/
├── public/                    # 前端（SPA）
│   ├── index.html             # 主页面
│   ├── css/style.css          # 暗色电影感样式
│   └── js/
│       ├── api.js             # API 客户端
│       ├── app.js             # 应用入口 + 路由
│       └── views/
│           ├── projectList.js # 项目列表页（含模板画廊）
│           ├── directors.js   # 导演模式页
│           ├── studios.js     # 剧场厂牌广场/详情
│           ├── titleSequences.js # 创意片头页
│           └── editor.js      # 编辑器（6 标签页）
├── src/
│   ├── config/                # 配置管理（含额度配置）
│   │   └── directorProfiles.js # 导演档案库 + 编排纯函数
│   ├── models/                # 数据模型
│   │   ├── project.js
│   │   ├── character.js
│   │   ├── scene.js
│   │   ├── shot.js
│   │   └── Studio.js          # 剧场厂牌模型（成员/剧集/作品）
│   ├── providers/             # AI Provider 抽象层
│   │   ├── baseVideoProvider.js
│   │   ├── mockVideoProvider.js
│   │   ├── runwayVideoProvider.js
│   │   ├── baseLLMProvider.js
│   │   ├── mockLLMProvider.js
│   │   ├── openaiLLMProvider.js
│   │   ├── baseTTSProvider.js
│   │   ├── mockTTSProvider.js
│   │   └── *Factory.js        # 工厂模式
│   ├── services/              # 业务逻辑层
│   │   ├── projectService.js
│   │   ├── scriptService.js
│   │   ├── videoService.js
│   │   ├── characterService.js
│   │   ├── dubbingService.js
│   │   ├── videoCompositingService.js
│   │   ├── storageService.js
│   │   ├── quotaService.js
│   │   ├── templateService.js
│   │   ├── styleService.js
│   │   ├── filmAnalysisService.js
│   │   ├── collaborationService.js
│   │   ├── thumbnailService.js
│   │   ├── directorService.js  # 导演模式（应用/编排/开关）
│   │   ├── studioService.js    # 剧场厂牌（成员/剧集/作品归入）
│   │   └── exportHistoryService.js
│   ├── routes/                # API 路由（含 directors / studios 等模块）
│   ├── utils/
│   │   ├── ffmpeg.js          # ffmpeg 封装
│   │   ├── titleCard.js       # 片头标题卡渲染（调用 python Pillow）
│   │   └── logger.js
│   └── server.js              # Express 入口
├── tests/                     # 测试（*.test.js）
├── scripts/
│   └── render_title_card.py   # Pillow 渲染片头标题卡 PNG（中文宋体/黑体）
├── docs/
│   └── PRD.md                 # 产品需求文档
├── storage/                   # 运行时数据（gitignore）
│   ├── videos/                # 镜头视频
│   ├── exports/               # 导出成片
│   ├── audio/                 # 配音文件
│   ├── thumbnails/            # 项目封面
│   └── data/db.json           # 持久化数据
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## 配置说明

默认使用 `mock` provider，无需任何 API Key 即可运行和测试。Mock 模式下视频由 ffmpeg 生成真实占位视频。

接入真实服务时，在 `.env` 中配置：

```bash
# 视频生成（mock / runway）
VIDEO_PROVIDER=runway
RUNWAY_API_KEY=your_key

# 剧本生成（mock / openai）
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1

# 配音（mock）
TTS_PROVIDER=mock

# 免费额度配置
VIDEO_GENERATIONS_PER_DAY=5
DUBBING_MINUTES_PER_MONTH=10
MAX_DURATION_SECONDS=5
MAX_RESOLUTION=720p
```

## 免费额度

| 资源 | 免费额度 |
|------|----------|
| 视频生成 | 5 次/天 |
| 配音时长 | 10 分钟/月 |
| 单镜时长 | 最长 5 秒 |
| 分辨率 | 最高 720p |
| 角色数量 | 最多 3 个/项目 |

## 开发规范

遵循 [everything-claude-code-conventions](https://github.com/affaan-m/everything-claude-code)：

- 文件命名：camelCase
- 函数命名：camelCase
- 类命名：PascalCase
- 常量命名：SCREAMING_SNAKE_CASE
- 导入：相对路径
- 错误处理：try-catch
- 提交信息：Conventional Commits（`feat:` / `fix:` / `docs:` / `test:`）

## 路线图

- **Now (MVP)**: 核心闭环 — 剧本→生成→配音→导出 ✅
- **Next (P1)**: 风格迁移、模板市场、AI 影评、协作空间 ✅
- **Later (P2)**: 真实模型接入、用户注册登录、订阅付费、移动端、API 开放平台 ✅
- **Sprint 11–12**: 多模型矩阵、剧本改编、角色造型室、广场一键复刻、创意片头 ✅
- **Sprint 13**: 导演模式（导演 prompt 编排）、剧场计划厂牌体系 ✅
- **Phase 1**: 各阶段模型可自定义 — 全局偏好 + 项目级 Provider 配置 + 四级回退链 ✅
- **Sprint 14（计划中）**: 画布五 tab 整合、图片生成 / 音频生成独立 tab、智能剪辑模块

> 各 Sprint 的范围与证据见 `docs/sprint*-delivery-report.md`，对标 LibTV 的差距分析见 `docs/sprint11-gap-analysis.md`。

详见 [docs/PRD.md](docs/PRD.md)

## License

MIT
