# DreamReel Provider 路由、执行级回退与成本度量 — 改造设计方案

> 文档状态：**设计定稿（v1.0，2026-10-17）** —— 5 项关键决策已确认（见 §11.3）
> 适用代码库：`/Users/link/myApp/DreamReel`（Node.js + Express，ESM，文件型存储）
> 本文所有「现状」结论均来自对仓库源码的直接阅读，已在正文用文件路径 + 行号标注。
> 凡标注 **[假设]** / **[待验证]** 的内容为未在代码或官方文档中确认的信息，落地前必须核实。

---

## 1. 目标与非目标

### 1.1 目标（用户需求映射）

| 编号 | 需求 | 本方案对应设计 |
|---|---|---|
| G1 | 按阶段（文本/图片/视频，含 TTS）配置不同供应商与模型，灵活可配 | 统一「路由规则表」+ 主/备 Provider 链（§4、§5） |
| G2 | **执行级回退**：某供应商失败/超时/限流时自动切下一个 | `executionRouter` 跨供应商回退（§6） |
| G3 | 省 token / 省调用成本：提示缓存、按任务难度分流 | 提示缓存友好结构 + `taskType` 路由 + 成本口径（§4.3、§7） |
| G4 | 模型对比：试用并找出最合适模型 | 调用指标埋点 + 聚合对比接口（§4.2、§5、§9） |
| G5 | 接入另一台机器的 ComfyUI 作为视频供应商 | `ComfyuiVideoProvider`（§8） |

### 1.2 非目标（明确不做）

- **N1 不引入外部 LLM 网关**（LiteLLM / new-api / one-api 等）。
  理由（已与用户共识）：外部网关统一的是 **OpenAI 协议**（chat / images / audio / embedding），
  覆盖不到 Runway / Pika / Seedance / Wan / ComfyUI 这类**异步任务型视频协议**（提交任务 → 轮询 → 取产物）。
  强行让视频走网关等于为 5 种私有协议写 5 个 adapter，收益为负。用户已在自研 provider 层有约 70% 地基（`providerResolver` / 4 个 factory / 基类），在其上扩展成本最低。
- **N2 v1 不做"自动质量降级"**：不因为"预期质量"自动换模型（无质量信号、易抖动），见 §6.1、§11。
- **N3 不做多租户计费/开票系统**：成本度量只服务"选型与预算感知"，不对外结算。
- **N4 不让终端用户自由上传 ComfyUI 工作流**：工作流模板由运维/管理员维护，用户只能选模板 + 填空（安全，见 §8.5）。
- **N5 不改动现有四级配置回退语义**（项目→用户→全局→mock），只在其上层叠加执行级回退（§6.5）。

### 1.3 成功标准（可验收）

- S1：文本/图片/视频任一阶段，主 Provider 硬失败（5xx / 超时 / 429 / 空响应）时，**在无人工干预下**由下一顺位 Provider 完成本次调用，且**指标记录能证明发生了回退**（`isFallback=true`、`attempt>1`）。
- S2：任意一次真实或 mock 调用后，`GET /api/providers/metrics` 能返回该 stage/provider/model 的调用次数、成功率、P50/P95 延迟、token（文本）、成本估值字段（无单价时为 `null` 且标 `pricingMissing`）。
- S3：能够对同一 stage 的 ≥2 个模型，基于真实埋点数据产出对比视图（成功率 / 平均延迟 / 平均成本 / 缓存命中率）。
- S4：ComfyUI 作为视频供应商启用后，可通过既有 `videoService.generateShot` 路径产出一个视频文件，且**项目级配置无法覆盖其 baseUrl/token**（SSRF 防护可测）。
- S5：`npm test` 全绿；新增模块单测覆盖回退分类、成本折算、指标写入、ComfyUI 提交/轮询/取消的 mock 分支；开发库隔离护栏（`scripts/run-tests.js`）不被破坏。

---

## 2. 现状与缺口（带代码证据）

### 2.1 已核实的现状

**（A）配置级回退 ≠ 执行级回退**

- `src/providers/providerResolver.js:18-71` `isProviderConfigured(stage, providerName)`：仅判断 env 里的 key 是否存在；
  `llm/opencode` 恒为 `true`（`:44-46`），`mock` 恒为 `true`（`:19`）。
- `src/providers/providerResolver.js:80-151` `resolveProviderConfig`：四级顺序 = 项目级 → 用户级 → 全局默认 → mock，
  每一级进入前先 `isProviderConfigured`，**不可用就落到下一级**。
  → 这是**静态/配置期**回退：只看"有没有配"，不看"调用成不成功"。
- 结论：**目前不存在"调用失败自动换供应商"的能力**。这正是需求 G2 的缺口。

**（B）四个工厂是并行重复结构，缺少统一的实例构造入口**

- 工厂与映射：`llmProviderFactory.js:9-14`（mock/openai/deepseek/opencode）、
  `imageProviderFactory.js:8-11`（mock/openai）、
  `videoProviderFactory.js:17-24`（mock/runway/pika/seedance/minimax/wan）、
  `ttsProviderFactory.js`（同型）。
- 每个工厂都各自 `import { resolveProviderConfig, buildMergedConfig, isProviderConfigured }`（见各文件头部）。
- 各工厂**未导出 `PROVIDER_MAP`**，只导出 `getXxxProviderForProject` 之类函数 → 新增"按 spec 造实例"需先打开这个口子。

**（C）偏好数据模型缺 image，且无 fallbacks 概念**

- `src/models/project.js:81-86`：`providerPreferences = { video, llm, tts, updatedAt }` —— **没有 `image`**。
- `src/models/user.js:14-19`：`defaultProviderPreferences = { video, llm, tts, updatedAt }` —— 同样**没有 `image`**。
- `src/models/NovelProject.js:30`：`providerPreferences = { llm, updatedAt }`。
- 读写入口：`src/routes/projects.js:507-543`（GET model-config）、`:550-…`（PUT model-config）；`src/routes/novels.js:530-556`。
- 前端：`public/js/components/providerSelector.js`（`STAGE_LABELS` 只有 video/llm/tts）、`public/js/views/editor.js:3571,3628`。
- 结论：图片阶段虽然 `imageProviderFactory.getImageProviderForProject`（`:49-66`）支持解析，但因上游模型没有 `image` 字段，**实际只能走全局/用户缺失后的全局默认**。

**（D）重试是同供应商重试，不是跨供应商**

- `src/utils/llmRetry.js:5-19`：`generateJSONWithRetry(llm, params, { attempts=3, backoff=[800,2500] })`，
  循环调用 `llm.generateJSON`，把「空响应 / 解析失败 / 网络错误」都当可重试。**`llm` 实例固定**，无切换。
- `src/providers/openaiLLMProvider.js:17` `maxRetries` 只是类内字段（`config.maxRetries||2`），当前未见用于真正重试循环。

**（E）用量只有次数，无 token / 金额**

- `src/services/storageService.js:186-220`：`usage` 结构 = 日维度 `{ videoGenerations, imageGenerations }`、月维度 `{ dubbingSeconds }`；
  `incrementUsage(userId, type, amount)` 只支持 `video|image|dubbing`。
- 写入点：`src/services/quotaService.js:91,104,117`。
- `src/providers/openaiLLMProvider.js:74,78`：`console` 里打印了 `data.usage` 并 `return { usage }`，**但没有任何持久化**。
- `src/providers/opencodeLLMProvider.js:62`：`return { content, text, usage: result.usage }`，同样未落库。

**（F）视频任务生命周期已为"固定 provider"留口**

- `src/services/videoService.js:42` 取 provider；`:92-106` 将 `provider` 实例存入 `this.activeTasks`；
  `:120-121` 轮询时用 `taskInfo.provider`。
  → 有利：任务启动后切 provider 不会破坏已提交任务；也**意味着"回退"必须在提交阶段决定，或重新提交（见 §6.4 幂等性）**。

**（G）安全惯例已有样板**

- `src/providers/openaiImageProvider.js`：`readLimitedBody`（`:117-138`）、`assertHttpUrl`/`assertSafeRemoteUrl` 拒绝私网（`:85-115`）、下载体积上限（`MAX_IMAGE_BYTES`）。
- `src/providers/imageProviderFactory.js:63-64` 注释明确：**图片 provider 的 baseUrl/apiKey 只取全局配置，忽略项目/用户级覆盖，避免 SSRF 与密钥替换**。
- → ComfyUI 接入必须复用该惯例（§8.5）。

**（H）测试与运行**

- `package.json` `"test": "node scripts/run-tests.js"`。
- `scripts/run-tests.js:34-62`：`node --test --test-concurrency=4`，启动前**强制 `*_PROVIDER=mock` 并清空真实 key**，且校验开发库未被污染（`:71-81`）。
- 已有相关测试：`tests/providerResolver.test.js`、`tests/providerConfigApi.test.js`、`tests/providerIntegration.test.js`。

### 2.2 缺口汇总

| 缺口 | 影响需求 | 证据 |
|---|---|---|
| 无执行级回退（跨供应商） | G2 | §2.1(A) |
| 无统一 Provider 实例构造入口 | G2/G5 | §2.1(B) |
| 偏好模型缺 image、缺 fallbacks | G1/G5 | §2.1(C) |
| 无 token / 成本持久化 | G3/G4 | §2.1(E) |
| 无调用指标（延迟/成功率/成本） | G4 | §2.1(E) |
| 无按任务难度分流 | G3 | 无任何 taskType 概念 |
| 无 ComfyUI provider | G5 | 映射表无该项 |

---

## 3. 总体架构

### 3.1 分层

