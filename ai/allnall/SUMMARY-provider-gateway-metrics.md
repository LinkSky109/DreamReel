# 供应商网关 / 指标成本 / 执行级回退 —— 工作内容总结

> 生成时间：2026-10-19
> 范围：供应商与模型配置、ComfyUI 视频、全阶段指标与成本、LiteLLM 网关、执行级回退

---

## 一、提交记录

| commit | 内容 |
|---|---|
| `466acdf` | LiteLLM 网关 + 全阶段调用指标/成本 + 执行级回退（LLM/图片/TTS） |
| `5043d81` | 视频提交阶段回退（comfyui → seedance） |

> `src/config/index.js`、`.env.example` 为多人共享文件，采用 **hunk 级暂存**，仅提交本工作的部分。

---

## 二、供应商与模型配置

- **模型更新**：`deepseek-chat`（官方已退役，2026-07-24）→ **`deepseek-flash`**（默认值、provider 默认、目录、`.env`）。
- **模型目录**：DeepSeek 改为 `deepseek-flash` / `deepseek-v4-pro`；新增 `litellm` provider。
- **套餐端点识别**：图片 `doubao-seedream-5.0-pro`、视频 `doubao-seedance-2.5` 走火山方舟 `/api/plan` → 计费模型为**套餐（边际成本 0）**；视频默认改为自托管 **ComfyUI**。

## 三、ComfyUI 视频接入

文件：`src/providers/comfyuiVideoProvider.js`、`comfyuiWorkflow.js`、`src/config/comfyuiWorkflows/wan22_ti2v.json`

- 异步任务：`/prompt` 提交 → `/history/{id}` 轮询 → `/view` 下载 → 落地 `storage/videos/`。
- 安全：主机白名单、固定路径白名单、下载字节上限、不跟随返回的任意 URL、并发信号量。
- 看门狗：超时自动 `interrupt` + `queue delete`。
- 工作流：API 格式；支持**多参考图 / 多提示词 / 多配音**；T2V/I2V；`CreateVideo→SaveVideo(mp4/h264)` 或 `SaveWEBM` 兼容。
- **真机验证**：I2V、T2V 均产出真实 h264 mp4（ffprobe 确认）。

## 四、全阶段调用指标与成本

文件：`usageNormalizer` / `costEstimator` / `metricsStore` / `metricsRecorder` / `withMetrics` / `providerMetricsService` / `routes/providerMetrics.js`

- 存储：独立 `storage/metrics/*.jsonl`（不写 db.json）。
- 成本（CNY）：DeepSeek 单价 + **分时价（高峰×2，北京时间）**；OpenAI（USD×6.69）；火山 plan=套餐(0)；ComfyUI/mock/opencode=免费(0)。
- 埋点：工厂级自动（LLM/图片/TTS）+ ComfyUI 视频终态。
- 读取接口（已挂载）：`GET /api/providers/metrics|compare|costs`。
- **真机验证**：文本、图片、TTS、视频均真实产出并计入指标。

## 五、LiteLLM 网关

文件：`litellm/config.yaml`、`litellm/README.md`、`docker-compose.yml`

- 统一多供应商/套餐端点；每个 deployment 独立 `api_base`/`api_key`。
- 新增 `litellm` provider（OpenAI 兼容）；`.env` 已切 `LLM_PROVIDER=litellm`。
- **真机验证**：网关 `/v1/chat/completions` 与应用经网关调用均成功并计成本。

## 六、执行级回退（全阶段）

核心：`src/services/executionRouter.js`
- `shouldSwitch`：超时/5xx/429/401/网络/未知 → 切换；400/422 → 不切换。
- `composeWithFallback`：按序调用、**requestId 串联**、**单次尝试软超时**、支持任意方法。

| 阶段 | 机制 | 验证 |
|---|---|---|
| 文本 LLM | 工厂链 `litellm → deepseek` | ✅ 真机（停网关自动切直连）|
| 图片 | 工厂链 | 单测 |
| TTS | 工厂链 | 单测 |
| 视频 | **提交阶段链** `comfyui → seedance` | 单测 + 链构建真机确认 |

## 七、工具与文档

- `scripts/verify-provider-metrics.js`（指标管线）
- `scripts/verify-comfyui.js`（ComfyUI 真机出片，`--dry` 只校验）
- `scripts/verify-media.js`（图片/TTS 真机冒烟）
- 设计文档：`ai/docs/provider-routing-and-cost-design.md`

## 八、测试

- 本工作相关区域（comfyui / metrics / cost / executionRouter / videoFallback）全部通过。
- 全量套件存在来自并行小说模块的 flaky 用例（重型 ffmpeg），与本工作无关。

## 九、已知限制与后续

1. 图片/TTS 无第二真实供应商 → 回退为"配置就绪"，未真实触发。
2. 视频真实跨供应商回退未实跑（会耗 GPU/云端额度），逻辑已单测覆盖。
3. DeepSeek 法定节假日未细化（节假日按高峰，偏保守）。
4. LiteLLM 为 LLM 单点 → 已用 `LLM_FALLBACK_PROVIDERS=deepseek` 兜底。
5. 软超时不会真正中断底层请求（后续可做可中断）。
