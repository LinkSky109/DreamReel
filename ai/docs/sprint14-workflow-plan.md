# DreamReel Sprint 14 持续工作流执行规划

- 规划日期：2026-10-05
- 任务 ID：`TASK-20261005-014`
- 任务名称：`DreamReel Sprint 14: 五合一画布 + 图片生成 + 工程收口`
- 技能：`agent-continuous-workflow`
- 需求分析：`docs/sprint14-requirements-analysis.md`
- 工作流上下文：`.workflow/context-sprint14.yaml`
- 当前状态：`GLOBAL_PENDING`（需求已录入、规划已就绪，等待“需求确认 / 启动开发”事件）

---

## 一、范围裁决

完整需求分析覆盖 R31–R35。执行规划采用两波交付：

| 波次 | 范围 | 状态 | 说明 |
|---|---|---|---|
| Wave 1（本期 Sprint 14） | R31 五合一画布、R32 图片生成、R35 工程收口 | 本期执行 | 74h 估算，互相有依赖：R32 挂载到 R31 的图片 tab，R35 保障测试不污染 |
| Wave 2（Sprint 15 预备） | R33 音频生成、R34 智能剪辑 | 本期只做上下文占位 | 98h 估算，触达 editor.js 与 ffmpeg 深层能力，独立成期 |

---

## 二、全局状态机与流转

```
GLOBAL_PENDING
  --需求确认 / 启动开发--> GLOBAL_IN_DEV
  --开发阻塞--> GLOBAL_DEV_BLOCKED
  --开发完成 DEV_DONE--> GLOBAL_IN_TEST
  --测试阻塞--> GLOBAL_TEST_BLOCKED
  --测试通过 TEST_PASSED--> GLOBAL_IN_CONSISTENCY
  --一致性通过 CONSISTENCY_PASS--> GLOBAL_DONE
```

每个流转都必须有可复核证据：

| 流转点 | 准入条件 | 准出证据 |
|---|---|---|
| PENDING -> IN_DEV | 需求分析确认；基线锁定；文件所有权冻结 | `context-sprint14.yaml` state_log；基线 439 pass / 47 lint error |
| IN_DEV -> IN_TEST | 功能完成；新增测试；新增文件 lint 0 error | `npm test` 全绿；`node --check`；变更清单 |
| IN_TEST -> IN_CONSISTENCY | 接口 / 页面 / 重启持久化均通过 | 测试报告 + curl/HTTP 证据 + 前端浏览器冒烟 |
| IN_CONSISTENCY -> DONE | 代码 / 环境 / 数据 / 文档四维一致 | 独立 PM 复核 PASS + README 同步 + 交付报告 |

---

## 三、节点定义

### NODE_PLAN_001 需求分析与范围冻结

- pre_state：`GLOBAL_PENDING`
- executor：orchestrator + product_lens
- 动作：
  - 读 Sprint 11 差距分析、Sprint 13 交付报告与当前代码基线
  - 产出 R31–R35 需求分析
  - 裁决 Wave 1 / Wave 2
- 准出：
  - `docs/sprint14-requirements-analysis.md` 完成
  - 每个需求有用户故事、范围、非目标、验收标准、估算
  - Wave 1 范围不超过 3 个需求
- 异常：需求歧义 -> `E009`，创建确认项，不进入开发

### NODE_DEV_101 基线锁定与文件所有权冻结

- pre_state：`GLOBAL_IN_DEV`
- executor：orchestrator
- 动作：
  - 运行 `npm test`、`npx eslint src/ tests/`
  - 记录 git 分支、未提交改动、测试数、lint 数
  - 冻结文件所有权
- 准出：
  - 基线写入上下文
  - 子代理不得触碰未分配文件
- 失败处理：工作区存在与本期冲突的用户改动且无法共存 -> `DEV_BLOCKED`

### NODE_DEV_102 R31 画布 IA 重构

- pre_state：`IN_DEV`
- executor：frontend agent
- 输入：现有 8 tab 编辑器、`public/index.html`、`app.js`、`i18n.js`
- 动作：
  - 新增 `editorTabs.js`
  - 一级 5 tab + 二级更多工具
  - URL / localStorage tab 恢复
  - 旧 tab 与键盘事件兼容
