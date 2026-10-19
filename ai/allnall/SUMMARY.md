# DreamReel 工作内容总结

> 生成时间：2026-10-19
> 范围：供应商/模型配置、ComfyUI 视频、全阶段指标与成本、LiteLLM 网关、执行级回退

---

## 一、提交记录

| commit | 内容 |
|---|---|
| `466acdf` | LiteLLM 网关 + 全阶段调用指标/成本 + 执行级回退（LLM/图片/TTS） |
| `5043d81` | 视频提交阶段回退（comfyui → seedance） |

> `src/config/index.js`、`.env.example` 为多人共享文件，采用 **hunk 级暂存**，仅提交了属于本工作的部分。

---

## 二、供应商与模型配置

- **模型更新**：`deepseek-chat`（官方已退役，2026-07-24）→ **`deepseek-flash`**
  - 涉及：`src/config/index.js` 默认值、`src/providers/openaiLLMProvider.js`、`llmProviderFactory` 目录、`.env`。
- **模型目录**：DeepSeek 改为 `deepseek-flash` / `deepseek-v4-pro`；新增 `litellm` provider。
- **套餐端点识别**：
  - 图片（`doubao-seedream-5.0-pro`）与视频（`doubao-seedance-2.5`）走火山方舟 **`/api/plan`** 端点 → 计费模型为 **套餐（边际成本 0）**。
  - 视频默认改为自托管 **ComfyUI**。

---

## 三、ComfyUI 视频接入

**文件**：`src/providers/comfyuiVideoProvider.js`、`src/providers/comfyuiWorkflow.js`、`src/config/comfyuiWorkflows/wan22_ti2v.json`

**能力**：
- 异步任务：提交 `/prompt` → 轮询 `/history/{id}` → `/view` 下载 → 落地 `storage/videos/`。
- 安全：主机白名单、固定路径白名单、下载字节上限、不跟随返回的任意 URL、并发信号量。
- 看门狗：超时自动 `interrupt` + `queue delete`，防 GPU 泄漏。
- 工作流：API 格式；支持 **多参考图 / 多提示词 / 多配音**；T2V / I2V；`CreateVideo→SaveVideo(mp4/h264)` 或 `SaveWEBM` 兼容。
- 注册：视频工厂 `PROVIDER_MAP`、`VIDEO_MODEL_CATALOG`、`isProviderConfigured`、`.env.example`。

**真机验证**：I2V、T2V 均产出真实 **h264 mp4**（ffprobe 确认），并落指标。

---

## 四、全阶段调用指标与成本

**文件**：`usageNormalizer.js`、`costEstimator.js`、`metricsStore.js`、`metricsRecorder.js`、`withMetrics.js`、`providerMetricsService.js`、`routes/providerMetrics.js`

- **存储**：独立 `storage/metrics/invocations-YYYY-MM-DD.jsonl`（不写 `db.json`），按日聚合、保留期清理。
- **成本口径（CNY）**：
  - DeepSeek：`deepseek-flash` / `v4-pro` 单价，**分时价（高峰×2，北京时间工作日 9–12、14–18）**。
  - OpenAI：`gpt-4o` / `gpt-4o-mini`（USD×6.69 折算）。
  - 火山 plan 端点（seedream/seedance/tts）：**套餐 → 0**。
  - ComfyUI / mock / opencode：**免费 → 0**。
- **埋点**：工厂级自动（LLM/图片/TTS，含 token/缓存字段）；ComfyUI 视频终态记录。
- **读取接口**（已挂载）：`GET /api/providers/metrics|compare|costs`。

**真机验证**：文本（DeepSeek）、图片（Seedream）、TTS（volc Agent Plan）、视频（ComfyUI）均真实产出并计入指标。

---

## 五、LiteLLM 网关

**文件**：`litellm/config.yaml`、`litellm/README.md`、`docker-compose.yml`（litellm 服务）

- 统一多供应商/套餐端点；每个 deployment 独立 `api_base` / `api_key`。
- 已收录模型：`deepseek-flash`、`opencode-deepseek-flash-free`、`doubao-seedream-5.0-pro`、`doubao-seedance-2.5`。
- 新增 `litellm` provider（OpenAI 兼容）；`.env` 已切 `LLM_PROVIDER=litellm`。
- **真机验证**：网关 `/v1/chat/completions` 与应用经网关调用均成功并计入成本。

---

## 六、执行级回退（全阶段）

