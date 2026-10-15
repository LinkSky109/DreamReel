# DreamReel Sprint 11 交付报告

- **任务 ID**: TASK-20261004-011
- **Sprint 名称**: 对标 LibTV 差距补齐（多模型 / 改编 / 造型室 / 一键复刻）
- **交付日期**: 2026-10-04
- **最终状态**: GLOBAL_DONE

---

## 一、交付范围

| 需求 ID | 需求名称 | 优先级 | 状态 |
|---------|---------|--------|------|
| R20 | 多视频模型 Provider 矩阵 | P0 | ✅ |
| R22 | 剧本原创与改编 | P0 | ✅ |
| R23 | 角色造型室 | P1 | ✅ |
| R25 | 广场作品一键复刻 | P0 | ✅ |

差距分析详见 [sprint11-gap-analysis.md](./sprint11-gap-analysis.md)。

---

## 二、功能详情

### R20 多视频模型 Provider 矩阵

新增三个国产视频 Provider（对标 LibTV 集成的 Seedance / Minimax / Wan）：

| Provider | 文件 | 厂商 | 模型 | 参考图 |
|---|---|---|---|---|
| seedance | `src/providers/seedanceVideoProvider.js` | 字节跳动 | seedance-2.5 | ✅ |
| minimax | `src/providers/minimaxVideoProvider.js` | Minimax | video-01 (Hailuo) | ✅ |
| wan | `src/providers/wanVideoProvider.js` | 阿里 DashScope | wanx2.1-t2v-plus | ✅ |

- 配置项：`SEEDANCE_API_KEY` / `MINIMAX_API_KEY` / `MINIMAX_GROUP_ID` / `WAN_API_KEY`
- 新增路由：`GET /api/providers/video-models` 返回模型目录（含厂商、能力标签、是否支持参考图）
- 切换方式：`VIDEO_PROVIDER=seedance|minimax|wan`
- 默认仍为 `mock`，无 Key 可直接跑通

### R22 剧本原创与改编

- `scriptService.adaptScript({ sourceText, adaptationType, targetDuration, style, platform, focus })`
- 路由：`POST /api/script/adapt`
- 四种改编方向：`short_drama`（短剧）/ `comic`（漫剧）/ `ad`（广告）/ `anime`（动漫）
- 与原创共用 `validateAndNormalize`，输出结构一致；新增 `sourceType='adaptation'`、`adaptationType`、`sourceDigest` 字段
- 支持通过 `projectId` 同步分镜到项目（与原创路径一致）
- 内容审核覆盖原文输入

### R23 角色造型室

- `Character` 模型新增三个字段：
  - `wardrobe`：服装描述
  - `makeup`：妆容描述
  - `styling`：整体造型风格
- 新方法：`character.updateStyling({ wardrobe, makeup, styling })`、`character.buildStylingPrompt()`
- 路由：`PATCH /api/characters/:id/styling`，返回 `stylingPrompt` 拼装结果
- 后续可在视频生成时自动注入 prompt（本期已留好 `buildStylingPrompt()` 入口）

### R25 广场作品一键复刻

- `galleryService.remix(publicProjectId, { userId, newName })`
- 路由：`POST /api/gallery/:projectId/remix`
- 行为：
  - 仅允许复刻已发布到广场的作品
  - 深拷贝剧本/角色/场景/镜头元数据，所有 id 重新生成
  - 镜头状态重置为 `pending`，`videoUrl` 清空（不复制视频文件）
  - 新项目记录 `remixOf` 与 `remixAuthor` 便于溯源
- 前端：广场卡片新增「🔄 复刻」按钮，点击后跳转到新项目

---

## 三、测试结果

- **单元测试**: 321 个全部通过（0 失败，未破坏 Sprint 1–10 已有测试）
- **E2E 冒烟**（端口 3012，mock provider）：
  - `GET /api/providers/video-models` → 返回 6 个模型（含 3 个国产）
  - `POST /api/script/adapt` → 基于 30 字原文返回完整分镜 JSON（2 角色 + 6 镜头）
  - `PATCH /api/characters/:id/styling` → wardrobe/makeup/styling 写入，`stylingPrompt` 正确拼装
  - `POST /api/gallery/:id/remix` → 返回 `remixId`、`sourceId`、`copiedShots`

---

## 四、新增/修改文件

**新增**
- `src/providers/seedanceVideoProvider.js`
- `src/providers/minimaxVideoProvider.js`
- `src/providers/wanVideoProvider.js`
- `docs/sprint11-gap-analysis.md`
- `docs/sprint11-delivery-report.md`
- `.workflow/context-sprint11.yaml`

**修改**
- `src/config/index.js`（新增三个国产模型的 Key/BaseUrl/Model 配置）
- `src/providers/videoProviderFactory.js`（注册 3 个新 Provider + `VIDEO_MODEL_CATALOG`）
- `src/routes/providers.js`（新增 `GET /video-models`，status 暴露新 Provider configured 状态）
- `src/services/scriptService.js`（新增 `adaptScript` 方法）
- `src/routes/script.js`（新增 `POST /adapt` 路由）
- `src/models/character.js`（新增 wardrobe/makeup/styling 字段 + `updateStyling` / `buildStylingPrompt`）
- `src/routes/characters.js`（新增 `PATCH /:id/styling`）
- `src/services/galleryService.js`（新增 `remix` 方法）
- `src/routes/gallery.js`（新增 `POST /:id/remix`）
- `public/js/views/gallery.js`（卡片加「复刻」按钮 + 事件绑定）

---

## 五、已知限制与后续建议

1. **真实 Provider 未联调**：三个国产 Provider 按官方公开文档写好接口，但未配置真实 Key 跑通过；切换 `VIDEO_PROVIDER` 后需要按 `.env.example` 补 Key 并补一次端到端验证。
2. **改编仅支持文本粘贴**：未做小说上传、URL 抓取、正版 IP 库对接；版权责任由用户承担。
3. **造型室尚未注入视频 prompt**：`buildStylingPrompt()` 已就绪，但 `videoService` 尚未在生成时拼接；下一个 Sprint 接通。
4. **复刻不复制 BGM/音效/配音**：只复制剧本/角色/镜头元数据，音频资产需要重新生成。
5. **前端造型编辑 UI 未做**：本期只暴露后端接口，编辑器角色 tab 的造型表单在 Sprint 12 补。
6. **导演模式 / 创意片头 / 画布五 tab 整合**：已列入 Sprint 12–14 路线图，见差距分析文档。

---

## 六、Sprint 规划衔接

- Sprint 1–10：P0–P3 全量交付（核心闭环 → 企业版 → PWA）✅
- **Sprint 11（本次）：对标 LibTV 差距补齐（多模型 / 改编 / 造型室 / 一键复刻）✅**
- Sprint 12（Next）：创意片头、造型 prompt 注入视频生成、编辑器造型表单 UI
- Sprint 13（Later）：导演模式、剧场计划厂牌
- Sprint 14（Later）：画布五 tab 整合、图片/音频独立生成