```
                          ┌────────────────────────────────────────────┐
   前端 (public/js)        │ ProviderSelector(v2) / 路由规则面板 / 对比面板  │
                          └───────────────┬────────────────────────────┘
                                          │ REST
   ┌──────────────────────────────────────▼──────────────────────────────────────┐
   │  routes/providers.js  (+ routes/providerRoutes.js, routes/providerMetrics.js) │
   └───────┬───────────────────────────────┬───────────────────────────┬──────────┘
           │                               │                           │
   ┌───────▼─────────┐          ┌──────────▼───────────┐    ┌──────────▼─────────┐
   │ providerRouter  │          │ metricsStore         │    │ pricingTable       │
   │ (路由规则解析)   │          │ (调用指标 JSONL)      │    │ (单价表, 版本化)    │
   └───────┬─────────┘          └──────────┬───────────┘    └────────────────────┘
           │ resolveRoute(stage,taskType,scope)
   ┌───────▼───────────────────────────────────────────────────────────────────┐
   │ executionRouter.executeWithFallback(stage, taskType, ctx, callFn)          │
   │   for spec of [primary, ...fallbacks]:                                     │
   │     instance = providerRegistry.createProvider(stage, spec)                │
   │     try  result = await callFn(instance, spec)  // 内部含同供应商重试         │
   │     catch → classifyError → recordMetric → 决定 retry-same / switch-next    │
   └───────┬───────────────────────────────────────────────────────────────────┘
           │
   ┌───────▼───────────────────────────────────────────────────────────────────┐
   │ providerRegistry (统一映射: stage → { name → Class }, catalogs, isConfigured) │
   └──┬─────────────┬─────────────┬─────────────┬──────────────────────────────┘
      │             │             │             │
   LLM新 providers   Image         Video       TTS
   (openai/deepseek (openai)      (runway/pika (elevenlabs)
    /opencode/mock)                /seedance/
                                   minimax/wan/
                                   **comfyui**/mock)
```

### 3.2 与现状的关系（最小入侵）

- **保留** `providerResolver`（配置期回退）与四个工厂的**公共 API**（`getXxxProviderForProject` 等）——避免破坏既有调用点（§2.1 的 47 处引用）与测试。
- **新增** `providerRegistry`：把四个工厂的 `PROVIDER_MAP` 收敛成一张 stage→map 的注册表，供 `executionRouter` 按 spec 造实例。原工厂改为从这个注册表取映射（内部重构，导出面不变）。
- **新增** `providerRouter`（规则解析）与 `executionRouter`（执行回退），二者不改变 `resolveProviderConfig` 的语义，只在其结果之上工作：**规则未配置时，执行链退化为"现有解析结果"单元素链**（零行为变化）。

### 3.3 关键取舍（摘要，详见 §11）

1. 规则表**独立于** `providerPreferences`（§→决策点 4）。
2. 指标写入**独立文件（JSONL）**，不写 `db.json`（§7.1）。
3. 回退**只走硬失败**，成本降级为显式开关（§6.1）。
4. 成本用**本地版本化单价表**折算，缺失单价显式置空（§7.3）。

---

## 4. 数据模型

> 所有新模型遵循项目规范：**不可变**（返回新对象，不原地改）、小文件、边界校验。

### 4.1 路由规则 `RoutingRule`

存储：新集合 `storageService.data.routingRules`（以 `id` 为键）或独立文件 `storage/routing-rules.json`
（推荐后者 + 独立 `routingRuleStore.js`，与指标一致，避免污染 `db.json` 的整库重写，理由见 §7.1）。

```ts
// 概念 schema（JS 中用 zod 校验，项目已依赖 zod@4）
RoutingRule {
  id: string                      // uuid
  enabled: boolean = true
  scope: 'global' | 'user' | 'project'
  scopeId: string                 // 'default' | userId | projectId
  stage: 'text' | 'image' | 'video' | 'tts'   // 注意：内部 stage 用 'text'，对上游兼容 'llm'
  taskType: string | null         // null = 该 stage 的默认规则；否则按任务类型细粒度覆盖
  primary: ProviderSpec
  fallbacks: ProviderSpec[] = []
  policy: FailurePolicy
  budget: BudgetPolicy | null = null
  updatedAt: string
}

ProviderSpec {
  provider: string                // 'openai' | 'deepseek' | 'opencode' | 'seedance' | 'comfyui' | 'mock' ...
  model: string | null
  timeoutMs: number | null        // 覆盖基类默认超时
  maxRetries: number = 1          // 同供应商内重试次数（不含首次）
  options: object = {}            // 温度等；仅允许白名单字段
   // 注意：**不允许**在此放置 baseUrl/apiKey（防止 SSRF/密钥替换，见 §8.5）
   // 视频阶段若指向 comfyui，可用 workflowId 选择运维注册的模板（见 §8.3）
}

FailurePolicy {
  onError: boolean = true         // 网络错误 / 5xx
  onTimeout: boolean = true
  onRateLimit: boolean = true     // 429
  onEmpty: boolean = true         // 文本阶段：空响应
  onParseError: boolean = true    // 文本阶段：JSON 解析失败
  onContentFilter: boolean = false
  maxSwitches: number = 2         // 跨供应商切换上限
  switchBackoffMs: number = 300
  respectRetryAfter: boolean = true   // 429 时读 Retry-After
}

BudgetPolicy {
  dailyBudget: number | null      // 单位=币种，null=不限
  onBudgetExceeded: 'block' | 'downgrade' | 'warn' = 'warn'   // v2 才实现 downgrade
}
```

**规则解析优先级**（`providerRouter.resolveRoute`）：
```
project+taskType  >  project(默认)  >  user+taskType  >  user(默认)  >  global+taskType  >  global(默认)
                                                                          ↓ 全部未命中
                                   回退为 [{ provider: resolveProviderConfig(stage,…) 的结果 }]  // 单元素链
```
这样**默认零行为变化**，只有显式配置了规则才启用新链路。

### 4.2 调用指标 `InvocationMetric`

存储：**JSONL 追加文件** `storage/metrics/invocations-YYYY-MM-DD.jsonl`（每日一个文件），
另有日聚合缓存 `storage/metrics/daily.json`（见 §7.1、§7.2）。

```ts
InvocationMetric {
  id: string
  ts: string                      // ISO8601
  requestId: string               // 一次「逻辑调用」的关联 id；同一次回退链的多次尝试共享
  attempt: number                 // 1..N（1=primary）
  isFallback: boolean             // attempt > 1
  routeRuleId: string | null
  scope: 'project'|'user'|'global'|'legacy'   // legacy=未启用规则时的退化链

  stage: 'text'|'image'|'video'|'tts'
  taskType: string | null         // 'script.generate' | 'character.extract' | 'shot.video' ...
  projectId: string | null
  userId: string | null
  novelId: string | null

  provider: string
  model: string | null

  success: boolean
  errorClass: null | 'timeout'|'rate_limit'|'auth'|'quota'|'server'|'client'|'network'|'empty'|'parse'|'cancelled'|'unknown'
  httpStatus: number | null
  errorMessage: string | null     // 截断 ≤300 字符，且不得含密钥

  latencyMs: number               // 端到端（单次尝试）
  latencyBreakdownMs: {           // 可选，便于定位慢在哪
    queueMs?: number
    submitMs?: number
    pollMs?: number
    downloadMs?: number
  } | null

  // 用量（口径见 §7.3）
  unit: 'token'|'image'|'second'|'char'|'call'
  unitCount: number | null        // 视频=秒数，图片=张数，tts=字符数，文本=totalTokens
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  cachedTokens: number | null     // 缓存命中 token（§7.4）
  cacheHit: boolean | null

  // 成本
  currency: 'USD'|'CNY' | null
  costEstimate: number | null
  pricingMissing: boolean         // true=单价表无此 provider:model
  priceTableVersion: string | null

  quality: {                     // 可选，用于模型对比的辅助信号
    score?: number               // 如视频一致性分（复用 calculateConsistencyScore 结果）
    partial?: boolean
  } | null
}
```

### 4.3 成本单价表 `PricingTable`

存储：**代码内静态、版本化**（`src/config/modelPricing.js`），而非数据库——因为单价随厂商调整，用代码 + PR 评审更可控、可回溯。

```js
// src/config/modelPricing.js
export const PRICING_TABLE = {
  version: '2026-10-17',
  currency: 'CNY',   // 已决策：统一人民币（国产模型天然人民币计价，OpenAI 价按汇率折算并标折算日期）
  llm: {
    // key 格式 `${provider}:${model}`，前缀匹配支持
    'openai:gpt-4o-mini':      { inputPer1M: ?, outputPer1M: ?, cachedInputPer1M: ? },
    'openai:gpt-4o':           { inputPer1M: ?, outputPer1M: ?, cachedInputPer1M: ? },
    'deepseek:deepseek-chat':  { inputPer1M: ?, outputPer1M: ?, cachedInputPer1M: ? }, // [待验证] 官方价与缓存折扣
    // 'opencode:*' 为本地服务：单价 0 或 null（取决于是否计费下游）
  },
  image: {
    'openai:gpt-image-1': { perImage: { '1024x1024': ?, '1024x1536': ?, '1536x1024': ? } }, // [待验证] 计费口径（张 or token）
  },
  video: {
    'runway:gen-3-alpha':  { perSecond: ? },   // [待验证]
    'seedance:seedance-2.5': { perSecond: ? },
    'comfyui:*':           { perSecond: 0 },   // 自托管：外部货币成本 0（仅耗电/算力，另计）
  },
  tts: {
    'elevenlabs:*': { per1kChars: ? },         // [待验证]
  },
}
```

**规则**：
- 查表用 `provider:model` 精确匹配 → 退化为 `provider:*` 通配 → 未命中返回 `null` + `pricingMissing=true`。
- **绝不猜测价格**：未核实一律 `null`，避免"看似精确的错数字"污染选型决策。
- 表结构带 `version`，指标记录里冗余 `priceTableVersion`，便于日后重算历史成本。

### 4.4 计费模型与套餐（billingModel）

按用户反馈补充：成本口径必须区分「按量 / 套餐 / 免费」三类。

```js
// 每个单价条目增加 billingModel
'llm': {
  'mock:*':      { billingModel: 'free',    ... },                 // 自托管/测试替身
  'openai:gpt-4o':{ billingModel: 'metered', inputPer1M: null, ... }, // 按量（价待核实）
  'volcengine:*':{ billingModel: 'plan', planName: '火山方舟 Agent Plan',
                   monthlyFeeCNY: null, includedUnit: 'token', includedUnits: null,
                   overflow: { inputPer1M: null, outputPer1M: null } },
}
```

- `free`  ：边际成本 0。
- `plan`  ：单次调用边际成本记 **0**（额度内）；用量照常记录，由 `planConsumption` 汇总额度消耗与余量。
- `metered`：按各 stage 真实单位折算（现有逻辑）。

`estimateCost` 现返回 `billingModel` 与 `planName`；指标记录 `billingModel / planId / planName`。

### 4.5 供应商/套餐管理 → 移交 LiteLLM（架构调整）

