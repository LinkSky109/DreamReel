# 路由清单（自动生成）

生成时间：2026-10-20T12:31:55.062Z
挂载文件：`src/app.js`

> 由 `node scripts/inventory.js` 生成，请勿手工编辑。

## 挂载概览

| 前缀 | 路由文件 | 中间件 | 端点数 |
|---|---|---|---:|
| `/api/auth` | `src/routes/auth.js` | — | 5 |
| `/api/subscription` | `src/routes/subscription.js` | — | 5 |
| `/api/projects` | `src/routes/projects.js` | `authOptional` | 26 |
| `/api/projects` | `src/routes/versions.js` | `authOptional` | 6 |
| `/api/stats` | `src/routes/stats.js` | `authOptional` | 5 |
| `/api/moderation` | `src/routes/moderation.js` | `authOptional` | 4 |
| `/api/notifications` | `src/routes/notifications.js` | `authOptional` | 8 |
| `/api/script` | `src/routes/script.js` | `authOptional` | 3 |
| `/api/video` | `src/routes/video.js` | `authOptional` | 17 |
| `/api/characters` | `src/routes/characters.js` | `authOptional` | 5 |
| `/api/dubbing` | `src/routes/dubbing.js` | `authOptional` | 3 |
| `/api/export` | `src/routes/export.js` | `authOptional` | 3 |
| `/api/quota` | `src/routes/quota.js` | `authOptional` | 2 |
| `/api/templates` | `src/routes/templates.js` | `authOptional` | 7 |
| `/api/styles` | `src/routes/styles.js` | — | 3 |
| `/api/analysis` | `src/routes/analysis.js` | `authOptional` | 3 |
| `/api/collab` | `src/routes/collaboration.js` | `authOptional` | 12 |
| `/api/providers` | `src/routes/providers.js` | — | 3 |
| `/api/providers` | `src/routes/providerMetrics.js` | — | 3 |
| `/api/system` | `src/routes/system.js` | — | 7 |
| `/api/webhooks` | `src/routes/webhooks.js` | — | 8 |
| `/api/ai-assistant` | `src/routes/aiAssistant.js` | — | 5 |
| `/api/audio` | `src/routes/audio.js` | `authOptional` | 7 |
| `/api/scenes` | `src/routes/scenes.js` | `authOptional` | 6 |
| `/api/marketing` | `src/routes/marketing.js` | `authOptional` | 3 |
| `/api/creators` | `src/routes/creators.js` | `authOptional` | 2 |
| `/api/gallery` | `src/routes/gallery.js` | `authOptional` | 7 |
| `/api/challenges` | `src/routes/challenges.js` | `authOptional` | 4 |
| `/api/teams` | `src/routes/teams.js` | `authOptional` | 9 |
| `/api/open/v1` | `src/routes/openApi.js` | — | 4 |
| `/api/api-keys` | `src/routes/apiKeys.js` | `authOptional` | 3 |
| `/api/store` | `src/routes/store.js` | `authOptional` | 4 |
| `/api/enterprise` | `src/routes/enterprise.js` | `authOptional` | 6 |
| `/api/title-sequences` | `src/routes/titleSequences.js` | — | 2 |
| `/api/directors` | `src/routes/directors.js` | — | 4 |
| `/api/studios` | `src/routes/studios.js` | — | 12 |
| `/api/images` | `src/routes/images.js` | `authOptional` | 7 |
| `/api/edit-plans` | `src/routes/editPlans.js` | `authOptional` | 6 |
| `/api/community` | `src/routes/community.js` | `authOptional` | 15 |
| `/api/novels` | `src/routes/novels.js` | `authOptional` | 89 |
| `/api/cloud-drive` | `src/routes/cloudDrive.js` | `authOptional` | 4 |

合计：**41 个挂载前缀，337 个端点**。

## 鉴权分布

- 显式 `authRequired`：0 个前缀
- `authOptional`（可匿名）：29 个前缀
- 未挂鉴权中间件：41 个前缀