- 准出：
  - 五个一级 tab 可达
  - 刷新保持 tab
  - 旧功能入口全部可达
  - 移动端不重叠、不溢出
- 失败处理：样式或路由回归 -> 回退到上一可渲染状态，记录差异

### NODE_DEV_201 R32 图片生成后端

- pre_state：`IN_DEV`
- executor：backend agent
- 输入：video provider factory、quota service、moderation service、storage service
- 动作：
  - image provider 抽象与 Mock PNG 渲染
  - `imageService` 与 `/api/images`
  - `ImageAsset` 持久化与启动加载
  - 图片额度
  - 参考图回填
- 准出：
  - 生成真实 PNG
  - 回填镜头 / 角色 / 场景并重启不丢
  - 审核 / 额度 / 400 / 404 语义正确
  - 新增测试 ≥ 18
- 失败处理：Pillow / 字体不可用 -> 降级无文字 PNG 并返回 `textRendered=false`

### NODE_DEV_202 R32 图片生成前端

- pre_state：`IN_DEV`
- executor：frontend agent
- 输入：R31 tab 框架、`/api/images` 契约
- 动作：
  - 生成表单（prompt / 比例 / 风格 / 数量）
  - 候选网格与资产库
  - 回填镜头 / 角色 / 场景
  - provider 状态与占位说明
- 准出：
  - 生成状态机可见（generating / completed / failed）
  - 空态 / 错误 / 额度不足均有明确反馈
  - 回填成功后对应 tab 可见变化
- 失败处理：接口契约不匹配 -> 冻结后端契约，前端不擅自改字段

### NODE_DEV_301 R35 工程收口

- pre_state：`IN_DEV`
- executor：backend agent + orchestrator
- 动作：
  - 测试注入独立 `STORAGE_PATH`
  - 增加开发库前后计数断言
  - eslint 覆盖 `public/js/**/*.js`
  - 记录存量 error，不清零式重构
- 准出：
  - `npm test` 后开发库项目数不变
  - lint 覆盖前端文件
  - 本期新增文件 0 error

### NODE_REV_001 代码评审与安全扫描

- pre_state：`IN_DEV`
- executor：reviewer agent + security-reviewer
- 动作：
  - diff 审查
  - 输入校验、路径穿越、任意文件写、prompt 注入、额度绕过检查
  - 检查用户既存未提交改动未被覆盖
- 准出：无 CRITICAL / HIGH；MEDIUM 有修复或明确豁免
- 失败处理：`E004`，退回 `IN_DEV`

### NODE_TEST_001 独立测试与端到端验证

- pre_state：`GLOBAL_IN_TEST`
- executor：test agent
- 动作：
  - `npm test`
  - `node --check public/js/**/*.js`
  - 起 PORT=3021 或 3022 服务做 HTTP 冒烟
  - 前端关键流程浏览器走查
  - 重启持久化验证
- 准出：
  - 0 fail
  - 图片生成 -> 回填 -> 视频 prompt 链路证据完整
  - 五 tab 深链刷新可用
  - 测试库隔离前后开发库不变
- 失败处理：`E005` 回归开发；环境问题 `E003`

### NODE_CONSISTENCY_001 一致性校验

- pre_state：`GLOBAL_IN_CONSISTENCY`
- executor：consistency agent
- 动作：
  - 代码：无新依赖、无敏感信息、分支策略、新增文件 lint
  - 环境：Node / ffmpeg / python3 / Pillow / 字体能力实测
  - 数据：ImageAsset、referenceImages、白名单、重启加载
  - 文档：README 功能总览、API 小节、测试数、路线图
- 准出：
  - 四维全部 PASS 或仅有记录在案的降级项
  - 降级项对用户可见，不构成“假能力”
- 失败处理：`E008` 阻断；文档不一致打回开发收口

### NODE_PM_001 产品经理独立复核