> **决策（2026-10）**：不同 plan 的「端点 + 凭证」差异（如火山方舟 Agent Plan vs 按量 API、订阅制 OAuth token vs API key）
> **不再自研**，改由 **LiteLLM 网关**承载。原先自研的 `src/config/providerPlans.js` / `resolvePlanAccess` 已删除。

**为什么改用 LiteLLM**（已核实）：
- LiteLLM 原生支持 **Volcengine**（chat/embedding），且**每个 deployment 可单独设 `api_base` + `api_key`** → 把「plan 端点 vs 按量端点」建模成两个 deployment，天然解决。
- LiteLLM 已收录 **`volcengine/doubao-seedance-*`**，支持 **`/v1/videos`**（Seedance 视频），并按秒计费。
- 图像（Seedream）可作为 `image_generation` deployment。
- 内置价表 + spend 追踪。

**落地**：`litellm/config.yaml`（用 `os.environ/*` 复用既有 `.env`）+ `docker-compose.yml` 的 `litellm` 服务；详见 `litellm/README.md`。

**边界**（仍走自研 provider）：
- **ComfyUI**：自托管、非标准视频协议 → LiteLLM 不覆盖，保留 DreamReel 自研 video provider。
- **应用内成本归属**（按用户/项目）：LiteLLM 提供网关侧 spend；app 侧指标层作为补充/归属层保留（见 §7）。

**保留的通用概念**：`billingModel: metered | plan | free`（§4.4）作为成本分类保留，与 LiteLLM 的端点/凭据管理不冲突。

---

## 5. 接口设计（REST）


> 统一响应包裹沿用项目现有风格；新增接口放在 **新路由文件**，在 `src/routes/index.js`（或等价聚合处）挂载，避免 `providers.js` 继续膨胀（它当前已 150 行，且职责是「目录/状态」）。

### 5.1 路由规则

**`GET /api/providers/routes`**
- Query：`stage?`, `scope?`（global|user|project）, `scopeId?`
- Resp：
```json
{
  "rules": [
    {
      "id": "r_...", "enabled": true, "scope": "project", "scopeId": "p_123",
      "stage": "video", "taskType": null,
      "primary": { "provider": "seedance", "model": "seedance-2.5", "timeoutMs": 120000, "maxRetries": 1 },
      "fallbacks": [
        { "provider": "minimax", "model": "video-01", "timeoutMs": 120000, "maxRetries": 1 },
        { "provider": "comfyui", "model": "t2v-default", "timeoutMs": 600000, "maxRetries": 0 }
      ],
      "policy": { "onError": true, "onTimeout": true, "onRateLimit": true, "maxSwitches": 2, "switchBackoffMs": 300 },
      "budget": null,
      "updatedAt": "2026-10-17T..."
    }
  ]
}
```

**`PUT /api/providers/routes/:stage`**（upsert，body 校验用 zod）
- Body：`{ scope, scopeId, taskType?, primary, fallbacks, policy?, budget?, enabled? }`
- 校验要点：
  - `primary.provider` / 每个 `fallbacks[].provider` 必须存在于 `providerRegistry` 且该 stage 支持；
  - **拒绝** spec 中出现 `baseUrl`/`apiKey`/`config` 字段（400，防 SSRF/密钥替换）；
  - `maxSwitches` ≤ `fallbacks.length`；
  - 同一 `(scope,scopeId,stage,taskType)` 唯一。
- Resp：`{ success: true, data: <rule> }`

**`DELETE /api/providers/routes/:id`** → `{ success: true }`

**`POST /api/providers/routes/:stage/preview`**
- 入参同 PUT，返回**解析后的实际执行链**（含从 `providerPreferences`/全局继承来的项）与"哪些 provider 当前不可用（缺 key）"，用于前端在保存前预览。
- Resp：`{ chain: [{provider, model, available: true|false, reason?}], warnings: [...] }`

### 5.2 调用指标与对比

**`GET /api/providers/metrics`**
- Query：`stage?`, `provider?`, `model?`, `taskType?`, `projectId?`, `userId?`, `from?`, `to?`（默认近 7 天）, `groupBy?`（`provider|model|taskType|project|day`）
- Resp：
```json
{
  "range": { "from": "...", "to": "..." },
  "totals": { "calls": 1234, "successRate": 0.982, "fallbackCalls": 40, "totalTokens": 900000, "costEstimate": 12.34, "pricingMissingCalls": 7 },
  "groups": [
    { "key": "deepseek:deepseek-chat", "provider": "deepseek", "model": "deepseek-chat",
      "calls": 800, "successRate": 0.99, "p50LatencyMs": 2100, "p95LatencyMs": 5400,
      "avgTokens": 730, "cachedTokenRatio": 0.41, "costEstimate": 3.1 }
  ]
}
```

**`GET /api/providers/compare`**
- Query：`stage`, `models=deepseek:deepseek-chat,openai:gpt-4o-mini,...`, `from?`, `to?`, `taskType?`
- Resp：按模型并排的 `[{provider, model, calls, successRate, p50, p95, avgTokens, cachedTokenRatio, avgCost, qualityAvg}]`。

**`GET /api/providers/costs`**
- Query：`from?`, `to?`, `groupBy=provider|model|project|user|day|taskType`
- Resp：成本汇总 + `pricingMissing` 计数（提醒哪些模型还没录入单价）。

**`POST /api/providers/metrics/export`**
- Body：筛选条件；Resp：CSV/JSON 下载（模型对比离线分析用）。

### 5.3 现有接口的兼容改动

| 接口 | 改动 | 兼容性 |
|---|---|---|
| `GET /providers/status`（`routes/providers.js:25`） | `configured` 增补 deepseek；新增 `image` 阶段的 `configured`；`video.configured` 增补 `comfyui` | 向后兼容（只增字段） |
| `GET /providers/available?stage=`（`:72`） | 目录项增补 `comfyui`（视频）；可增补 `routingAvailable` 标记 | 向后兼容 |
| `GET /providers/video-models`（`:139`） | `VIDEO_MODEL_CATALOG` 增补 comfyui 项 | 向后兼容 |
| `GET /projects/:id/model-config`（`routes/projects.js:507`） | 增补 `image` 与 `routing` 摘要（可选） | 需注意 body `resolved` 保持原三键不变或只增 |
| `PUT /projects/:id/model-config`（`:550`） | 允许写 `image`（模型层需同步加 `image` 字段，§10 Phase 1） | 需迁移测试 |

---

## 6. 执行级回退机制

> **状态：Phase 1 已实现（LLM 阶段）。** `src/services/executionRouter.js` 提供
> `shouldSwitch(error)` 与 `composeWithFallback(instances, baseMeta)`；LLM 工厂按 `LLM_FALLBACK_PROVIDERS`
> 构建「主 + 回退」链。每次逻辑调用生成共享 `requestId`，逐次尝试记录 `attempt` / `isFallback`；
> 支持 `LLM_ATTEMPT_TIMEOUT_MS` 单次尝试软超时（防主 provider 挂起）。
> **已真机验证**：停掉 LiteLLM → 自动切到直连 DeepSeek（attempt1 失败 network / attempt2 成功，requestId 一致）。
> 图片/视频/TTS 阶段沿用同一 `executionRouter` 即可扩展（图片、TTS 已接入工厂链；视频因异步任务需在提交前失败时切换，待做）。

### 6.1 触发条件（决策点 1）

**推荐：v1 只做「硬失败回退」；成本/质量驱动的"主动降级"作为显式开关的 v2 能力。**

| 事件 | 分类 | v1 行为 |
|---|---|---|
| 网络错误 / DNS / 连接拒绝 | `network` | 切换下一顺位 |
| HTTP 5xx | `server` | 切换 |
| HTTP 429 | `rate_limit` | 读 `Retry-After` 决定"先原地等再重试"或直接切换（`respectRetryAfter`） |
| 超时（AbortError / 自设 timeoutMs） | `timeout` | 切换 |
| HTTP 401/403 | `auth` | **切换**（该供应商此刻不可用） |
| HTTP 400/422 | `client` | **不切换**（请求本身有问题，换谁都一样，快速失败） |
| 文本空响应 | `empty` | 切换 |
| JSON 解析失败 | `parse` | 先同供应商重试，再切换 |
| 内容审核拒绝 | `content_filter` | 默认**不切换**（`onContentFilter=false`），避免绕过审核 |
| 用户取消 | `cancelled` | **不切换**，立即终止 |

**理由**：
- 无质量信号时，"主动降级"会让同一需求在不同请求下拿到不同质量的结果，不可复现、难归因。
- 成本驱动降级需要**可信的实时预算**，而当前无成本数据（正是本次要做埋点的原因）——先度量，后优化。
- 保留 `budget.onBudgetExceeded` 作为 v2 钩子（`downgrade`），届时基于真实 `costEstimate` 启用。

### 6.2 重试 vs 切换（与 `generateJSONWithRetry` 的关系）

**两层策略，职责分离**：

```
外层（新）：executionRouter.executeWithFallback
  for spec of [primary, ...fallbacks]:
     实例 = providerRegistry.createProvider(stage, spec)
     结果 = await 内层重试(实例, spec)        // 同供应商内 ≤ maxRetries 次
     成功 → 记录指标(attempt, isFallback) 返回
     失败 → classifyError
            if 该错误类别在 policy 中允许切换 且 未超 maxSwitches:
                 sleep(switchBackoffMs) → 下一个 spec
            else: 抛出（含最后一次指标）

内层（复用现有）：generateJSONWithRetry(provider, params, { attempts: spec.maxRetries+1, backoff })
  —— 仅用于文本阶段；图片/视频/语音阶段用各自 provider 的提交+轮询，内层重试由 router 统一实现，不调用该工具。
```

改动点：
- `src/utils/llmRetry.js`：**保持不变**（复用），但在 router 中以 `attempts = spec.maxRetries + 1` 调用。
- 说明：`generateJSONWithRetry` 现在把"空响应"当异常抛出（`:11`），正好与 §6.1 的 `empty` 分类对齐；router 捕获其异常后按 `errorClass` 决策。

### 6.3 切换策略

