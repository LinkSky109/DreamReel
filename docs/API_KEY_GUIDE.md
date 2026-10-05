# DreamReel API Key 配置指南

> 本文档说明各 Provider 所需的 API Key、获取方式及配置步骤。
> 配置完成后，可通过 `npm test` 和手动验证脚本进行真实调用测试。

---

## 一、视频生成 Provider（VIDEO_PROVIDER）

### 1. Runway（`runway`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `RUNWAY_API_KEY` | Runway API 密钥 |
| 模型（可选） | `RUNWAY_MODEL` | 默认 `gen3a_turbo` |

**获取方式：**
1. 访问 https://runwayml.com/ 注册账号
2. 进入 Dashboard → API 页面申请 API Key
3. 复制 Key 填入 `.env` 的 `RUNWAY_API_KEY`

**特点：**
- 支持 image-to-video（参考图注入）
- 电影感强、运镜自然
- 支持 5-10 秒视频生成

---

### 2. Pika（`pika`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `PIKA_API_KEY` | Pika API 密钥 |
| 模型（可选） | `PIKA_MODEL` | 默认 `pika-1.0` |

**获取方式：**
1. 访问 https://pika.art/ 注册账号
2. 进入 Settings → API 页面获取 Key
3. 复制 Key 填入 `.env` 的 `PIKA_API_KEY`

**特点：**
- 支持 image-to-video
- 风格化、动画效果突出

---

### 3. Seedance / 字节跳动方舟（`seedance`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `SEEDANCE_API_KEY` | 火山引擎方舟 API Key |
| 基础 URL（可选） | `SEEDANCE_BASE_URL` | 默认 `https://ark.cn-beijing.volces.com/api/v3` |
| 模型（可选） | `SEEDANCE_MODEL` | 默认 `seedance-2.5` |

**获取方式：**
1. 访问 https://www.volcengine.com/ 注册火山引擎账号
2. 进入「方舟」控制台 → 创建 API Key
3. 开通 Seedance 视频生成服务
4. 复制 Key 填入 `.env` 的 `SEEDANCE_API_KEY`

**特点：**
- 国产模型，中文理解强
- 支持参考图注入
- 运镜自然

---

### 4. Minimax / 海螺 AI（`minimax`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `MINIMAX_API_KEY` | Minimax API 密钥 |
| Group ID | `MINIMAX_GROUP_ID` | **必填**，Minimax 分组 ID |
| 基础 URL（可选） | `MINIMAX_BASE_URL` | 默认 `https://api.minimax.chat/v1` |
| 模型（可选） | `MINIMAX_MODEL` | 默认 `video-01` |

**获取方式：**
1. 访问 https://platform.minimaxi.com/ 注册账号
2. 进入控制台 → API Keys 页面创建 Key
3. 获取 Group ID（在账号信息或项目设置中）
4. 分别填入 `.env` 的 `MINIMAX_API_KEY` 和 `MINIMAX_GROUP_ID`

**特点：**
- 国产模型，表情细腻
- 支持长镜头生成
- 需要 Group ID（区别于其他 provider）

---

### 5. 通义万相 / 阿里云 DashScope（`wan`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `WAN_API_KEY` | DashScope API Key |
| 基础 URL（可选） | `WAN_BASE_URL` | 默认 `https://dashscope.aliyuncs.com/api/v1` |
| 模型（可选） | `WAN_MODEL` | 默认 `wanx2.1-t2v-plus` |

**获取方式：**
1. 访问 https://dashscope.aliyun.com/ 注册阿里云账号
2. 进入控制台 → API Key 管理创建 Key
3. 开通「通义万相」视频生成服务
4. 复制 Key 填入 `.env` 的 `WAN_API_KEY`

**特点：**
- 国产模型，国风场景表现好
- 适合电商素材生成

---

## 二、LLM Provider（LLM_PROVIDER）

### OpenAI 兼容 API（`openai`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `OPENAI_API_KEY` | OpenAI 或兼容服务的 API Key |
| 模型 | `LLM_MODEL` | 默认 `gpt-4o-mini` |
| 基础 URL（可选） | `OPENAI_BASE_URL` | 自定义端点，如 Azure/vLLM/Ollama |

**获取方式（OpenAI 官方）：**
1. 访问 https://platform.openai.com/ 注册账号
2. 进入 API Keys 页面创建 Key
3. 复制 Key 填入 `.env` 的 `OPENAI_API_KEY`