未挂鉴权的 API 前缀：
- `/api/auth`（`src/routes/auth.js`）
- `/api/subscription`（`src/routes/subscription.js`）
- `/api/projects`（`src/routes/projects.js`）
- `/api/projects`（`src/routes/versions.js`）
- `/api/stats`（`src/routes/stats.js`）
- `/api/moderation`（`src/routes/moderation.js`）
- `/api/notifications`（`src/routes/notifications.js`）
- `/api/script`（`src/routes/script.js`）
- `/api/video`（`src/routes/video.js`）
- `/api/characters`（`src/routes/characters.js`）
- `/api/dubbing`（`src/routes/dubbing.js`）
- `/api/export`（`src/routes/export.js`）
- `/api/quota`（`src/routes/quota.js`）
- `/api/templates`（`src/routes/templates.js`）
- `/api/styles`（`src/routes/styles.js`）
- `/api/analysis`（`src/routes/analysis.js`）
- `/api/collab`（`src/routes/collaboration.js`）
- `/api/providers`（`src/routes/providers.js`）
- `/api/providers`（`src/routes/providerMetrics.js`）
- `/api/system`（`src/routes/system.js`）
- `/api/webhooks`（`src/routes/webhooks.js`）
- `/api/ai-assistant`（`src/routes/aiAssistant.js`）
- `/api/audio`（`src/routes/audio.js`）
- `/api/scenes`（`src/routes/scenes.js`）
- `/api/marketing`（`src/routes/marketing.js`）
- `/api/creators`（`src/routes/creators.js`）
- `/api/gallery`（`src/routes/gallery.js`）
- `/api/challenges`（`src/routes/challenges.js`）
- `/api/teams`（`src/routes/teams.js`）
- `/api/open/v1`（`src/routes/openApi.js`）
- `/api/api-keys`（`src/routes/apiKeys.js`）
- `/api/store`（`src/routes/store.js`）
- `/api/enterprise`（`src/routes/enterprise.js`）
- `/api/title-sequences`（`src/routes/titleSequences.js`）
- `/api/directors`（`src/routes/directors.js`）
- `/api/studios`（`src/routes/studios.js`）
- `/api/images`（`src/routes/images.js`）
- `/api/edit-plans`（`src/routes/editPlans.js`）
- `/api/community`（`src/routes/community.js`）
- `/api/novels`（`src/routes/novels.js`）
- `/api/cloud-drive`（`src/routes/cloudDrive.js`）

## 端点明细

### `/api/auth` — `src/routes/auth.js`

- `POST` `/api/auth/register`
- `POST` `/api/auth/login`
- `GET` `/api/auth/me`
- `GET` `/api/auth/me/model-preferences`
- `PUT` `/api/auth/me/model-preferences`

### `/api/subscription` — `src/routes/subscription.js`

- `GET` `/api/subscription/plans`
- `GET` `/api/subscription/current`
- `POST` `/api/subscription/subscribe`
- `POST` `/api/subscription/cancel`
- `POST` `/api/subscription/reactivate`

### `/api/projects` — `src/routes/projects.js`

- `POST` `/api/projects/`
- `GET` `/api/projects/`
- `GET` `/api/projects/recent`
- `POST` `/api/projects/batch/delete`
- `POST` `/api/projects/batch/archive`
- `POST` `/api/projects/batch/favorite`
- `GET` `/api/projects/recycle-bin/list`
- `GET` `/api/projects/recycle-bin/stats`
- `POST` `/api/projects/recycle-bin/:projectId/restore`
- `DELETE` `/api/projects/recycle-bin/:projectId`
- `DELETE` `/api/projects/recycle-bin`
- `POST` `/api/projects/:projectId/favorite`
- `POST` `/api/projects/:projectId/archive`
- `POST` `/api/projects/:projectId/duplicate`
- `GET` `/api/projects/tags`
- `GET` `/api/projects/:projectId`
- `PUT` `/api/projects/:projectId`
- `POST` `/api/projects/:projectId/thumbnail`
- `POST` `/api/projects/:projectId/cover`
- `DELETE` `/api/projects/:projectId`
- `GET` `/api/projects/:projectId/export`
- `POST` `/api/projects/import`
- `PUT` `/api/projects/:id/shots/order`
- `PUT` `/api/projects/:id/shots/:shotId/duration`
- `GET` `/api/projects/:projectId/model-config`
- `PUT` `/api/projects/:projectId/model-config`

### `/api/projects` — `src/routes/versions.js`

- `GET` `/api/projects/:projectId/versions`
- `POST` `/api/projects/:projectId/versions`
- `GET` `/api/projects/:projectId/versions/compare`
- `GET` `/api/projects/:projectId/versions/:versionId`
- `POST` `/api/projects/:projectId/versions/:versionId/rollback`
- `DELETE` `/api/projects/:projectId/versions/:versionId`