- **顺序切换**（非并行竞速）：按 `fallbacks` 声明顺序。理由：并行竞速会**成倍消耗成本与配额**，与 G3 冲突；且视频类任务是长任务，竞速浪费更大。
- **退避**：切换前 `switchBackoffMs`（默认 300ms），避免在全局抖动时瞬间打满所有供应商。
- **上限**：`maxSwitches`（默认 2）。超过则抛最后一次错误。
- **熔断（v1 可选、v2 建议）**：某 provider 在滑动窗口内失败率超阈值 → 临时降级（跳过）。v1 先不做，靠指标积累后再加（避免过早抽象）。

### 6.4 幂等性（关键，尤其视频）

- 每次逻辑调用生成 `requestId`，回退链上所有 attempt 共享。
- **文本/图片/TTS**：重试/切换本身幂等（无副作用或产物可覆盖写）。
- **视频**：`generateVideo` 会**创建远端任务并计费**。因此：
  - 若失败发生在**提交前**（`generateVideo` 抛错）→ 切换安全。
  - 若提交成功、失败发生在**轮询阶段**（`getTaskStatus` 超时/网络抖动）→ **优先继续轮询原任务**，而不是重新提交。仅当 `getTaskStatus` 明确返回 `failed`/`cancelled`，或超过 `pollDeadline` 仍无果时，才**在新的 requestId 下**重新提交（并记录 `retriedSubmission=true` 供成本审计）。
  - 复用 `videoService.js:92-106` 的 `activeTasks.provider` 机制：任务一旦提交，其 `provider` 实例固定，回退只在提交决策点发生。
- 前端/服务端需在指标里能区分"新增提交"与"切换重试"，否则成本会被低估。

### 6.5 与现有四级回退的关系

- `resolveProviderConfig` 继续负责"**选谁作为默认 primary**"（配置期）。
- `providerRouter.resolveRoute` 负责"**这一阶段/任务类型该用哪条链**"（配置期，读规则表）。
- `executionRouter` 负责"**这条链里谁先谁后、失败怎么走**"（执行期）。
- 无规则时，执行链 = `[resolveProviderConfig 的结果]`，**行为与今天完全一致**（`scope='legacy'`）。这是本方案可安全灰度、可回滚的基础。

---

## 7. 成本与 token 度量

> **状态：已接入全阶段。** 实现为 `src/services/withMetrics.js`：
> - `instrumentProvider(provider, meta)`：工厂级 Proxy 包装，自动记录 `generate/generateJSON/generateImage/synthesize`（LLM/图片/TTS），
>   内部调用以原始对象为 `this` → **不重复计数**；best-effort，记录失败不影响业务。
> - `recordOutcome(meta, outcome)`：video 阶段由 `videoService` 在终态调用（provider 未自记录时）。
> - 同步修掉 `BaseLLMProvider.generateJSON` 丢弃 `usage` 的问题（现透出 `usage`，文本 token 可记录）。
> - 已真机验证：ComfyUI 出片 → `video` 指标；DeepSeek 调用 → `text` 指标（含 token / 缓存字段）。
> - 遗留：video 仅 ComfyUI 自记录；其它 video provider 经 `videoService` 记录（`recordsOwnMetrics` 标记去重）。

### 7.1 埋点位置（决策点 2 的一部分：存哪、写多频繁）

**问题**：现有 `storageService.save()`（`storageService.js:87-106`）是**整库 debounced 全量重写**。若把每次调用指标写进 `db.json`，高频调用会让整个数据库反复序列化落盘，且 `db.json` 会膨胀到不可用。

**推荐**：新增独立 `src/services/metricsStore.js`：
- 写入：`appendInvocationMetric(metric)` → **追加一行 JSON** 到 `storage/metrics/invocations-YYYY-MM-DD.jsonl`（`fs.appendFileSync` 或串行化队列，避免半行）。
- 聚合：定时/按需将当日 JSONL 汇总为 `storage/metrics/daily.json`（按 stage/provider/model/taskType/project 的计数、成功率、延迟分位、token、成本）。
- 保留期：JSONL 保留 7 天（原始），`daily.json` 保留 90 天（聚合）。超期清理，避免无限增长。
- 与 `asyncLock.js`（`src/utils/asyncLock.js` 已存在）配合，保证同进程写不交错。

**埋点调用点**：
- `executionRouter` 是**唯一埋点写入者**（单一职责，避免散落）。
- 各 provider 只需**回传用量**（`usage` / 产物计量），不直接写指标：
  - `openaiLLMProvider.generate` 已 `return { usage }`（`:78`）→ 保留，router 读取。
  - `opencodeLLMProvider.generate` 已 `return { usage }`（`:62`）→ 保留。
  - 视频类：router 在提交/完成时按 `duration` 计 `unitCount=秒`（`videoService` 调 `generateShot` 已带 `duration`）。
  - 图片类：`unitCount=张数`（`n=1`）。
  - TTS：`unitCount=字符数`（`dubbingService` 可提供文本长度）。

### 7.2 usage 拼装（规范化）

新增 `src/services/usageNormalizer.js`：

```js
export function normalizeUsage(stage, rawUsage, ctx) {
  if (stage !== 'text') {
    return { unit: stage === 'video' ? 'second' : stage === 'image' ? 'image' : 'char',
             unitCount: ctx.unitCount ?? null, promptTokens: null, completionTokens: null,
             totalTokens: null, cachedTokens: null, cacheHit: null }
  }
  const u = rawUsage || {}
  const promptTokens = u.prompt_tokens ?? u.inputTokens ?? null
  const completionTokens = u.completion_tokens ?? u.outputTokens ?? null
  const totalTokens = u.total_tokens ?? (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null)
  // 缓存字段兼容：OpenAI 在 prompt_tokens_details.cached_tokens；DeepSeek 在 prompt_cache_hit_tokens
  const cachedTokens = u.prompt_tokens_details?.cached_tokens
      ?? u.prompt_cache_hit_tokens
      ?? null
  const cacheHit = cachedTokens != null ? cachedTokens > 0 : null
  return { unit: 'token', unitCount: totalTokens, promptTokens, completionTokens, totalTokens, cachedTokens, cacheHit }
}
```
> **[待验证]** OpenAI `usage.prompt_tokens_details.cached_tokens`、DeepSeek `usage.prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` 的确切字段名与语义。落地前用真实响应核验（可写一个一次性脚本打真实请求打印 `usage`）。

### 7.3 成本折算

新增 `src/services/costEstimator.js`：
```js
export function estimateCost(stage, { provider, model, usageFull, ctx, pricing = PRICING_TABLE }) {
  const key = `${provider}:${model}`
  const entry = pricing[stage]?.[key] ?? pricing[stage]?.[`${provider}:*`] ?? null
  if (!entry) return { costEstimate: null, pricingMissing: true, currency: null, priceTableVersion: pricing.version }
  // 各 stage 折算：
  //  text : inputTokens/1e6*inputPer1M + outputTokens/1e6*outputPer1M（cached 部分按 cachedInputPer1M）
  //  image: perImage[size]
  //  video: perSecond * durationSeconds
  //  tts  : per1kChars * chars/1000
  return { costEstimate, pricingMissing: false, currency: pricing.currency, priceTableVersion: pricing.version }
}
```
- **口径区分**：`unit` 与实际计费单位可能不同（如视频按"秒"、图片按"张"、文本按"token"）。成本估算必须按各 stage 的**真实计费单位**折算，不能一律用 token。
- **opencode/本地模型**：外部货币成本为 0（自托管），但**仍记录 token 与延迟**，用于对比与容量规划。
- **ComfyUI**：外部货币成本 0，但记录时长/算力占用（可选）。

### 7.4 Prompt 缓存与省 token（需求 G3）

**（a）缓存友好结构**（新增 `src/services/promptBuilder.js`）：
- 把**稳定前缀**（system 指令 + 角色/世界观共享上下文）放最前、**易变尾部**（本次具体问题）放最后——DeepSeek 与 OpenAI 的自动前缀缓存都依赖"稳定前缀"。
- 相关服务（`scriptService.js`、`characterExtractionService.js:217`、`worldbuildingService.js:141`、`combinedExtractionService.js:100`）当前各自拼 prompt；建议统一经 `promptBuilder.buildCacheable({ stableParts, variableParts })` 组装。
- 用 `taskType` 标识可缓存任务（如 `character.extract` 的共享世界观前缀）。

**（b）按任务难度分流**（`taskType` 路由，需求 G3）：
- 定义 `taskType` 取值（示例）：`script.generate`、`script.adapt`、`character.extract`、`worldbuild.extract`、`shot.video`、`poster.image`、`dubbing.synthesize`。
- 路由规则中可对**高难度**任务配强模型（primary=gpt-4o）、**低难度**任务配廉价模型（primary=deepseek-chat / opencode 免费档）。
- 实现要点：调用方在发起时传 `taskType`（新增参数，默认 `stage + '.default'`），`providerRouter` 优先匹配 `taskType` 规则。

**（c）度量缓存收益**：指标里的 `cachedTokenRatio`（`cachedTokens / promptTokens`）按 provider/model 聚合，直接展示"改用缓存友好结构后省了多少"。

---

## 8. ComfyUI 视频 Provider 接入设计

> **状态：已实现并已对真实实例（192.168.31.113:8188, Wan2.2 TI2V-5B GGUF）端到端验证通过**（I2V / T2V 均产出 h264 mp4）。
> 实现文件：`src/providers/comfyuiVideoProvider.js`、`src/providers/comfyuiWorkflow.js`、
> 模板 `src/config/comfyuiWorkflows/wan22_ti2v.json`；单测 `tests/comfyuiVideoProvider.test.js`、
> `tests/comfyuiWorkflow.test.js`；真机验证脚本 `scripts/verify-comfyui.js`。
> 配置项见 `.env.example`（`COMFYUI_*`）。
>
> **多输入支持（对齐新版接口文档 `generate(params)`）**：`generateVideo` 现接受
> `images[]`（多参考图）、`prompts[]`（多提示词）、`negativePrompts[]`、`audios[]`（多配音）。
> 映射规则按 class_type 定位：images→LoadImage（node_id 升序，images[0] 兼作 latent.start_image）；
> audios→音频节点（如 LoadAudio）；prompts/negativePrompts→文本节点（节点不足则合并）。
> 数量超出节点数会**显式报错**（不静默错配）。真机多输入的最终验证需用户提供 `custom_multi.json` 工作流。

### 8.1 定位与配置

ComfyUI 是**自托管、异步任务型**的视频生成后端，运行在**另一台机器**（跨机器）。