- pre_state：`GLOBAL_IN_CONSISTENCY`
- executor：PM agent，只看不改
- 动作：
  - 独立读源码
  - 自跑测试与 lint
  - 自起服务从 HTTP 入口复测
  - 自写 probe 捕获真实下发数据
- 准出：PASS；若 FAIL，列出 blocker/major/minor
- 纪律：复核文档之外不得修改代码

### NODE_DONE_001 交付与归档

- pre_state：`GLOBAL_DONE`
- executor：orchestrator
- 动作：
  - 生成 `docs/sprint14-delivery-report.md`
  - 更新 README 测试数与路线图
  - 清理端口与临时文件
  - 归档上下文
- 准出：交付报告、PM 复核、上下文三件套齐全

---

## 四、子代理与文件所有权

为避免冲突，所有子代理必须遵守以下所有权：

| 角色 | 建议 agent | 允许写 | 禁止写 | 端口 |
|---|---|---|---|---|
| backend | 后端开发子代理 | `src/providers/image*`、`src/services/imageService.js`、`src/routes/images.js`、`src/models/ImageAsset.js`、`tests/image*.test.js` | `public/**`、`editor.js` | 3021 |
| backend-shared | 编排者串行修改 | `src/config/index.js`、`src/server.js`、`src/services/storageService.js`、`src/services/quotaService.js`、`src/services/projectService.js`、`package.json`、`eslint.config.js` | 不与其他后端同时改同一行 | - |
| frontend | 前端开发子代理 | `public/index.html`、`public/js/app.js`、`public/js/api.js`、`public/js/views/editor.js`、`public/js/views/editorTabs.js`、`public/js/views/images.js`、`public/css/style.css` | `src/**` | 3022 |
| test | 测试子代理 | `tests/**`（新增测试文件） | `src/**`、`public/**` | 3023 |
| PM review | 产品复核子代理 | 只新增 `docs/sprint14-pm-review.md` | 其它全部只读 | 3030 / 3031 |
| orchestrator | 主编排 | 收口、共享文件、文档、最终冒烟 | 不覆盖用户既存改动 | 3040 |

**冲突规则**：`editor.js` 只允许 frontend 一个写入者；`server.js`、`config/index.js`、`storageService.js`、`quotaService.js` 由编排者在后端契约冻结后串行修改，避免并行覆盖。

---

## 五、执行顺序

| 顺序 | 步骤 | 依赖 | 产出 |
|---|---|---|---|
| 1 | 锁定基线 | 无 | 基线记录、文件所有权、context |
| 2 | 冻结 R32 API 契约 | 需求分析 | 接口表、错误码、数据模型 |
| 3 | R31 tab 框架先行 | 无 | `editorTabs.js` + 五 tab 骨架 |
| 4 | R32 后端与测试 | 契约冻结 | provider + service + route + tests |
| 5 | R32 前端接入图片 tab | R31 + R32 契约 | 生成 / 资产库 / 回填 |
| 6 | R35 工程收口 | 步骤 4 | 测试隔离 + 前端 lint |
| 7 | CR / 安全扫描 | 3-6 | 评审结论 |
| 8 | 测试与 E2E | 7 | 测试报告 |
| 9 | 一致性校验 | 8 | 四维结论 |
| 10 | PM 独立复核 | 9 | PASS / FAIL |
| 11 | 文档收口与交付 | 10 | 交付报告、README、context 归档 |

---

## 六、SLA 与升级

| 节点 | SLA | 一级 2h | 二级 8h | 三级 24h | 四级 48h |
|---|---|---|---|---|---|
| 开发 | 72h | @负责人 | 同步组长 | 项目风险 | 部门台账 |
| 代码评审 | 24h | @评审人 | 同步负责人 | 项目风险 | 部门台账 |
| 缺陷修复 | 12h | @开发 | 同步负责人 | 项目风险 | 部门台账 |
| 测试 | 48h | @测试 | 同步开发 | 项目风险 | 部门台账 |
| 一致性校验 | 8h | @校验人 | 同步负责人 | 项目风险 | 部门台账 |

总截止：`2026-10-10T23:59:00+08:00`（按客户端 Asia/Shanghai 时区）。

---

## 七、异常处理映射