### `/api/stats` — `src/routes/stats.js`

- `GET` `/api/stats/dashboard`
- `GET` `/api/stats/overview`
- `GET` `/api/stats/trend`
- `GET` `/api/stats/styles`
- `GET` `/api/stats/quota`

### `/api/moderation` — `src/routes/moderation.js`

- `POST` `/api/moderation/check`
- `POST` `/api/moderation/check-batch`
- `GET` `/api/moderation/stats`
- `GET` `/api/moderation/logs`

### `/api/notifications` — `src/routes/notifications.js`

- `GET` `/api/notifications/`
- `GET` `/api/notifications/unread-count`
- `POST` `/api/notifications/:id/read`
- `POST` `/api/notifications/read-all`
- `DELETE` `/api/notifications/:id`
- `DELETE` `/api/notifications/`
- `GET` `/api/notifications/preferences`
- `PATCH` `/api/notifications/preferences`

### `/api/script` — `src/routes/script.js`

- `POST` `/api/script/generate`
- `POST` `/api/script/revise`
- `POST` `/api/script/adapt`

### `/api/video` — `src/routes/video.js`

- `POST` `/api/video/generate`
- `POST` `/api/video/generate-all/:projectId`
- `GET` `/api/video/history/:projectId`
- `GET` `/api/video/history/shot/:shotId`
- `GET` `/api/video/history/:projectId/stats`
- `DELETE` `/api/video/history/:projectId`
- `GET` `/api/video/queue`
- `GET` `/api/video/queue/project/:projectId`
- `POST` `/api/video/queue/cancel/:taskId`
- `POST` `/api/video/queue/cancel-project/:projectId`
- `GET` `/api/video/queue/history`
- `POST` `/api/video/regenerate`
- `POST` `/api/video/candidates`
- `PUT` `/api/video/shots/:shotId/lock`
- `PUT` `/api/video/shots/:shotId`
- `POST` `/api/video/shots/:shotId/version/:versionIndex`
- `GET` `/api/video/continuity/check`

### `/api/characters` — `src/routes/characters.js`

- `POST` `/api/characters/`
- `POST` `/api/characters/:characterId/lock`
- `POST` `/api/characters/:characterId/evaluate`
- `GET` `/api/characters/`
- `PATCH` `/api/characters/:characterId/styling`

### `/api/dubbing` — `src/routes/dubbing.js`

- `POST` `/api/dubbing/generate`
- `GET` `/api/dubbing/voices`
- `POST` `/api/dubbing/preview`

### `/api/export` — `src/routes/export.js`

- `POST` `/api/export/project/:projectId`
- `POST` `/api/export/project/:projectId/sync`
- `GET` `/api/export/project/:projectId/history`

### `/api/quota` — `src/routes/quota.js`

- `GET` `/api/quota/me`
- `GET` `/api/quota/:userId`

### `/api/templates` — `src/routes/templates.js`

- `GET` `/api/templates/`
- `GET` `/api/templates/user/mine`
- `POST` `/api/templates/user/create-from-project`
- `DELETE` `/api/templates/user/:templateId`
- `GET` `/api/templates/categories`
- `GET` `/api/templates/:templateId`
- `POST` `/api/templates/:templateId/create`

### `/api/styles` — `src/routes/styles.js`

- `GET` `/api/styles/`
- `GET` `/api/styles/:styleId`
- `POST` `/api/styles/preview`

### `/api/analysis` — `src/routes/analysis.js`

- `POST` `/api/analysis/project/:projectId`
- `POST` `/api/analysis/project/:projectId/sync`
- `GET` `/api/analysis/project/:projectId`

### `/api/collab` — `src/routes/collaboration.js`

- `GET` `/api/collab/:projectId/comments`
- `POST` `/api/collab/:projectId/comments`
- `PATCH` `/api/collab/:projectId/comments/:commentId/resolve`
- `DELETE` `/api/collab/:projectId/comments/:commentId`
- `POST` `/api/collab/:projectId/comments/:commentId/like`
- `DELETE` `/api/collab/:projectId/comments/:commentId/like`
- `GET` `/api/collab/:projectId/comments/:commentId/replies`
- `GET` `/api/collab/:projectId/comments/stats`
- `GET` `/api/collab/:projectId/activities`
- `GET` `/api/collab/:projectId/share`
- `PUT` `/api/collab/:projectId/share`
- `GET` `/api/collab/shared/:token`