新增配置（`src/config/index.js` → `video.comfyui`，env 驱动）：
```env
COMFYUI_BASE_URL=http://192.168.1.50:8188     # 仅运维可配，项目级不可覆盖
COMFYUI_API_TOKEN=                              # 可选；由反向代理校验（见 8.5）
COMFYUI_POLL_INTERVAL_MS=3000
COMFYUI_MAX_POLL_MS=600000                      # 单任务轮询上限
COMFYUI_SUBMIT_TIMEOUT_MS=15000
COMFYUI_DOWNLOAD_MAX_BYTES=268435456            # 256MB
COMFYUI_ALLOWED_HOSTS=192.168.1.50              # 主机白名单
COMFYUI_MAX_CONCURRENT=1                        # 本机对 ComfyUI 的并发上限
```
```js
comfyui: {
  baseUrl: process.env.COMFYUI_BASE_URL || '',
  apiToken: process.env.COMFYUI_API_TOKEN || '',
  pollIntervalMs: parseInt(process.env.COMFYUI_POLL_INTERVAL_MS,10) || 3000,
  maxPollMs: parseInt(process.env.COMFYUI_MAX_POLL_MS,10) || 600000,
  submitTimeoutMs: parseInt(process.env.COMFYUI_SUBMIT_TIMEOUT_MS,10) || 15000,
  downloadMaxBytes: parseInt(process.env.COMFYUI_DOWNLOAD_MAX_BYTES,10) || 268435456,
  allowedHosts: (process.env.COMFYUI_ALLOWED_HOSTS || '').split(',').filter(Boolean),
  maxConcurrent: parseInt(process.env.COMFYUI_MAX_CONCURRENT,10) || 1,
}
```
并在 `providerResolver.isProviderConfigured('video','comfyui')` 增补 `return !!config.video.comfyui?.baseUrl`。

### 8.2 新增 `src/providers/comfyuiVideoProvider.js`

```js
export class ComfyuiVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'comfyui'
    this.baseUrl = (config.comfyui?.baseUrl || '').replace(/\/$/, '')
    this.apiToken = config.comfyui?.apiToken || ''
    // ...超时/轮询/下载上限
  }
  supportsReferenceImages() { return true }   // 取决于所选工作流（i2v 模板）
  async generateVideo(params) { /* 提交 → 返回 { taskId: prompt_id, status: 'generating' } */ }
  async getTaskStatus(taskId) { /* 查 history → { status, videoUrl } */ }
  async cancelTask(taskId)    { /* 见 8.4 */ }
}
```

### 8.3 工作流模板化（API 格式 workflow JSON）

- **只接受 API 格式**（`/prompt` 所需的节点图 `{ "3": {class_type, inputs}, ... }`），**不是** UI 格式。
- 模板放 `src/config/comfyuiWorkflows/*.json`（如 `t2v_default.json`、`i2v_default.json`）。
  > **已定稿并真机验证**：终节点为**单个视频文件**，采用原生 `CreateVideo → SaveVideo`（`format: mp4` / `codec: h264`）。已在真实实例验证 I2V / T2V 均产出 **h264 mp4**（该机已装 ffmpeg）。模型文件名是实例相关的，换模型需同步模板。
- 每个模板配一个**映射文件** `*.map.json`，声明可注入的节点/输入白名单：
```json
{
  "id": "t2v-default",
  "kind": "t2v",
  "outputNodeId": "12",
  "outputKind": "video",              // video | image
  "inputs": {
    "promptText":  { "nodeId": "6", "field": "text" },
    "seed":        { "nodeId": "3", "field": "seed" },
    "duration":    { "nodeId": "9", "field": "frames" },
    "referenceImage": { "nodeId": "10", "field": "image" }   // i2v 模板才有
  }
}
```
- **模板化规则（安全关键）**：
  - 只允许按 `map.inputs` 白名单替换字段；**禁止**让请求带上任意 JSON patch；
  - `referenceImage` 若需从 URL 传入，必须由服务端先下载到本地临时文件再上传，绝不把 ComfyUI 当通用抓取器；
  - 模板 JSON 大小上限（如 1MB）。

### 8.4 提交 / 轮询 / 取产物 / 取消

- **提交**：`POST ${baseUrl}/prompt`，body `{ prompt: <graph>, client_id }` → `{ prompt_id }`；
  用 `AbortController + submitTimeoutMs`。
- **轮询**：`GET ${baseUrl}/history/${prompt_id}`，按 `pollIntervalMs` 轮询，直到 outputs 出现或超 `maxPollMs`；
  将 `status` 映射为基类约定（`generating` / `completed` / `failed` / `cancelled`）。
  > **已核实**（来源：ComfyUI 官方 API 参考 + server.py 源码，见附录 C）：`/history/{id}` 在任务**结束后**才出现该 key；成败判定**先看 `status.status_str`（`success`/`error`）再看 `completed`**——失败任务的 `completed` 也可能为 `true`，`status.messages` 内含 `execution_error`。
  > **产物 key 不固定**：VHS 用 `gifs`，原生 `SaveVideo` 用视频类 key，前端归类 `images`/`videos`/`files`。**必须遍历 `outputs[node]` 的所有 key，不要写死 `images`**；`type` 可能为 `output` 或 `temp`（VHS `save_output=false` 落 temp）。
- **取产物**：从 `/history` 的 output 拿到 `{ filename, subfolder, type }`，
  构造 `GET ${baseUrl}/view?filename=...&subfolder=...&type=output` 下载，
  用**与 `openaiImageProvider.readLimitedBody` 同款**的分块读取 + `downloadMaxBytes` 上限（复用/提取该工具为 `src/utils/limitedBody.js`）。
  产物落 `storage/`（沿用现有产物目录约定）。
- **取消**：`cancelTask` → 对**排队中**任务 `POST ${baseUrl}/queue`（`{ delete: [prompt_id] }`）；对**运行中**任务 `POST ${baseUrl}/interrupt`（可取 body `{ prompt_id }`）。
  > **已核实**：`/interrupt` 只影响 **RUNNING** 任务，pending 必须靠 `/queue {delete}`；两者返回值均为 200 空 body。**建议组合调用**（先 `interrupt` 再 `queue delete`），并对结果用 `/history` 对账。`POST /free`（`{unload_models, free_memory}`）可用于释放显存，作为卡死兜底。
  > **看门狗是必需的**：ComfyUI **没有内置单任务超时**，断开客户端也不会停止服务端执行。因此 `maxPollMs` 到点后必须主动 `interrupt` + `queue delete`，否则任务会持续占用 GPU（附录 C §风险）。
- **超时与回退交互**：Queued/长时间 Generating 都算"未失败"，**不触发跨供应商回退**（§6.4）；只有明确 `failed` 或超过 `maxPollMs` 才回退。

### 8.5 安全设计（硬要求）

ComfyUI **默认无鉴权**且**跨机器访问**，是典型高风险面。必须：

1. **SSRF / 主机边界**
   - `comfyui.baseUrl`、`apiToken` **只从全局配置读取**；`providerRegistry.createProvider` 对 `comfyui` 强制忽略任何 `spec.config` 中的 baseUrl/token（对齐 `imageProviderFactory.js:63-64` 的既有惯例）。
   - `allowedHosts` 白名单校验 `baseUrl` 主机；非白名单直接构造失败。
   - **仅允许访问** `${baseUrl}/prompt`、`/history/*`、`/view`、`/queue`、`/interrupt` 这些固定路径；**绝不**接受 ComfyUI 返回值里的任意 URL 去 fetch（防被当作内网抓取代理）。
2. **认证（可选，但推荐）**
   - `COMFYUI_API_TOKEN` 以 `Authorization: Bearer` 下发；**注意 ComfyUI 核心默认不校验 token**，需在 ComfyUI 前放反向代理（Nginx/Caddy）做鉴权。
   - **已核实**：ComfyUI 官方明确"默认无鉴权"，核心**没有**原生 token 机制（`--multi-user` 只是目录隔离，非安全机制）。可选方案：(a) 反向代理 basic auth / OIDC / mTLS；(b) 社区插件 `ComfyUI-Login` 提供密码 + token（支持 `Authorization: Bearer <token>` 或 `?token=`，覆盖 REST 与 WS）。文档必须写清"token 由代理/插件校验，ComfyUI 本体不校验"。
   - **已核实的安全坑**：启动参数 `--enable-cors-header` 会**移除** ComfyUI 默认的 Origin/CSRF 校验中间件；若跨机暴露又开 CORS，浏览器侧护栏被拆。既然本方案要求"浏览器不直连 ComfyUI、经后端中转"，则**后端访问无需开 CORS**，ComfyUI 也不应配 `--enable-cors-header '*'`。
3. **网络边界（已决策：内网直连）**
   - 已确认：Node 后端与 ComfyUI 在**同一可信内网**，直连访问；v1 不经 VPN/隧道、不加反向代理鉴权。
   - 因此 v1 的防护重心落在：`COMFYUI_ALLOWED_HOSTS` 白名单 + **仅访问固定路径** + 超时/并发/体积限制 + 审计；**ComfyUI 必须绑定内网 IP、绝不暴露公网**（`--listen <内网IP>`，不要把它暴露到公网）。
   - 配置位仍保留 `COMFYUI_API_TOKEN`：若未来网络形态变化（跨网段/公网），只需在 ComfyUI 前加反向代理并开启校验，代码无需改动。
4. **超时与资源滥用**
   - 提交/轮询/下载三处超时；`maxConcurrent` 限制本机对 ComfyUI 的并发；队列深度上限（超出拒绝而非排队）。
   - 依据 `quotaService`（`src/services/quotaService.js`）对用户/项目做调用配额，防单用户刷爆自托管算力。
5. **文件下载限制**
   - 分块读 + 字节上限 + 内容类型校验（`video/*`、`image/webp`）；超限中断并清理临时文件。
   - 落盘路径经 `path.resolve` 归一化，防 `../` 逃逸。
6. **审计**
   - 每次 ComfyUI 调用写入指标（含 `provider='comfyui'`、`requestId`、耗时、成功/失败），便于异常用量排查。

---

## 9. 前端配置体验（`public/js`）

### 9.1 扩展 `ProviderSelector`（`public/js/components/providerSelector.js`）

