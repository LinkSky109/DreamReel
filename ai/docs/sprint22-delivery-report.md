# DreamReel Sprint 22 交付报告：单集内容生成（图/音/视频）

- 任务 ID：`TASK-20261012-022`
- 工作流上下文：`ai/workflow/context-sprint22.yaml`
- 分支：`main`
- 最终状态：✅ 达成（mock 路径验证；Ark Doubao-Seedance-2.5 路径已接通，真实调用待 key）

---

## 一、范围与产出

| 项 | 交付 |
|---|---|
| S22-1 单集资产生成 | `episodeAssetService`：按集生成**关键帧图 / 旁白音 / 代表视频片段**；记 `episode.assets` + 落盘 `assets/<eid>.json` |
| 视频模型 | **火山方舟 Doubao-Seedance-2.5**：复用 `seedanceVideoProvider`（Ark endpoint）；`VIDEO_PROVIDER=seedance` 启用 |
| 接口 / CLI | `POST/GET /api/novels/:id/episodes/:eid/assets`；`npm run novel -- assets <novelId> <episodeId>` |

---

## 二、真实 E2E（《殖装》单集）

**mock 路径（默认）**：产出可预览素材
```
image: mock → .../assets/<eid>_frame.png（真实 PNG）
audio: mock → /storage/audio/voices/mock_*.wav（75s）
video: mock → /storage/videos/mock_*.mp4（status=completed，真实 mp4）
```

**Ark Doubao-Seedance-2.5 路径已接通**（缺 key 时如实报错）：
```
VIDEO_PROVIDER=seedance node scripts/novel.js assets ...
→ video: {"error":"Seedance API key not configured. Set SEEDANCE_API_KEY environment variable."}
```

---

## 三、配置（真实 Ark 调用）

```
VIDEO_PROVIDER=seedance
SEEDANCE_API_KEY=<你的火山方舟 API Key>
SEEDANCE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDANCE_MODEL=<Ark 的 Doubao-Seedance-2.5 模型/端点 ID>
```
（`SEEDANCE_MODEL` 默认 `seedance-2.5`；请填 Ark 控制台里的实际模型/端点 ID。）

---

## 四、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **552 tests / 552 pass / 0 fail**（新增单集资产 1 例） |
| 测试隔离 | 开发库未被修改 |
| `npm run lint` | 0 error / 0 warning |

---

## 五、已知限制与风险

1. **真实 Ark 调用未验证**：无 `SEEDANCE_API_KEY`，仅验证了路径接通与报错口径；真实生成需你给 key。
2. **单集仅生成"代表视频片段"**：90s 成片需多镜拼接（Sprint 23）。
3. **图/音为 mock**：真实文生图/语音需配置对应 provider/key。
4. **成本/配额**：真实视频生成按次计费，批量需配额（已记录）。

---

## 六、新增 / 修改文件

**新增**：`src/services/episodeAssetService.js`、`ai/workflow/context-sprint22.yaml`、`ai/docs/sprint22-delivery-report.md`

**修改**：`src/routes/novels.js`、`scripts/novel.js`、`tests/novelSeries.test.js`、`README.md`

---

## 七、结论

Sprint 22 打通**单集内容生成**（图/音/视频），视频模型接到**火山方舟 Doubao-Seedance-2.5**（路径验证通过）。mock 端到端产出可预览 PNG/WAV/MP4。全量 **552/552/0**。

**最终状态：`GLOBAL_DONE`（mock 验证；真实 Ark 生成待 key；多镜拼接归 Sprint 23）。**