### `/api/providers` — `src/routes/providers.js`

- `GET` `/api/providers/status`
- `GET` `/api/providers/available`
- `GET` `/api/providers/video-models`

### `/api/providers` — `src/routes/providerMetrics.js`

- `GET` `/api/providers/metrics`
- `GET` `/api/providers/compare`
- `GET` `/api/providers/costs`

### `/api/system` — `src/routes/system.js`

- `GET` `/api/system/info`
- `GET` `/api/system/health`
- `GET` `/api/system/performance`
- `GET` `/api/system/performance/resources`
- `GET` `/api/system/performance/requests`
- `GET` `/api/system/performance/history`
- `POST` `/api/system/performance/reset`

### `/api/webhooks` — `src/routes/webhooks.js`

- `GET` `/api/webhooks/`
- `GET` `/api/webhooks/events`
- `POST` `/api/webhooks/`
- `GET` `/api/webhooks/:webhookId`
- `PUT` `/api/webhooks/:webhookId`
- `DELETE` `/api/webhooks/:webhookId`
- `POST` `/api/webhooks/:webhookId/test`
- `GET` `/api/webhooks/:webhookId/deliveries`

### `/api/ai-assistant` — `src/routes/aiAssistant.js`

- `GET` `/api/ai-assistant/quick-actions`
- `GET` `/api/ai-assistant/conversation/:projectId`
- `POST` `/api/ai-assistant/chat/:projectId`
- `POST` `/api/ai-assistant/quick-action/:projectId`
- `DELETE` `/api/ai-assistant/conversation/:projectId`

### `/api/audio` — `src/routes/audio.js`

- `GET` `/api/audio/bgm`
- `GET` `/api/audio/bgm/:id`
- `POST` `/api/audio/bgm/recommend`
- `GET` `/api/audio/sfx`
- `GET` `/api/audio/sfx/:id`
- `GET` `/api/audio/stats`
- `POST` `/api/audio/preview`

### `/api/scenes` — `src/routes/scenes.js`

- `GET` `/api/scenes/`
- `GET` `/api/scenes/:id`
- `POST` `/api/scenes/`
- `PUT` `/api/scenes/:id`
- `DELETE` `/api/scenes/:id`
- `GET` `/api/scenes/stats/info`

### `/api/marketing` — `src/routes/marketing.js`

- `GET` `/api/marketing/poster/options`
- `POST` `/api/marketing/poster/generate`
- `POST` `/api/marketing/trailer/generate`

### `/api/creators` — `src/routes/creators.js`

- `GET` `/api/creators/:userId`
- `PUT` `/api/creators/:userId`

### `/api/gallery` — `src/routes/gallery.js`

- `GET` `/api/gallery/categories`
- `GET` `/api/gallery/`
- `POST` `/api/gallery/:projectId/publish`
- `POST` `/api/gallery/:projectId/unpublish`
- `POST` `/api/gallery/:projectId/view`
- `POST` `/api/gallery/:projectId/like`
- `POST` `/api/gallery/:projectId/remix`

### `/api/challenges` — `src/routes/challenges.js`

- `GET` `/api/challenges/`
- `GET` `/api/challenges/:challengeId`
- `POST` `/api/challenges/:challengeId/join`
- `POST` `/api/challenges/:challengeId/submit/:projectId`

### `/api/teams` — `src/routes/teams.js`

- `POST` `/api/teams/`
- `GET` `/api/teams/`
- `GET` `/api/teams/:teamId`
- `PUT` `/api/teams/:teamId`
- `POST` `/api/teams/:teamId/members`
- `PUT` `/api/teams/:teamId/members/:userId`
- `DELETE` `/api/teams/:teamId/members/:userId`
- `POST` `/api/teams/:teamId/projects/:projectId`
- `GET` `/api/teams/:teamId/projects`

### `/api/open/v1` — `src/routes/openApi.js`

- `POST` `/api/open/v1/projects`
- `GET` `/api/open/v1/projects/:projectId`
- `POST` `/api/open/v1/videos/generate`
- `GET` `/api/open/v1/key/info`

### `/api/api-keys` — `src/routes/apiKeys.js`

- `POST` `/api/api-keys/`
- `GET` `/api/api-keys/`
- `DELETE` `/api/api-keys/:id`