- `STAGE_LABELS` 增补 `image`（`{ icon:'🖼️', name:'图片生成', hint:'分镜配图 / 海报' }`）。
- 每个 stage 卡片从"单选 provider+model"升级为**主/备有序列表**：
  - 主 Provider（必选）+ `fallbacks[]`（可增删、可拖拽排序）。
  - 每个条目可选 `timeoutMs`、`maxRetries`（高级折叠）。
  - 未配置 key 的 provider 显示"不可用"（来自 `/routes/:stage/preview` 的 `available=false`）。
- 保存：主/备写 `PUT /api/providers/routes/:stage`；`image` 阶段的"主"同时可回写 `providerPreferences.image`（需模型层加字段，§10 Phase 1）。
- 保留旧 `PUT /projects/:id/model-config` 兼容路径，避免一次性破坏现有编辑器。

### 9.2 新增「模型对比 / 用量」面板

- 新视图 `public/js/views/providerInsights.js`（或复用 `settings.js` 增加 Tab）：
  - 时间范围选择、stage 过滤；
  - 表格：provider/model × (调用数、成功率、P50/P95、平均 token、缓存命中率、平均成本)；
  - "加入对比"多选 → 调 `/providers/compare` 并排展示；
  - 成本卡片：按模型/项目/日 汇总，标注 `pricingMissing` 项。
- 入口：设置页；**当前为单用户场景（已确认），不做角色门禁**，登录即可见。保留未来加权限中间件的扩展点（如 `routes/projects.js` 的 `requireProjectOwnership`）。

### 9.3 `public/js/api.js` 增补

```js
// Provider 路由与指标
getProviderRoutes: (params) => request(`/providers/routes${qs(params)}`),
saveProviderRoute: (stage, body) => request(`/providers/routes/${stage}`, { method:'PUT', body }),
deleteProviderRoute: (id) => request(`/providers/routes/${id}`, { method:'DELETE' }),
previewProviderRoute: (stage, body) => request(`/providers/routes/${stage}/preview`, { method:'POST', body }),
getProviderMetrics: (params) => request(`/providers/metrics${qs(params)}`),
compareProviderModels: (params) => request(`/providers/compare${qs(params)}`),
getProviderCosts: (params) => request(`/providers/costs${qs(params)}`),
```

---

## 10. 分阶段实施计划

> 原则：**先度量、后回退、再优化**；每阶段可独立上线、独立回滚。TDD 优先（先写失败测试）。

### Phase 0 — 可观测性地基（无行为变化）

| 项 | 内容 |
|---|---|
| 新增文件 | `src/config/modelPricing.js`、`src/services/usageNormalizer.js`、`src/services/costEstimator.js`、`src/services/metricsStore.js`、`src/services/providerMetricsService.js`、`src/routes/providerMetrics.js` |
| 改动文件 | `src/config/index.js`（无需，Phase 0 不涉及）；挂载路由的聚合文件 |
| 埋点接入 | 在 `executionRouter` 之前，**先在现有调用点最小埋点**：`openaiLLMProvider`/`opencodeLLMProvider` 的 `usage` 回传已在；在 `scriptService`/`imageService`/`videoService` **外围**包一层计时并写指标（单一函数 `withMetrics`） |
| 测试 | `tests/usageNormalizer.test.js`（字段兼容、null 处理）、`tests/costEstimator.test.js`（各 stage 折算、缺价置空）、`tests/metricsStore.test.js`（JSONL 追加、聚合、保留期） |
| 验收 | 跑几个含 mock 的现有测试后，`storage/metrics/` 有合法 JSONL；`GET /api/providers/metrics` 返回真实计数 |
| 回滚 | 删除路由挂载 + 去掉 `withMetrics` 包装即可；**零数据迁移风险** |

### Phase 1 — `providerRegistry` + 规则表 + 文本/图片回退

| 项 | 内容 |
|---|---|
| 新增 | `src/providers/providerRegistry.js`、`src/providers/providerRouter.js`、`src/providers/executionRouter.js`、`src/services/routingRuleStore.js`、`src/routes/providerRoutes.js` |
| 改动 | 四个工厂：**导出 `PROVIDER_MAP`**（或 `registerProviders(stage,map)`），内部改用 registry；`src/models/project.js` 与 `src/models/user.js` 的 `providerPreferences` **增补 `image` 字段**（保持默认 null，向后兼容）；`routes/providers.js` status/available 增补 image、deepseek、comfyui |
| 复用 | `generateJSONWithRetry` 作为文本阶段"内层同供应商重试" |
| 测试 | `tests/providerRegistry.test.js`、`tests/providerRouter.test.js`（优先级解析、无规则退化）、`tests/executionRouter.test.js`（用注入的假 provider 模拟 5xx/超时/429/400 的分类与切换、`maxSwitches`、退避、指标写入）、`tests/providerRoutesApi.test.js`（zod 校验、拒绝 baseUrl/apiKey、preview） |
| 验收 | 规则未配置时**所有既有测试全绿**（证明零行为变化）；配置一条含 2 fallback 的文本规则后，注入失败 provider 能被下一顺位接管（S1） |
| 回滚 | 规则表为空即退化到旧路径；删路由挂载即可 |

### Phase 2 — 视频回退 + taskType 分流

| 项 | 内容 |
|---|---|
| 改动 | `src/services/videoService.js:37-111`：`generateShot` 经 `executionRouter` 执行；**提交前失败才切**（§6.4）；`activeTasks` 记录 `requestId`/`attempt`；`pollTaskStatus` 复用 `taskInfo.provider` |
| 新增 | `taskType` 语义与路由匹配（`providerRouter` 已含，Phase 2 接调用方） |
| 测试 | `tests/executionRouter.video.test.js`（提交前失败→切换；轮询超时→**不**重新提交；明确 failed→重提交并标 `retriedSubmission`）；`tests/videoService.routing.test.js` |
| 验收 | 视频 S1 达成；成本口径不因回退被低估（重复提交可被指标识别） |
| 回滚 | 视频规则表清空即回到旧行为 |

### Phase 3 — ComfyUI 视频 Provider

| 项 | 内容 |
|---|---|
| 新增 | `src/providers/comfyuiVideoProvider.js`、`src/config/comfyuiWorkflows/*.json`（示例模板 + map）、`src/utils/limitedBody.js`（从 `openaiImageProvider` 抽取复用） |
| 改动 | `providerRegistry` 注册 `video.comfyui`；`providerResolver.isProviderConfigured` 增补；`VIDEO_MODEL_CATALOG` 增补；`config/index.js` 增 `video.comfyui`；`.env.example` 增补 |
| 测试 | `tests/comfyuiVideoProvider.test.js`（用本地假 HTTP 服务/mock fetch 模拟 `/prompt`、`/history`、`/view`、`/interrupt`）：提交、轮询成功、轮询超时、下载超限、取消、**拒绝非白名单主机**、**忽略 project 级 baseUrl 覆盖** |
| 验收 | S4；在真实/局域网 ComfyUI 上一次端到端出片（运维配合，标记为人工验收项） |
| 回滚 | 从 registry 与 `VIDEO_MODEL_CATALOG` 移除 `comfyui`；配置留空时 `isProviderConfigured=false`，自动不可选 |

### Phase 4 — 成本/token 优化 + 前端对比面板

| 项 | 内容 |
|---|---|
| 新增 | `src/services/promptBuilder.js`；`public/js/views/providerInsights.js` |
| 改动 | 抽取类服务（`characterExtractionService`/`worldbuildingService`/`combinedExtractionService`/`scriptService`）改用 `promptBuilder`；`ProviderSelector` 主/备 UI + image 阶段；`public/js/api.js` 增补 |
| 测试 | `tests/promptBuilder.test.js`（稳定前缀在前的结构断言）；前端改动靠既有 `providerConfigApi.test.js` 回归 + 手测 |
| 验收 | S2、S3；缓存友好改造后 `cachedTokenRatio` 可见上升（对比前后） |
| 回滚 | promptBuilder 可逐服务回退到原拼接；面板可下线 |

### Phase 5（可选）— 离线 A/B 批量对比工具

| 项 | 内容 |
|---|---|
| 新增 | `scripts/ab-compare.js` + `POST /api/providers/compare/batch`（管理员，显式确认成本） |
| 用途 | 同一批 prompt 跑多模型，产出更可控的对比（补齐线上埋点"任务分布不均"的偏差） |
| 风险 | 花钱；需人工确认；默认 dry-run |

---

## 11. 风险与取舍、未决问题

### 11.1 风险与取舍

| 风险/取舍 | 说明 | 缓解 |
|---|---|---|
| **R1 指标写文件 vs 写库** | 写 `db.json` 会放大整库重写开销与体积 | 独立 JSONL + 日聚合 + 保留期（§7.1） |
| **R2 回退放大成本** | 每次失败切换都可能产生新计费（尤其视频重提交） | 顺序（非竞速）切换、`maxSwitches` 上限、提交后失败优先继续轮询、指标区分 `retriedSubmission`（§6.4） |
| **R3 回退掩盖真实故障** | 自动切换可能让"某供应商持续不可用"被静默掩盖 | 指标暴露回退率与各 provider 成功率；可选熔断（v2） |
| **R4 规则表复杂度** | 独立规则表带来配置面扩大 | 默认退化链零行为变化；preview 接口；zod 严格校验 |
| **R5 无质量信号** | 只能按"成功/失败/成本/延迟"选型，不能按"生成质量"自动切换 | 指标里保留 `quality.score` 钩子；质量对比走离线 A/B（Phase 5） |
| **R6 单价过时** | 静态价表需人工维护 | 带 `version`、`pricingMissing` 显式提示；管理员面板可见缺口 |
| **R7 ComfyUI 安全** | 无鉴权 + 跨机 + 可执行任意工作流 = 高风险 | §8.5 全套（白名单、路径限定、代理鉴权、超时/并发/体积限制、审计） |
| **R8 文件存储的并发** | JSONL 追加与 `db.json` 写入需避免交错 | 复用 `src/utils/asyncLock.js` 串行化 |
| **R9 兼容性** | 改动工厂/模型字段可能破坏既有测试 | 导出面只增不改；`image` 字段默认 null；Phase 0/1 以"全绿"为验收硬门槛 |

### 11.2 决策点与推荐值（用户要求明确列出）