| 异常码 | 场景 | 处理 |
|---|---|---|
| E001 | 网络 / provider 超时 | 自动重试 3 次，间隔 1/3/5 分钟 |
| E003 | 服务启动 / 部署失败 | 回滚上一稳定状态，清理端口，通知 |
| E004 | lint / 安全阻断 | 退回 `IN_DEV`，附失败文件与行号 |
| E005 | 单元测试失败 | 同步失败用例，禁止改测试规避 |
| E007 | ffmpeg / Pillow / 字体环境不一致 | 能力探测 + 降级 + 如实标记 |
| E008 | ImageAsset / referenceImages schema 不一致 | 阻断发布，生成修复方案 |
| E009 | 需求歧义 | 暂停并创建确认项，不猜着做 |
| E010 | 文件权限 / 端口占用 | 更换端口或路径，记录证据 |

---

## 八、证据要求

### 开发阶段

- `npm test` 原始输出摘要：tests / pass / fail。
- `npx eslint src/ tests/ public/js/` 输出摘要：存量 error 数、新增文件 0 error。
- `node --check` 所有新增/修改前端 JS。
- git diff 文件清单，用户既存改动零覆盖。
- 新增测试文件至少 18 例（图片模块），断言具体字段与边界，不允许只做非空断言。

### 测试阶段

- `GET /health` 200。
- `POST /api/images/generate` 产出真实 PNG，`file` 或 magic bytes 证明。
- `POST /api/images/assets/:id/apply` 回填后 `GET /api/projects/:id` 可见引用。
- stub provider 捕获视频生成 prompt，确认参考图进入 provider 参数。
- `npm test` 前后 `storage/data/db.json` 项目数不变。
- 前端真实浏览器走查：五 tab 切换、刷新保持、图片生成与回填、控制台零 error。

### 一致性阶段

- 代码 / 环境 / 数据 / 文档四维结论。
- ffmpeg、python3、Pillow、字体可用性与降级路径实测。
- README 与实现对齐。

### PM 复核

- PM 自跑命令、自起服务、自写 probe 的证据。
- 只看不改；唯一允许产物为 `docs/sprint14-pm-review.md`。

---

## 九、回滚与暂停策略

| 场景 | 动作 |
|---|---|
| 五 tab 重构导致现有 tab 回归 | 回退 `editorTabs.js` 与导航渲染改动，保留图片后端 |
| 图片 Provider 不可用 | 关闭真实 provider 选择，保留 Mock；UI 明示 provider 状态 |
| Pillow / 字体不可用 | 降级无文字 PNG，接口 `textRendered=false` |
| 测试隔离改动导致全量测试不稳定 | 回退 npm script 改动，改为测试文件级临时目录；不阻塞业务功能 |
| PM 复核 FAIL | 按 blocker -> major -> minor 修复；仅测试 / 数据清理类改动不重开复核，生产逻辑变更必须重开 |
| 用户要求暂停 | 保留 context 与证据，状态置 paused，断点续跑 |

---

## 十、Sprint 15 预备（不在本期执行）

`context-sprint14.yaml` 的 `next_sprint` 记录以下内容，供下一轮直接接续：

- R33：Mock TTS 本地真实化、程序化 BGM/SFX、音频资产库、混音预听。
- R34：editPlan 规则引擎、BPM 对齐、转场能力探测、剪辑方案渲染。
- 前置条件：Wave 1 的五 tab 框架已稳定；音频 / 剪辑各自独立 view 模块；ffmpeg 能力探测结果已归档。

---

## 十一、规划结论

本期规划满足技能要求的状态驱动、闭环自治、边界清晰、可追溯四项原则：

- 所有流转由状态与证据决定，不依赖模糊口令。
- 每个节点都有输入、动作、准出、失败回退。
- 自动执行节点与 PM / 需求确认节点分开，不越权。
- 所有证据落盘到 docs、tests、context，支持断点与审计。

下一步事件：需求确认后，将 `current_global_state` 从 `GLOBAL_PENDING` 置为 `GLOBAL_IN_DEV`，按 NODE_DEV_101 启动 Wave 1。