### `/api/store` — `src/routes/store.js`

- `GET` `/api/store/packs`
- `GET` `/api/store/packs/:packId`
- `POST` `/api/store/packs/:packId/purchase`
- `GET` `/api/store/my-assets`

### `/api/enterprise` — `src/routes/enterprise.js`

- `GET` `/api/enterprise/overview`
- `GET` `/api/enterprise/config`
- `PUT` `/api/enterprise/config`
- `GET` `/api/enterprise/audit`
- `GET` `/api/enterprise/audit/stats`
- `GET` `/api/enterprise/deployment`

### `/api/title-sequences` — `src/routes/titleSequences.js`

- `GET` `/api/title-sequences/`
- `POST` `/api/title-sequences/:id/generate`

### `/api/directors` — `src/routes/directors.js`

- `GET` `/api/directors/`
- `POST` `/api/directors/disable`
- `GET` `/api/directors/:id`
- `POST` `/api/directors/:id/apply`

### `/api/studios` — `src/routes/studios.js`

- `GET` `/api/studios/`
- `POST` `/api/studios/`
- `GET` `/api/studios/:id`
- `PUT` `/api/studios/:id`
- `POST` `/api/studios/:id/members`
- `DELETE` `/api/studios/:id/members/:userId`
- `POST` `/api/studios/:id/shows`
- `GET` `/api/studios/:id/shows`
- `GET` `/api/studios/:id/shows/:showId`
- `POST` `/api/studios/:id/projects/:projectId`
- `GET` `/api/studios/:id/projects`
- `POST` `/api/studios/:id/shows/:showId/projects/:projectId`

### `/api/images` — `src/routes/images.js`

- `POST` `/api/images/generate`
- `GET` `/api/images/assets`
- `GET` `/api/images/assets/:id`
- `DELETE` `/api/images/assets/:id`
- `POST` `/api/images/assets/:id/apply`
- `GET` `/api/images/providers`
- `GET` `/api/images/stats`

### `/api/edit-plans` — `src/routes/editPlans.js`

- `GET` `/api/edit-plans/profiles`
- `POST` `/api/edit-plans/generate`
- `GET` `/api/edit-plans/:projectId`
- `DELETE` `/api/edit-plans/:projectId`
- `POST` `/api/edit-plans/:projectId/render`
- `GET` `/api/edit-plans/:projectId/transition-support`

### `/api/community` — `src/routes/community.js`

- `GET` `/api/community/leaderboard`
- `GET` `/api/community/recommendations`
- `POST` `/api/community/reviews`
- `GET` `/api/community/reviews`
- `GET` `/api/community/reviews/:id`
- `POST` `/api/community/reviews/:id/like`
- `GET` `/api/community/notifications`
- `GET` `/api/community/notifications/unread-count`
- `POST` `/api/community/notifications/read-all`
- `POST` `/api/community/notifications/:id/read`
- `POST` `/api/community/reports`
- `GET` `/api/community/reports`
- `GET` `/api/community/reports/pending`
- `GET` `/api/community/reports/:id`
- `POST` `/api/community/reports/:id/process`

### `/api/novels` — `src/routes/novels.js`

