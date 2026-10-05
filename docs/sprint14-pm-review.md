# DreamReel Sprint 14 交付复核（独立复核，只看不改）

- 复核日期：2026-10-05
- 复核范围：R31 五合一画布、R32 图片生成、R35 工程收口
- 复核方式：两名独立子代理分别做正确性复核与安全复核；源码审读 + 自跑 `npm test` + 隔离端口 HTTP 复测 + agent-browser 证据
- 复核纪律：子代理只读，不修改代码；临时 STORAGE_PATH、端口与进程均已清理

---

## 一、复核结论

### ✅ 通过（PASS）

第一轮复核发现 1 个 P1 正确性问题和 1 组安全 Critical/High 问题。全部修复后，两名复核子代理分别二次复测确认成立：

- 正确性复核：`npm test` 465 / 465 pass；shot 参考图真实进入 provider 参数；场景库入口存在；失败额度退款存在。
- 安全复核：`/storage/data/db.json` 已 404；图片资产 API 所有权校验成立；项目级 image config 无法劫持 provider baseUrl；下载 URL 私网拦截与大小限制成立；prompt 长度上限与失败退款成立。

---

## 二、第一轮发现与修复

### P1：shot.referenceImages 未进入视频生成

- 现象：图片回填到 `shot.referenceImages` 并持久化成功，但 `videoService.generateShot` 只使用调用方传入的 `referenceImages`，单镜生成时不会合并镜头已保存的参考图。
- 修复：`generateShot` 合并 `currentShot.referenceImages` 与入参并去重；`collectReferenceImages` 也把镜头级参考图放在角色 / 场景之前，统一去重并限制 3 张。
- 回归：新增 `回填后的镜头参考图会真实传给视频 provider`，用 stub provider 捕获真实 `params.referenceImages`。

### Critical：`/storage` 暴露整个持久化目录

- 现象：`app.use('/storage', express.static(STORAGE_DIR))` 会把 `storage/data/db.json`、用户密码哈希盐等一并暴露；CORS 为 `*`。
- 修复：改为只挂载 `videos / exports / thumbnails / title-sequences / images / audio / scenes` 白名单目录；其余 `/storage/*` 返回 JSON 404。
- 复测：`/storage/data/db.json` → 404；`/storage/images/<id>.png` → 200；`/storage/images/../data/db.json` → 404。
- 残留：`/%2e%2e/storage/data/db.json` 返回 SPA HTML 200，但不会返回数据库文件。

### Critical：图片资产可被匿名枚举 / 删除 / 回填

- 现象：`/api/images` 使用 `authOptional`，列表不传 userId 时返回全部资产，详情/删除/回填无所有权检查，响应还泄露绝对 `filePath`。
- 修复：
  - 所有图片 API 统一以 `req.user?.id || 'default'` 作为调用者身份；
  - service 层新增 `_getOwnedAssetOrThrow` 与 `_assertProjectAccess`；
  - 非所有者读写统一返回 404，避免枚举；
  - HTTP 响应统一脱敏 `filePath`。
- 回归：新增 `图片资产按用户隔离`，覆盖 get/delete/apply/list 的跨用户拒绝。

### High：OpenAI 兼容图片 provider 的 SSRF 与无界下载

- 现象：项目级 `providerPreferences.image.config.baseUrl` 会覆盖全局 provider 配置，且 provider 返回的 `item.url` 被无校验下载。
- 修复：
  - image provider 只使用全局配置，忽略项目/用户级 `baseUrl` / `apiKey`；
  - baseUrl 与返回图片 URL 只允许 http/https；
  - 返回图片 URL 命中 localhost、127/10/192.168/169.254/172.16-31 等私网地址时拒绝；
  - b64 / JSON / 下载响应均加大小上限。
- 残留：私网判断基于字面 hostname，未覆盖 DNS rebinding 与重定向；全局 `OPENAI_IMAGE_BASE_URL` 仍允许运维指向自建内网网关。

### Medium：prompt / provider 响应无资源上限

- 修复：prompt 最长 2000 字符；provider JSON 30MB、单图 25MB 上限；下载按流式读取并在超限时取消。

### Medium：失败生成仍消耗额度

- 修复：失败资产计数后调用 `refundImageQuota` 退回额度；退款值下限为 0。
- 残留：目前没有“provider 主动抛错”的专用回归测试，由代码审读与隔离验证覆盖。

### P2：R31“场景”入口缺失

- 修复：`更多工具` 新增“场景库”，渲染 `tab-scenes`，通过 `/api/scenes` 展示内置与自定义场景；并明确场景在镜头编辑中选择、图片可回填项目场景参考图。

---

## 三、复测证据

### 正确性复核

- `npm test`：465 tests / 465 pass / 0 fail / 55 suites。
- `[test-isolation] OK：开发库未被修改（projects=48, studios=0, imageAssets=0）`。
- provider 捕获测试确认 `params.referenceImages` 包含回填图片 URL。
- `/api/scenes` 驱动场景库渲染的代码路径确认存在。

### 安全复核

- `/storage/data/db.json` → 404，`/storage/images/<id>.png` → 200，路径穿越 → 404。
- 匿名图片列表仅返回 `default` 资产且无 `filePath`；跨用户 get / delete / apply → 404。
- 项目级 image `baseUrl/apiKey` 无法覆盖全局配置。
- 私网 URL 在第二次 fetch 前被拒；超长 prompt 被拒；失败生成额度退回。
- `npm test`：465 / 0，隔离行同上。

---

## 四、残留风险

1. `/storage/images/<id>.png` 仍可凭 URL 公开访问；资产 id 不可枚举性较弱于鉴权。该行为与现有视频 / 导出媒体一致，后续可改为带签名 URL。
2. SSR F 防护未覆盖 DNS rebinding 与重定向；如接入不受信任的第三方图片服务，需要加 DNS 解析后 IP 校验。
3. 匿名请求共用 `default` 额度，且没有速率限制；生产环境建议对图片生成加 IP / 用户级限流或强制登录。
4. `public/js` 首次纳入 lint 暴露 37 个历史 error，`src/tests` 仍有 47 个历史 error；本轮新增文件 0 error，但全仓 lint 仍非零退出。
5. 智能剪辑与音频生成未在本期实现，前端已如实标注为 Sprint 15。

---

## 五、总体判定

修复后未发现剩余 Blocker / Critical / High 问题。R31、R32、R35 端到端证据充分，独立复核通过：

**✅ PASS，可交付 Wave 1。**