| # | 决策点 | 推荐 | 理由 |
|---|---|---|---|
| 1 | **回退触发条件** | **仅硬失败**（网络/5xx/超时/429/空响应/解析失败）触发切换；成本/质量主动降级为 v2 的**显式开关** | 无质量信号时主动降级不可复现、难归因；成本降级需先有可信成本数据（正是本方案 Phase 0 产出） |
| 2 | **成本口径** | **维护版本化「模型单价表」并按各 stage 真实计费单位折算**；未核实单价一律 `null` + `pricingMissing` | 选型/预算需要统一口径；但"错的价格"比"没有价格"更危险 |
| 3 | **对比方式** | **线上真实埋点为主**（Phase 0 即产出），离线 A/B 批量对比为**可选补充**（Phase 5，管理员、dry-run、显式确认成本） | 线上埋点成本低、贴近真实分布；离线 A/B 更可控但要花钱、要人工 |
| 4 | **配置形态** | **独立「路由规则表」**（`routingRules`），**不**在 `providerPreferences` 上塞 `fallbacks` 数组；`providerPreferences` 保留为主 Provider 兼容来源，`image` 字段补齐 | fallbacks 属执行策略，混入会污染四级回退语义与 `isProviderConfigured`；规则需支持 taskType/scope/预算多维，数组表达力不足；独立表可空表退化、易回滚 |

### 11.3 关键决策（已确认，2026-10-17）

| # | 决策点 | 结论 | 对本方案的影响 |
|---|---|---|---|
| 1 | 币种 | **CNY** | 价表 `currency='CNY'`；OpenAI 等外币价按汇率折算并在价表标注折算日期 |
| 2 | 回退是否默认开启 | **默认开启** | 规则一经配置即生效；不引入 feature flag（保持简单）。风险缓解靠 `maxSwitches` 上限 + 指标可观测 + 规则可清空即回退旧路径 |
| 3 | ComfyUI 网络形态 | **内网直连** | 不做 VPN/反代鉴权（v1）；防护靠主机白名单 + 固定路径 + 超时/并发/体积限制；ComfyUI 只绑内网 IP、不暴露公网（§8.5）|
| 4 | ComfyUI 工作流 | **由本方案提供**；终节点为**单个视频文件** | 模板参考骨架见**附录 D**；`outputKind='video'`；Phase 3 按实例 `/object_info` 校验后定稿（§8.3）|
| 5 | 权限范围 | **单用户场景，不做门禁** | 指标/对比面板登录即可见；不做角色中间件（§9.2）|

### 11.4 剩余未决（不阻塞 Phase 0/1）

1. **指标保留期**：暂定 原始 JSONL 7 天 / 聚合 90 天；选型需要更长历史时再调。
2. **哪些 taskType 需要分流**：按 §7.4 的默认清单先跑，边界后续按实测数据调整。
3. **成本告警阈值**：v2 `budget` 能力，暂不定；先积累 `costEstimate` 数据。
4. **user 级自定义路由**：单用户场景默认只用 `global`；`user` 级路径保留但先不启用。
5. **ComfyUI 实例相关的待验证项**：目标实例版本、已装模型名、`/history` 输出 key 名、是否装 `ffmpeg`——Phase 3 实测（§12.3）。

---

## 12. 事实 / 假设 / 待验证 标注清单

### 12.1 已核实事实（来自源码直接阅读）

- `resolveProviderConfig` 为四级**配置期**回退，`isProviderConfigured` 仅查 key 存在性（`providerResolver.js:18-151`）。
- 四个工厂的 `PROVIDER_MAP` 与导出面（`llmProviderFactory.js:9-14`、`imageProviderFactory.js:8-11`、`videoProviderFactory.js:17-24`、`ttsProviderFactory.js`）；均**未导出** `PROVIDER_MAP`。
- `providerPreferences` 缺 `image`（`project.js:81-86`、`user.js:14-19`）。
- `generateJSONWithRetry(llm, params, {attempts,backoff})` 为**同实例**重试（`llmRetry.js:5-19`）。
- `usage` 仅次数量，无 token/金额（`storageService.js:186-220`）；写入点 `quotaService.js:91,104,117`。
- `openaiLLMProvider`/`opencodeLLMProvider` 已回传 `usage` 但未持久化（`openaiLLMProvider.js:78`、`opencodeLLMProvider.js:62`）。
- `videoService` 在 `activeTasks` 固定 provider 用于轮询（`videoService.js:42,92-106,120-121`）。
- 安全惯例：`openaiImageProvider.js` 的 `readLimitedBody`/私网拒绝；`imageProviderFactory.js:63-64` 忽略项目级 baseUrl/key。
- 测试入口与隔离护栏（`scripts/run-tests.js:34-81`）；测试强制 mock。
- `storageService.save()` 为整库 debounce 全量重写（`storageService.js:87-106`）。

### 12.2 假设（合理但未在代码中验证）

- **[假设]** 现有调用点（47 处引用）不会因工厂内部重构而破坏——前提是**导出面只增不改**。
- **[假设]** 视频/图片/TTS 的调用方能在不改协议的前提下提供 `taskType` 与 `unitCount`（duration/张数/字符数）——`videoService.generateShot` 已带 `duration`，图片 `n=1`，可满足；TTS 字符数需确认 `dubbingService` 是否可得。
- **[假设]** 单进程 Node 下，JSONL 追加 + `asyncLock` 足以避免写交错（未做多进程部署假设）。

### 12.3 待验证（落地前必须核实）

- **[待验证]** OpenAI `usage.prompt_tokens_details.cached_tokens` 与 DeepSeek `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` 的确切字段名与语义。
- **[待验证]** 各家模型单价与**计费单位**（尤其 gpt-image-1 是否按 token 计费；视频按秒还是按调用；ElevenLabs 按字符还是按分钟）。
- **~~[待验证] ComfyUI API~~ → 已核实**（附录 C：`/prompt`、`/history/{id}`、`/view`、`/queue`、`/interrupt` 契约；`/interrupt` 只作用于 RUNNING；无原生鉴权）。仍需**在目标机器上**确认版本差异。
- **[待验证-实例相关]** ComfyUI 视频工作流的**终节点输出形态**（单文件 mp4/webp，还是帧序列）——取决于运维提供的模板，接入时以目标实例 `/object_info` 与 `/history` 实际返回为准。
- **[待验证-实例相关]** 目标 ComfyUI 版本对 `/history` 中 output 字段的命名（`gifs`/`images`/`videos`/`files`）——**按实例实测**，代码里做通用遍历而非写死。
- **[待验证]** `storageService.save()` 整库重写在高频指标写入下的实际性能影响（本方案按"应避免"设计，但未实测）。
- **[待验证-运维]** ComfyUI 实例是否已安装 `ffmpeg`（无 ffmpeg 时 `video/h264-mp4` 等格式直接失败，`image/gif` 可作存活验证）。

---

## 附录 A：执行级回退时序图（文本版）

```
调用方 (scriptService / videoService / imageService / dubbingService)
  │  executeWithFallback(stage, taskType, ctx, callFn)
  ▼
executionRouter
  │ requestId = uuid; chain = providerRouter.resolveRoute(stage, taskType, scope)
  │ chain 为空 → chain = [{ fromResolveProviderConfig }]   // 退化链
  │
  ├─ attempt=1: spec=primary
  │    instance = providerRegistry.createProvider(stage, spec)
  │    try  result = await retrySameProvider(instance, spec)   // 文本走 generateJSONWithRetry
  │    catch err:
  │       cls = classifyError(err)
  │       metricsStore.append(metric{attempt:1,isFallback:false,errorClass:cls,...})
  │       if !policy.allows(cls) or switches>=maxSwitches: throw
  │
  ├─ attempt=2: spec=fallbacks[0]   ← 成功则本条链结束
  │    sleep(switchBackoffMs)
  │    ... 同上，metric{attempt:2,isFallback:true}
  │
  └─ 全部失败 → 抛最后一次错误（附完整 attempt 指标链）
            成功 → 返回 { result, usedSpec, requestId }
```

## 附录 B：ComfyUI 视频回退注意事项（与 §6.4 呼应）

```
提交前失败 (generateVideo throws)          → 允许跨供应商切换          （不产生远端计费）
提交成功 + 轮询超时 (getTaskStatus timeout) → 继续轮询原任务；到 pollDeadline 才重提交
提交成功 + 状态 failed/cancelled           → 允许切换（记录 retriedSubmission=true）
用户取消                                    → 立即终止，不切换
```

## 附录 C：ComfyUI API 契约与接入事实（已核实，2026-10）

> 来源：ComfyUI 官方文档（Server Messages / API 参考 / Startup Flags）、官方 `server.py` 源码、官方 openapi schema。标注「需验证」的为社区经验。**接入前请以目标实例 `/object_info` 与实测为准**。

### C.1 HTTP 端点契约

| 端点 | 方法 | 用途 | 关键点 |
|---|---|---|---|
| `/prompt` | POST | 提交工作流 | body `{ prompt: <API格式图>, client_id? }` → `{ prompt_id, number, node_errors }`；校验失败 400 带 `node_errors[*].errors[*].extra_info.input_name`（**用这个 key 修字段，别猜**） |
| `/history` / `/history/{id}` | GET | 查询结果 | 结束才出现 key；看 `status.status_str`；`outputs[node]` 的 key 随节点不同 |
| `/view` | GET | 取产物文件 | `?filename=&subfolder=&type=output\|input\|temp`；拒绝 `..`/前导 `/`；视频以正常 MIME 返回 |
| `/queue` | GET/POST | 队列 | POST `{clear:true}` 清 pending / `{delete:[id]}` 取消 pending（不影响 RUNNING） |
| `/interrupt` | POST | 中断 | 只作用于 RUNNING，可选 `{prompt_id}`；pending 用 `/queue delete` |
| `/object_info` | GET | 节点定义 | 参数名/取值/输出节点的权威来源；**启动自检用** |
| `/ws?clientId=` | WS | 进度/完成信号 | 消息按 `prompt_id` 自行过滤；`executing` 且 `node=null` = 整流程结束 |
| `/free` | POST | 释放显存 | `{unload_models, free_memory}`，卡死兜底 |

**工作流必须是「API 格式」**（`{ "<node_id>": {class_type, inputs} }`），由 UI `File → Export (API)` 导出；UI 保存格式（含坐标/连线）服务端不接受，且无法从 prompt 反推。

### C.2 提交 → 完成 → 取产物（推荐序列）

