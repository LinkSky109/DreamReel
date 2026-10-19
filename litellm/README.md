# LiteLLM 供应商网关（DreamReel）

用 LiteLLM 统一管理「多供应商 / 多套餐端点 / 多 token」，对外提供 **一个 OpenAI 兼容端点**。
这样跨供应商、跨套餐的端点与凭证差异由 LiteLLM 的 `config.yaml` 承载，应用侧不再手写。

## 它解决什么

| 问题 | LiteLLM 的做法 |
|---|---|
| 同一供应商 plan 端点与按量端点不同 | 配成**两个 deployment**，各自 `api_base` + `api_key` |
| 不同套餐用不同 token | 每个 deployment 独立 `api_key: os.environ/XXX` |
| 多家供应商协议不一 | 统一到 OpenAI 兼容 API |
| 成本/额度 | 内置价表与 spend 追踪（`volcengine/doubao-seedance-*` 按秒计价等） |

## 启动

```bash
# 1) 需要网关自己的 key（客户端用它访问 4000）
echo 'LITELLM_MASTER_KEY=sk-dreamreel-local' >> .env

# 2) 启动
docker compose up -d litellm
# 或本地：litellm --config litellm/config.yaml --port 4000

# 3) 自检
curl http://127.0.0.1:4000/health/liveliness
```

管理界面： http://127.0.0.1:4000/ui

## 配置来源

`litellm/config.yaml` 里的密钥全部用 `os.environ/XXX` 引用，复用你 **已配置** 的 `.env`：
`DEEPSEEK_* / OPENCODE_* / SEEDANCE_* / OPENAI_IMAGE_* / VOLC_TTS_*`。

## 接入 DreamReel（已完成）

`.env` 已切换为经网关：
```env
LLM_PROVIDER=litellm
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
LITELLM_MODEL=deepseek-flash
LITELLM_MASTER_KEY=sk-dreamreel-local-litellm
```
- 新增 `litellm` provider（复用 OpenAI 兼容实现），指标里 `provider=litellm`、`model=deepseek-flash`，成本按底层模型折算。
- **前置依赖**：LLM 调用前需 `docker compose up -d litellm`（网关不在时 LLM 会失败；回退直连把 `LLM_PROVIDER` 改回 `deepseek`）。
- 已真机验证：网关 `/v1/chat/completions` 与经应用的调用均成功并计入指标。

## 待核对的项（必须以你账号为准）

1. **模型 ID**：`config.yaml` 里图片/视频的 model id 用你控制台的真实值（`.env` 里的可能是别名）。
2. **OpenCode 鉴权**：本地 OpenCode 用 `Basic(opencode:PASSWORD)`，LiteLLM 的 `openai/` 走 Bearer——可能需 `extra_headers`。
3. **plan 端点兼容性**：确认 `https://ark.cn-beijing.volces.com/api/plan/v3` 作为 `api_base` 时，LiteLLM 的 chat/image/video 处理器都能打通。
4. **ComfyUI**：LiteLLM **不覆盖** ComfyUI（自托管、非标准视频协议），它继续走 DreamReel 自研 provider。
