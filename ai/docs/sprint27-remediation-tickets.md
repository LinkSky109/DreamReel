# Sprint 27 整改工单（Remediation Tickets）

> 来源：Sprint 27「长篇小说全维度抽取升级」的开发/测试/一致性工作流评审。
> 下列为**预存在的横切问题**，非本次改动引入；本轮按工作流登记，排期另行处理。

## TICKET-27-01（HIGH）小说接口缺少归属校验（IDOR / 越权）
- 现象：`/api/novels/*` 经 `authOptional` 挂载，`NovelProject` 无 `userId` 字段，
  所有 `:id` 路由未做归属校验，任意（含匿名）调用者可跨租户读取/修改他人小说项目的原文、切片、角色、世界观，并触发抽取。
- 证据：`src/server.js:124`、`src/middleware/auth.js:27`、`src/services/novelProjectService.js`、`src/models/NovelProject.js`。
- 对照：`projects` 路由使用 `requireProjectOwnership`（`src/middleware/projectAccess.js`）。
- 建议：`NovelProject` 增加 `userId`，创建时写入；为全部 `:id` 路由加归属校验；拒绝 `novelId`↔`characterId` 不匹配。
- 级别：HIGH（阻断发布级，但为预存在缺口，独立修复）。

## TICKET-27-02（HIGH）缺少限流（Rate Limiting）
- 现象：全站无 rate limit 中间件；`POST /api/novels/:id/extract`、`/:id/world/extract` 为高成本 LLM 接口。
- 建议：对抽取类接口加 per-IP + per-user 限流（如 `express-rate-limit`）。
- 级别：HIGH（与 TICKET-27-01 叠加放大 DoS 风险）。

## TICKET-27-03（HIGH）LLM Provider 配置合并的 SSRF / 密钥外泄类
- 现象：`buildMergedConfig` 将用户/项目偏好 `config`（含 `baseUrl`）与**全局 apiKey** 合并；
   用户可通过 `PUT /api/auth/me/model-preferences` 覆盖 `baseUrl`，使服务端把全局密钥发往攻击者端点。
   同类：`scriptService` 从 `req.body` 接收 `projectId`。
- 对照：`imageProviderFactory.js` 已显式加固（忽略项目/用户级覆盖）；LLM 路径缺等价保护。
- 建议：Provider `baseUrl` 白名单校验或忽略用户覆盖；密钥仅服务端；不从请求体接收 `projectId`。
- 备注：Sprint 27 已修复"抽取接口 body spread 注入 projectId"这一条路径；此为剩余同类面。

## TICKET-27-04（LOW，已缓解）compose 用例偶发失败（既有 flakiness）
- 现象：`tests/novelSeries.test.js` 的「单集成片」在并行全量下偶发 400；隔离单跑通过，与本次改动无关。
- 根因：`run-tests.js` 默认 8 并发，同时跑多个 ffmpeg（mock 占位视频/成片），高负载下占位视频偶发失败 → 文件未落盘 → 成片 400。
- 缓解（2026-10-15）：`run-tests.js` 加 `--test-concurrency=4`；`MockVideoProvider._generatePlaceholder` 失败重试一次。连续 3 次全量均 570/570。
- 后续（可选）：mock 占位视频改为预置 mp4 fixture，彻底去掉 ffmpeg 依赖。