**兼容服务示例：**

| 服务 | OPENAI_BASE_URL 示例 |
|------|----------------------|
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` |
| vLLM | `http://localhost:8000/v1` |
| Ollama | `http://localhost:11434/v1` |
| 其他兼容服务 | 服务商提供的端点 URL |

**特点：**
- 支持任何 OpenAI 兼容 API
- 剧本生成质量依赖模型能力
- 建议使用 GPT-4o / Claude 3.5 级别模型获得最佳效果

---

## 三、TTS Provider（TTS_PROVIDER）

### ElevenLabs（`elevenlabs`）

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| API Key | `ELEVENLABS_API_KEY` | ElevenLabs API 密钥 |
| 默认音色（可选） | `ELEVENLABS_VOICE_ID` | 默认 `21m00Tcm4Tlv` (Rachel) |
| 模型（可选） | `ELEVENLABS_MODEL` | 默认 `eleven_monolingual_v1` |

**获取方式：**
1. 访问 https://elevenlabs.io/ 注册账号
2. 进入 Profile → API Keys 创建 Key
3. 复制 Key 填入 `.env` 的 `ELEVENLABS_API_KEY`

**可选音色列表（默认内置）：**

| Voice ID | 名称 | 性别 | 语言 |
|----------|------|------|------|
| `21m00Tcm4Tlv` | Rachel | 女 | en |
| `AZnzlk1XvdvUeBnXmlld` | Domi | 女 | en |
| `EXAVITQu4vr4xnSDxMaL` | Bella | 女 | en |
| `ErXwobaYiN019PkySvjV` | Antoni | 男 | en |
| `MF3mGyEYCl7XYWbV9V6O` | Elli | 女 | en |
| `TxGEqnHWrfWFTfGW9XjX` | Josh | 男 | en |

> 提示：ElevenLabs 主要支持英文，中文语音合成效果有限。如需中文配音，建议后续接入豆包 TTS、阿里云语音合成等中文 TTS 服务。

---

## 四、快速配置步骤

### 步骤 1：复制环境变量模板

```bash
cp .env.example .env
```

### 步骤 2：编辑 .env，填入你的 API Key

```bash
# 示例：使用 Runway + OpenAI + ElevenLabs
VIDEO_PROVIDER=runway
RUNWAY_API_KEY=your_runway_key_here

LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
LLM_MODEL=gpt-4o-mini

TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_elevenlabs_key_here
```

### 步骤 3：运行测试验证

```bash
# 1. 运行接口一致性测试（无需 API Key）
npm test

# 2. 手动验证真实 Provider（需配置 API Key）
node scripts/verify-real-providers.js
```

### 步骤 4：启动服务

```bash
npm run dev
```

---

## 五、配置检查清单

在切换 Provider 前，请确认以下检查项：

- [ ] 已复制 `.env.example` 为 `.env`
- [ ] 已填入对应 Provider 的 API Key
- [ ] 已设置正确的 `VIDEO_PROVIDER` / `LLM_PROVIDER` / `TTS_PROVIDER`
- [ ] Minimax 用户已同时配置 `MINIMAX_API_KEY` 和 `MINIMAX_GROUP_ID`
- [ ] 自定义 API 端点用户已配置 `OPENAI_BASE_URL`
- [ ] 已运行 `npm test` 确认接口一致性测试通过
- [ ] 已运行手动验证脚本确认真实调用正常

---

## 六、常见问题

### Q1: 切换 Provider 后前端需要改代码吗？
**A:** 不需要。Provider 切换完全由后端配置控制，前端通过统一的 API 接口与后端交互，无需感知底层 Provider 变化。

### Q2: 可以同时配置多个 Provider 的 Key 吗？
**A:** 可以。`.env` 中可同时配置多个 Provider 的 Key，通过修改 `VIDEO_PROVIDER` 等变量即可切换，无需重新部署。

### Q3: API Key 错误会怎样？
**A:** 各 Provider 会在首次调用时检查 Key 是否存在，缺失或错误的 Key 会抛出明确的错误信息（如 `"Runway API key not configured"`），不会静默失败。

### Q4: 没有 API Key 可以运行吗？
**A:** 可以。将 Provider 设置为 `mock` 即可使用本地模拟数据运行完整流程，适合开发和演示。