```
GET /object_info (启动缓存，版本变更时刷新)
→ (i2v 时) POST /upload/image → name 写入 LoadImage.inputs.image
→ 深拷贝模板 + 按白名单注入参数
→ clientId=uuid; ws=new WebSocket(`${base}/ws?clientId=${clientId}`)
→ POST /prompt { prompt, client_id } → { prompt_id }（记 deadline/lastProgress）
→ WS: progress 更新心跳；execution_error/execution_interrupted 判失败；executing(node=null) 判完成
   ↳ 看门狗超时 → POST /interrupt {prompt_id} → POST /queue {delete:[prompt_id]}
→ GET /history/{prompt_id} 对账（status.status_str）→ 遍历 outputs 取全部文件
→ GET /view?... 流式下载（分块 + 字节上限）
→ 可选 POST /history {clear:true} 清记录（≠删磁盘文件，需自行清理）
```
> **产物永远从 `/history` + `/view` 取**，WS 只作"何时完成"的信号。纯轮询亦可（间隔 1–5s），但只给完成不给细粒度进度。**`prompt_id` 是唯一任务主键**，用于对账/去重/取消。

### C.3 跨机器启动与网络（运维必读）

- **ComfyUI 默认只绑 `127.0.0.1:8188`**；跨机器必须 `--listen <私网IP>`（或不带值= `0.0.0.0`）。**一旦暴露即无鉴权**，官方明示"暴露方自负安全"。
- **绝不裸暴露公网**。推荐：Node 后端与 ComfyUI 同私网/VPN（WireGuard/Tailscale/SSH 隧道），防火墙仅放行后端 IP，需要时再叠加反代 TLS + basic auth；**浏览器不直连 ComfyUI**（经后端中转）。
- 反向代理若要代 WS：`proxy_http_version 1.1` + `Upgrade`/`Connection: upgrade`，并调大 `proxy_read_timeout`（默认 60s 会切断长任务/空闲 WS）。
- 自定义节点 = 任意 Python 代码执行；`/prompt` 可调用任意已装节点 → **后端必须白名单 `class_type` 与参数**，禁止把外部字符串直接注入。

### C.4 视频工作流生态（模板来源参考）

| 方案 | 模态 | 适用 |
|---|---|---|
| **Wan 2.2（官方原生）** | T2V / I2V | 一个模型同时覆盖 T2V+I2V 的性价比首选；24GB 可跑 640×640/81 帧 |
| SVD（原生） | I2V | 简单稳定，写实短镜头（帧数少） |
| LTX-Video（原生） | T2V/I2V | 速度/显存优先 |
| AnimateDiff | T2V（2D/动漫） | 短循环，非写实首选 |
| HunyuanVideo / CogVideoX | T2V/I2V | 画质强但显存要求高/需额外节点 |

注入字段（按 `/object_info` 核对）：`prompt`/`negative`（CLIPTextEncode.text）、`seed`、`steps`、`cfg`、`width`/`height`（16/32 对齐）、`length`/`frames`（常为 `4n+1`/`8n+1`）、`fps`、输入图、`filename_prefix`。

### C.5 Node.js 客户端选型

| 包 | 说明 |
|---|---|
| `@stable-canvas/comfyui-client` | 直连本地 raw REST + WS，零依赖，最贴合本方案；可参考或直接用 |
| `@comfyorg/sdk`（官方） | 走 Comfy API v2，自托管需额外跑 `comfy-api-proxy`；**多一个组件** |
| 自研薄客户端 | raw 协议小（≈200 行 fetch + ws + 轮询），可规避第三方版本耦合 |

**建议**：v1 自研薄客户端（可控、无额外组件），需要时参考 `@stable-canvas/comfyui-client`。

### C.6 接入风险清单（ComfyUI 专属）

- **安全**：无鉴权 + 跨机 = 高风险；`--enable-cors-header` 拆浏览器 CSRF 护栏；已知 `Origin: null` 绕过 + `/userdata/*.html` 存储型 XSS 链；`/history` 可能含密钥的 `sensitive` 槽（视为敏感面）。
- **稳定性**：单 GPU 单队列串行（长任务阻塞）；**无内置超时**（必须外部看门狗）；断客户端不停止生成；**无持久化**（重启即丢 `/history`，旧 `prompt_id` 无法对账）；视频依赖 `ffmpeg`；产物无删除 API（磁盘必膨胀）；WS 掉线/乱序/预览二进制帧要防。
- **版本兼容**：必须 API 格式；`class_type`/input 名/默认值随版本变；`/api` 前缀与裸路径并存，raw 端点官方无跨版本兼容保证 → **固定 ComfyUI 版本**并当作需适配的依赖。
- **性能**：VRAM 硬约束（OOM 会卸载模型致下个任务冷启动）；冷加载数十秒~数分钟；轮询 `/history` 全量返回需用 `max_items`/`offset`；大视频下载建议流式转发，勿全读进内存。

### C.7 反哺主方案的修正点

1. `comfyuiVideoProvider.getTaskStatus` 的**产物解析必须通用遍历** `outputs[node]` 的所有 key，不能写死 `images`。
2. **看门狗为必备**（不是可选）：`maxPollMs` 到点主动 `interrupt` + `queue delete`。
3. **实例自检**：启动时 `GET /object_info` 校验模板节点/字段存在，避免版本漂移导致的静默失败。
4. **`--listen` 是暴露前提**：配置 `COMFYUI_ALLOWED_HOSTS` 时，需运维确认监听地址在白名单内。

## 附录 D：ComfyUI 参考工作流（骨架，Phase 3 按实例校验后定稿）

> **已决策**：模板由本方案提供，输出**单个视频文件**。
> 下面是**骨架**：节点连线与字段名以目标实例 `GET /object_info` 为准，模型文件名是**实例相关**的，用 `{{...}}` 占位，必须替换为机器上实际的 safetensors 名。**未经实例校验前不要直接用。**

### D.1 映射文件 `src/config/comfyuiWorkflows/t2v_default.map.json`

```json
{
  "id": "t2v-default",
  "kind": "t2v",
  "outputNodeId": "12",
  "outputKind": "video",
  "inputs": {
    "promptText": { "nodeId": "4", "field": "text" },
    "negative":   { "nodeId": "5", "field": "text" },
    "seed":       { "nodeId": "8", "field": "seed" },
    "steps":      { "nodeId": "8", "field": "steps" },
    "cfg":        { "nodeId": "8", "field": "cfg" },
    "width":      { "nodeId": "6", "field": "width" },
    "height":     { "nodeId": "6", "field": "height" },
    "duration":   { "nodeId": "6", "field": "length" },
    "fps":        { "nodeId": "11", "field": "fps" },
    "filenamePrefix": { "nodeId": "12", "field": "filename_prefix" }
  }
}
```

### D.2 工作流骨架 `src/config/comfyuiWorkflows/t2v_default.json`（API 格式）

> 以 Wan 2.2 原生 T2V 为例（一个模型同时覆盖 T2V/I2V，24GB 可跑 640×640/81 帧）。**节点 class_type 与 inputs 字段需用 `/object_info` 核对**。

```json
{
  "1":  { "class_type": "UNETLoader",              "inputs": { "unet_name": "{{WAN_UNET}}", "weight_dtype": "default" } },
  "2":  { "class_type": "CLIPLoader",              "inputs": { "clip_name": "{{WAN_CLIP}}", "type": "wan" } },
  "3":  { "class_type": "VAELoader",               "inputs": { "vae_name": "{{WAN_VAE}}" } },
  "4":  { "class_type": "CLIPTextEncode",          "inputs": { "text": "{{PROMPT}}", "clip": ["2", 0] } },
  "5":  { "class_type": "CLIPTextEncode",          "inputs": { "text": "{{NEGATIVE}}", "clip": ["2", 0] } },
  "6":  { "class_type": "Wan22ImageToVideoLatent", "inputs": { "width": 640, "height": 640, "length": 81, "batch_size": 1, "vae": ["3", 0] } },
  "7":  { "class_type": "ModelSamplingSD3",        "inputs": { "model": ["1", 0], "shift": 8.0 } },
  "8":  { "class_type": "KSampler",                "inputs": { "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0], "seed": 0, "steps": 20, "cfg": 6.0, "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0 } },
  "9":  { "class_type": "VAEDecode",               "inputs": { "samples": ["8", 0], "vae": ["3", 0] } },
  "11": { "class_type": "CreateVideo",             "inputs": { "images": ["9", 0], "fps": 16 } },
  "12": { "class_type": "SaveVideo",               "inputs": { "video": ["11", 0], "filename_prefix": "dreamreel/{{REQUEST_ID}}", "format": "auto", "codec": "auto" } }
}
```

**i2v 变体**：把 `"6"` 换成加载输入图（`LoadImage.image` = 先 `/upload/image` 得到的 name），并让 latent 节点接收该图（具体字段按 `/object_info`）。映射文件里补 `referenceImage`。

### D.3 Phase 3 定稿 checklist（在目标机器上逐条过）

1. `GET /object_info` → 确认上表 `class_type` 全部存在；不存在则按实际节点名替换（版本差异）。
2. 确认 `{{WAN_UNET}}/{{WAN_CLIP}}/{{WAN_VAE}}` 等模型文件名与机器上 `models/` 里实际文件一致（`GET /models` 或 `object_info` 的 combo 取值）。
3. 确认 `Wan22ImageToVideoLatent` 的 `width/height/length` 约束（宽度/高度 16 对齐、`length` 常为 `4n+1`）。
4. 确认 `SaveVideo` 在 `/history` 中的输出 key 名（可能不是 `images`）→ 回填产物解析（附录 C.7）。
5. 确认实例装了 `ffmpeg`；否则 `format` 改用 `image/gif` 先验证链路。
6. 跑一条真实 `POST /prompt`，用 `scripts/`（Phase 3 新增的一次性自检脚本）验证「提交 → 完成 → 取到单个 mp4」。
7. 把校验结果写回模板文件，去掉所有 `{{占位}}`。

---

*（本文件为设计定稿 v1.0，2026-10-17。5 项关键决策已确认并落入对应章节；§11.4 剩余未决不阻塞 Phase 0/1；§12.3 与附录 D 的实例相关项在对应 Phase 内核实。附录 C 为 2026-10 已核实的 ComfyUI 接入事实。）*
