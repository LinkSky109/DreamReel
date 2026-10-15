# DreamReel API 文档

## Provider 配置 API（Phase 1）

### 概述

Phase 1 实现了「各阶段模型可自定义」功能，支持视频生成（video）、剧本生成（llm）、配音（tts）三个阶段的 Provider 独立配置。

配置采用**四级回退链**：
1. **项目级配置** — 最高优先级，针对单个项目定制
2. **用户全局默认** — 用户在个人设置中指定的默认偏好
3. **系统全局默认** — 通过 `.env` 环境变量配置
4. **Mock** — 最终兜底，无需 API Key

每次回退前自动校验目标 Provider 的 API Key 是否已配置；未配置的 Provider 在 UI 中置灰不可选。

---

### GET /api/providers/available

获取可用 Provider 目录，含配置状态、支持模型、能力标签等元数据。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| stage | string | 否 | 过滤阶段：`video`、`llm`、`tts` |

#### 响应示例（无 stage 过滤）

```json
{
  "video": {
    "stage": "video",
    "models": [
      {
        "id": "runway",
        "name": "Runway",
        "vendor": "RunwayML",
        "configured": true,
        "models": ["gen-3-alpha", "gen-3-alpha-turbo"],
        "strengths": ["高保真", "电影感"]
      },
      {
        "id": "mock",
        "name": "Mock",
        "vendor": "DreamReel",
        "configured": true,
        "models": ["mock"],
        "strengths": ["零成本", "快速测试"]
      }
    ]
  },
  "llm": { ... },
  "tts": { ... }
}
```

#### 响应示例（stage=video）

```json
{
  "stage": "video",
  "models": [
    { "id": "runway", "name": "Runway", "configured": true, ... },
    { "id": "mock", "name": "Mock", "configured": true, ... }
  ]
}
```

---

### GET /api/projects/:projectId/model-config

获取指定项目的 Provider 配置及实际生效值。

#### 请求头

| 头字段 | 说明 |
|--------|------|
| Authorization | `Bearer <token>`（可选，未登录返回 default 用户视角） |

#### 响应示例

```json
{
  "projectId": "proj-xxx",
  "preferences": {
    "video": { "provider": "runway", "model": "gen-3-alpha", "config": {}, "updatedAt": "2026-10-05T08:30:00.000Z" },
    "llm": null,
    "tts": null,
    "updatedAt": "2026-10-05T08:30:00.000Z"
  },
  "resolved": {
    "video": { "provider": "runway", "model": "gen-3-alpha", "source": "project" },
    "llm": { "provider": "openai", "model": "gpt-4o", "source": "global-default" },
    "tts": { "provider": "mock", "model": "mock", "source": "global-default" }
  }
}
```

**source 字段说明**：
- `project` — 来自项目级配置
- `user-default` — 来自用户全局默认偏好
- `global-default` — 来自系统全局默认（`.env`）
- `fallback` — 回退到 Mock

---

### PUT /api/projects/:projectId/model-config

更新项目的 Provider 配置。仅项目所有者或管理员可操作。

#### 请求头

| 头字段 | 说明 |
|--------|------|
| Authorization | `Bearer <token>`（必填） |

#### 请求体

```json
{
  "video": { "provider": "runway", "model": "gen-3-alpha", "config": {} },
  "llm": null,
  "tts": { "provider": "elevenlabs", "model": "multilingual-v2", "config": {} }
}
```

字段规则：
- 传入 `null` 清除该阶段的项目级配置，回退到用户默认/全局默认
- 传入对象则保存为该阶段的项目级配置
- 未传字段保持原值不变

#### 响应

同 GET，返回更新后的 `preferences` 和 `resolved`。

#### 错误码

| 状态码 | 说明 |
|--------|------|
| 403 | 无权修改该项目的模型配置 |
| 404 | 项目不存在 |

---

### GET /api/auth/me/model-preferences

获取当前登录用户的全局默认 Provider 偏好及实际生效值。

#### 请求头

| 头字段 | 说明 |
|--------|------|
| Authorization | `Bearer <token>`（必填） |

#### 响应示例

```json
{
  "preferences": {
    "video": { "provider": "runway", "model": "gen-3-alpha", "config": {} },
    "llm": { "provider": "openai", "model": "gpt-4o", "config": {} },
    "tts": null
  },
  "resolved": {
    "video": { "provider": "runway", "model": "gen-3-alpha", "source": "user-default" },
    "llm": { "provider": "openai", "model": "gpt-4o", "source": "user-default" },
    "tts": { "provider": "mock", "model": "mock", "source": "global-default" }
  }
}
```

---

### PUT /api/auth/me/model-preferences

更新当前登录用户的全局默认 Provider 偏好。

#### 请求头

| 头字段 | 说明 |
|--------|------|
| Authorization | `Bearer <token>`（必填） |

#### 请求体

```json
{
  "video": { "provider": "runway", "model": "gen-3-alpha", "config": {} },
  "llm": null,
  "tts": { "provider": "elevenlabs", "model": "multilingual-v2", "config": {} }
}
```

字段规则同项目级配置 PUT。

#### 响应

同 GET，返回更新后的 `preferences` 和 `resolved`。

#### 错误码

| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |

---

## 关键实现约束

1. **切换 Provider 不重新生成已有内容**：每个生成任务在创建时快照当前 Provider 实例存入 `activeTasks`，后续 `pollTaskStatus` 和 `cancelTask` 始终使用原始 Provider。
2. **向后兼容**：未配置 `providerPreferences` 的项目自动使用全局默认值；原始 `getVideoProvider()` / `getLLMProvider()` / `getTTSProvider()` 保持不变。
3. **API Key 可用性校验**：`isProviderConfigured(providerId)` 在回退链每一级执行，未配置 API Key 的 Provider 不会被选中。
4. **LRU 缓存（可选）**：`get*ProviderForProject()` 支持 `projectId+provider` → instance 的缓存，默认 TTL 5 分钟。