- `POST` `/api/novels/`
- `GET` `/api/novels/`
- `DELETE` `/api/novels/:id`
- `GET` `/api/novels/:id`
- `POST` `/api/novels/:id/marks/toggle`
- `GET` `/api/novels/:id/storyboard`
- `POST` `/api/novels/:id/storyboard/from-marks`
- `PATCH` `/api/novels/:id/storyboard/:sid`
- `DELETE` `/api/novels/:id/storyboard/:sid`
- `POST` `/api/novels/:id/storyboard/import`
- `PUT` `/api/novels/:id/style`
- `POST` `/api/novels/:id/ingest`
- `GET` `/api/novels/:id/chunks`
- `GET` `/api/novels/:id/chunks/:chunkId`
- `POST` `/api/novels/:id/extract`
- `GET` `/api/novels/:id/extract/status`
- `POST` `/api/novels/:id/extract-all`
- `GET` `/api/novels/:id/characters`
- `PATCH` `/api/novels/:id/characters/:cid`
- `POST` `/api/novels/:id/characters/:cid/approve`
- `PATCH` `/api/novels/:id/characters/:cid/review`
- `POST` `/api/novels/:id/review/confirm-all`
- `POST` `/api/novels/:id/review/bulk`
- `GET` `/api/novels/:id/review-stats`
- `POST` `/api/novels/:id/style/generate`
- `GET` `/api/novels/:id/characters/:cid/states`
- `POST` `/api/novels/:id/characters/:cid/states`
- `GET` `/api/novels/:id/timeline`
- `PUT` `/api/novels/:id/characters/:cid/states/:episodeNo`
- `DELETE` `/api/novels/:id/characters/:cid/states/:episodeNo`
- `POST` `/api/novels/:id/episodes/:eid/states`
- `GET` `/api/novels/:id/episodes/:eid/states`
- `GET` `/api/novels/:id/voices`
- `PUT` `/api/novels/:id/voices`
- `POST` `/api/novels/:id/voices/reset`
- `GET` `/api/novels/:id/voices/library`
- `POST` `/api/novels/:id/voices/clone`
- `POST` `/api/novels/:id/voices/design`
- `POST` `/api/novels/:id/voices/preview`
- `DELETE` `/api/novels/:id/voices/:voiceId`
- `GET` `/api/novels/:id/series/estimate`
- `POST` `/api/novels/:id/series/plan`
- `GET` `/api/novels/:id/seasons`
- `GET` `/api/novels/:id/seasons/:sid/assets`
- `POST` `/api/novels/:id/seasons/:sid/assets/bulk-generate`
- `POST` `/api/novels/:id/seasons/:sid/bulk`
- `GET` `/api/novels/:id/episodes`
- `POST` `/api/novels/:id/episodes/:eid/script`
- `GET` `/api/novels/:id/episodes/:eid/script`
- `GET` `/api/novels/:id/consistency`
- `POST` `/api/novels/:id/episodes/:eid/assets`
- `GET` `/api/novels/:id/episodes/:eid/assets`
- `POST` `/api/novels/:id/episodes/:eid/compose`
- `GET` `/api/novels/:id/manifest`
- `POST` `/api/novels/:id/sync`
- `GET` `/api/novels/:id/sync/scopes`
- `GET` `/api/novels/:id/sync/ledger`
- `POST` `/api/novels/:id/episodes/:eid/handoff`
- `POST` `/api/novels/:id/episodes/:eid/handoff/import`
- `GET` `/api/novels/:id/handoff`
- `GET` `/api/novels/:id/episodes/:eid/shots`
- `POST` `/api/novels/:id/episodes/:eid/shots/auto-refs`
- `PUT` `/api/novels/:id/episodes/:eid/shots/:index/refs`
- `POST` `/api/novels/:id/episodes/:eid/handoff/shots`
- `POST` `/api/novels/:id/episodes/:eid/shots/import`
- `POST` `/api/novels/:id/world/extract`
- `GET` `/api/novels/:id/world`
- `GET` `/api/novels/:id/world/entities`
- `GET` `/api/novels/:id/world/relations`
- `GET` `/api/novels/:id/model-config`
- `PUT` `/api/novels/:id/model-config`
- `POST` `/api/novels/:id/model-config/test`
- `GET` `/api/novels/:id/assets`
- `POST` `/api/novels/:id/assets/normalize`
- `POST` `/api/novels/:id/assets/bulk-cancel`
- `GET` `/api/novels/:id/assets/bulk-status`
- `POST` `/api/novels/:id/assets/bulk-generate`
- `POST` `/api/novels/:id/assets/suggest`
- `POST` `/api/novels/:id/assets`
- `PATCH` `/api/novels/:id/assets/:aid`
- `DELETE` `/api/novels/:id/assets/:aid`
- `POST` `/api/novels/:id/assets/:aid/generate`
- `GET` `/api/novels/:id/schema`
- `POST` `/api/novels/:id/advance`
- `GET` `/api/novels/:id/characters/sets`
- `POST` `/api/novels/:id/characters/select`
- `PATCH` `/api/novels/:id/world/entities/:eid/review`
- `GET` `/api/novels/:id/world/sets`
- `POST` `/api/novels/:id/world/select`

### `/api/cloud-drive` — `src/routes/cloudDrive.js`

- `POST` `/api/cloud-drive/quark/qr`
- `GET` `/api/cloud-drive/quark/qr/:token/status`
- `GET` `/api/cloud-drive/quark/status`
- `POST` `/api/cloud-drive/quark/logout`

