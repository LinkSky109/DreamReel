# DreamReel Sprint 20 交付报告：LLM 接入（AI SDK/OpenCode）+ 风格确定 + 角色成长状态

- 任务 ID：`TASK-20261012-020`
- 工作流上下文：`ai/workflow/context-sprint20.yaml`
- 分支：`main`
- 最终状态：✅ S20-1/S20-2 达成；S20-3 骨架交付（生成待后续）

---

## 一、范围与产出

| 项 | 交付 | 状态 |
|---|---|---|
| S20-1 LLM 接入 | `src/providers/opencodeLLMProvider.js`（AI SDK v7 + `ai-sdk-provider-opencode-sdk`）；工厂/config/resolver 注册 `opencode`；多供应商口子 | ✅ 真实调用验证 |
| S20-2 风格确定 | `novelStyleService`（LLM 产出全书风格，启发式回退）；`POST /api/novels/:id/style/generate`；CLI `style` | ✅ 真实 LLM 验证 |
| S20-3 角色成长状态 | `NovelCharacterState` 模型 + storage + `characterGrowthService` + API（列出/追加） | ✅ 骨架（生成待后续） |

**新增依赖**：`ai@^7`、`ai-sdk-provider-opencode-sdk@^5`、`zod@^4`（采纳 Vercel AI SDK，见 plan §4.1）。

---

## 二、真实 LLM 证据（本机 OpenCode 2.0.26 服务）

启用方式：`LLM_PROVIDER=opencode`（本机服务发现，或 `OPENCODE_BASE_URL` + `OPENCODE_PASSWORD`）。

**冒烟**：`node scripts/llm-smoke.js` → `opencode/big-pickle` 返回「连接成功」。

**风格确定（真实 LLM）**：
```
name: 末世废土·冷血生存美学
visual: 灰黄主色调叠加深褐与锈红……血色作为唯一高饱和点缀……
narration: 冷峻克制的第三人称有限视角，白描式短句……
music: 低频轰鸣与环境风声……黑暗、孤寂、悲怆中藏一丝顽强的生命力
provider: llm
```

**角色抽取（真实 LLM，8 章 / maxChars 6000）**：
```
3 个角色：血瞳 / 铜牙 / 黑熊（provider: llm）
对照启发式（同期）: 输出含 那就/尤其/通过 等噪声
```

**质量对照**：LLM 产出**干净、成体系**（含别名归一如 铜牙←黄牙；rich 性格/关系/能力），启发式为低频噪声基线。→ **LLM 路径足以支撑「修订率<30%」**（正式复核需一轮人工审核，见限制）。

---

## 三、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **550 tests / 550 pass / 0 fail**（新增风格+成长 1 例，及 provider 列表断言更新） |
| 测试隔离 | 开发库未被修改 |
| `npm run lint` | 0 error / 0 warning |

---

## 四、已知限制与风险

1. **OpenCode v2 无服务端结构化输出**：JSON 靠 prompt 约束 + 客户端解析（`BaseLLMProvider.generateJSON`）。已在 plan 记录；后续可加 `jsonRepair`/多次重试。
2. **免费模型偶发慢**：一次 30 章抽取曾 >5 分钟未返回 → 已加 **provider 侧超时（默认 120s）+ 抽取失败回退启发式**（`provider: heuristic-fallback`，如实标注），避免挂死。
3. **全书 LLM 抽取需分片聚合**：当前单次调用只喂一个样本（受上下文限制），全书建议按章分片多次抽取后合并去重（后续细化）。
4. **修订率未正式复核**：需一轮人工审核跑 `review-stats` 才能给出数字。
5. **形象图/音色样本**：本轮未做（预留）。

---

## 五、新增 / 修改文件

**新增**：`src/providers/opencodeLLMProvider.js`、`src/models/NovelCharacterState.js`、`src/services/novelStyleService.js`、`src/services/characterGrowthService.js`、`scripts/llm-smoke.js`、`ai/workflow/context-sprint20.yaml`、`ai/docs/sprint20-delivery-report.md`

**修改**：`src/providers/llmProviderFactory.js`、`src/providers/providerResolver.js`、`src/config/index.js`、`src/services/storageService.js`、`src/services/characterExtractionService.js`、`src/routes/novels.js`、`scripts/novel.js`、`tests/novelSeries.test.js`、`tests/providerIntegration.test.js`、`package.json`、`README.md`

---

## 六、结论

Sprint 20 把 **LLM 真正接上**（Vercel AI SDK + OpenCode provider），风格确定与角色抽取均**真实 LLM 验证通过**，并补齐角色成长状态骨架。全量 **550/550/0**。

**最终状态：`GLOBAL_DONE`（S20-1/S20-2 达成；S20-3 骨架；全书分片抽取与修订率正式复核列为后续）。**