**核心**：`src/services/executionRouter.js`
- `shouldSwitch(error)`：超时/5xx/429/401/网络/未知 → 切换；400/422 → 不切换。
- `composeWithFallback(instances, baseMeta, methods)`：按序调用、**requestId 串联**（同一次逻辑调用的多次尝试可关联）、**单次尝试软超时**、支持任意方法。

| 阶段 | 机制 | 验证 |
|---|---|---|
| 文本 LLM | 工厂链 `litellm → deepseek` | ✅ 真机：停网关自动切直连 |
| 图片 | 工厂链（`IMAGE_FALLBACK_PROVIDERS`）| 单测 |
| TTS | 工厂链（`TTS_FALLBACK_PROVIDERS`）| 单测 |
| 视频 | **提交阶段链** `comfyui → seedance`（提交成功前失败才切；之后固定 provider 轮询）| 单测 + 链构建真机确认 |

---

## 七、工具与文档

- 验证脚本：
  - `scripts/verify-provider-metrics.js`（指标管线 + 独立 HTTP 服务）
  - `scripts/verify-comfyui.js`（ComfyUI I2V/T2V 真机出片，`--dry` 只校验）
  - `scripts/verify-media.js`（图片/TTS 真机冒烟）
- 设计文档：`ai/docs/provider-routing-and-cost-design.md`（v1.0）

---

## 八、关键配置项

```env
# LLM 网关
LLM_PROVIDER=litellm
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
LITELLM_MODEL=deepseek-flash
LITELLM_MASTER_KEY=***

# 回退
LLM_FALLBACK_PROVIDERS=deepseek
IMAGE_FALLBACK_PROVIDERS=
TTS_FALLBACK_PROVIDERS=
VIDEO_FALLBACK_PROVIDERS=seedance
LLM_ATTEMPT_TIMEOUT_MS=30000

# 视频（ComfyUI）
VIDEO_PROVIDER=comfyui
COMFYUI_BASE_URL=http://192.168.31.113:8188
COMFYUI_ALLOWED_HOSTS=192.168.31.113
COMFYUI_LENGTH=49
VIDEO_POLL_MAX_MS=1800000
```

---

## 九、测试基线

- 当前套件：**724 用例 / 723 通过**。
- 唯一失败 `Sprint 19 小说 → 角色流水线` 属**并行开发的小说模块**（重型 ffmpeg，已知 flaky），与本工作无关。
- 本工作相关区域（comfyui / metrics / cost / executionRouter / videoFallback）全部通过。

---

## 十、已知限制与后续

1. **图片/TTS 无第二真实供应商** → 回退是"配置就绪"，未真实触发。
2. **视频真实跨供应商回退未实跑**（会消耗 GPU/云端额度）；逻辑已单测覆盖、链已按配置构建。
3. **DeepSeek 法定节假日**未细化（节假日按高峰算，偏保守）。
4. **LiteLLM 是 LLM 单点** → 已用 `LLM_FALLBACK_PROVIDERS=deepseek` 兜底。
5. 建议后续：把图片/TTS 接入第二个真实供应商以验证回退；补充节假日历；给单次尝试超时做真正可中断（当前为软超时，底层请求可能仍在跑）。

---

## 十一、文件索引（本工作新增/主要改动）

**新增**
- `src/providers/comfyuiVideoProvider.js`
- `src/providers/comfyuiWorkflow.js`
- `src/config/comfyuiWorkflows/wan22_ti2v.json`
- `src/config/modelPricing.js`
- `src/services/usageNormalizer.js`、`costEstimator.js`、`metricsStore.js`、`metricsRecorder.js`、`withMetrics.js`、`executionRouter.js`、`providerMetricsService.js`
- `src/routes/providerMetrics.js`
- `litellm/config.yaml`、`litellm/README.md`
- `scripts/verify-provider-metrics.js`、`verify-comfyui.js`、`verify-media.js`
- 测试：`comfyuiVideoProvider`、`comfyuiWorkflow`、`metricsStore`、`costEstimator`、`modelPricing`、`usageNormalizer`、`withMetrics`、`executionRouter`、`providerMetricsApi`、`providerMetricsService`、`videoFallback`
- 设计文档：`ai/docs/provider-routing-and-cost-design.md`

**改动**
- `src/config/index.js`、`src/providers/{baseLLMProvider,llmProviderFactory,openaiLLMProvider,providerResolver,imageProviderFactory,ttsProviderFactory,videoProviderFactory,comfyuiWorkflow}.js`、`src/services/videoService.js`、`src/server.js`
- `.env.example`、`docker-compose.yml`、`tests/providerIntegration.test.js`
