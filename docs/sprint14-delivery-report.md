# DreamReel Sprint 14 交付报告（Wave 1）

- 任务 ID：`TASK-20261005-014`
- 主题：五合一创作画布 + 图片生成 + 工程收口
- 交付日期：2026-10-05
- 分支：`sprint-14-canvas-image`
- 工作流上下文：`.workflow/context-sprint14.yaml`
- 需求分析：`docs/sprint14-requirements-analysis.md`
- 执行规划：`docs/sprint14-workflow-plan.md`
- 独立复核：`docs/sprint14-pm-review.md`
- 最终状态：✅ `GLOBAL_DONE`（两名独立复核 PASS）

---

## 一、范围

| 需求 | 名称 | 状态 |
|---|---|---|
| R31 | 五合一创作画布 | ✅ 交付 |
| R32 | 图片生成独立 Tab | ✅ 交付 |
| R35 | 测试存储隔离 + 前端 lint 覆盖 | ✅ 交付 |

**明确后置 Sprint 15（Wave 2）**：R33 音频生成独立 Tab、R34 智能剪辑模块。

---

## 二、R31 五合一画布

- 一级导航固定为：剧本 / 图片 / 视频 / 音频 / 剪辑。
- 更多工具：角色 / 场景库 / AI 影评 / 协作 / 版本 / 项目设置。
- URL slug 与内部 tab id 解耦：`video`、`audio` 可深链；刷新后保持当前 tab。
- 旧 tab 标识与键盘事件保留兼容。
- 移动端：编辑器侧栏转为横向滚动条，内容区单列全宽；项目操作按钮横向滚动，不再挤压正文。

**验证**

- agent-browser 实测导航 5 个一级 + 6 个更多工具。
- `?tab=images` 深链打开图片 tab；reload 后仍在图片 tab。
- 390px 移动端截图确认单列布局、无内容挤压；桌面 1440px 截图确认完整表单与资产网格。
- 控制台与页面错误均为 0。

---

## 三、R32 图片生成

### 后端

- 新增 `BaseImageProvider` / `MockImageProvider` / `OpenAIImageProvider` / `imageProviderFactory`。
- Mock 用 Python + Pillow 产出真实 PNG；Pillow 失败时用 ffmpeg 纯色 PNG 兜底，字体缺失返回 `textRendered:false`。
- OpenAI Images 兼容 provider 支持 b64_json 与 url 两种返回；尺寸映射到 `1024x1536 / 1536x1024 / 1024x1024`。
- 新增 `ImageAsset` 模型与 storage key `imageAssets`，启动加载不丢。
- 新增 `/api/images`：providers / generate / assets / detail / delete / apply / stats。
- 新增图片额度：free 10 张/天，basic 50，pro 200，enterprise 1000。
- 生成前内容审核；prompt 最长 2000 字符；失败生成退回额度。
- 安全：资产按用户隔离；响应脱敏 `filePath`；项目级 provider config 不能覆盖全局 baseUrl/apiKey；私网下载 URL 拒绝；响应大小上限 25MB。

### 前端

- 图片 tab：prompt、4 种比例、5 种风格、1-4 张数量、候选网格、资产库、生成状态。
- 生成图可回填镜头 / 角色 / 场景参考图，自动去重。
- Mock provider 明确标注“本地 Mock 渲染（真实 PNG，非云端模型）”。

### 视频链路

- `shot.referenceImages` 现在会被 `generateShot` 合并进最终 provider 参数，并在 `collectReferenceImages` 中优先于角色 / 场景参考图，去重后最多 3 张。
- stub provider 捕获测试确认回填图片真实进入 `params.referenceImages`。

---

## 四、R35 工程收口

- `npm test` 改为 `node scripts/run-tests.js`：
  - 每个测试进程使用独立 `STORAGE_PATH=storage/test-run/pid-<pid>`；
  - 测试前后对比开发库 `projects / studios / imageAssets` 计数，变化即失败；
  - 自动清理测试存储目录。
- `public/js/**/*.js` 纳入 eslint；`npm run lint` 覆盖 `src/ tests/ public/js/`。
- 本轮新增文件 lint 0 error。

**Lint 基线**

| 范围 | 结果 |
|---|---|
| 新增文件 | 0 error |
| `src/ tests/` | 47 个存量 error，本轮未新增 |
| `public/js/` | 首次纳入后暴露 37 个历史 error |
| 全仓合计 | 84 error，均为存量；本轮不顺手清零 |

---

## 五、测试与验证证据

### 自动化

- `npm test`：**465 tests / 465 pass / 0 fail / 55 suites**。
- `[test-isolation] OK：开发库未被修改（projects=48, studios=0, imageAssets=0）`。
- 新增测试：R32 service 20 例、R32 route 6 例。
- 首轮出现 1 次未捕获名称的偶发失败；随后连续两轮全绿，未复现。

### HTTP 冒烟

- 创建项目 → 添加镜头 → 生成图片 201 → 图片 URL 200 → PNG magic bytes 正确 → 回填镜头 200 → 项目回读 referenceImages 正确。
- 参数错误 400；未知项目 404；项目级 image config 无法劫持 baseUrl；`/storage/data/db.json` 404；路径穿越 404。

### 真实浏览器

- agent-browser 打开 `?tab=images`：5 个一级 tab、6 个更多工具、图片 tab 激活。
- UI 生成 2 张图片，均 completed，图片真实加载。
- UI 回填镜头参考图成功，API 回读一致。
- 刷新后仍停留图片 tab；控制台 / 页面错误为零。
- 桌面与 390px 移动端截图均验证。

---

## 六、安全复核与修复

独立安全复核首轮发现：

1. `/storage` 全目录暴露（含 db.json、密码哈希盐）→ 已改为媒体目录白名单，其余 404。
2. 图片资产匿名枚举 / 删除 / 回填 → 已加用户归属与项目归属校验，跨用户 404，响应脱敏。
3. OpenAI 兼容 provider SSRF → 已忽略项目级 baseUrl/apiKey，拒绝私网下载 URL，限制响应大小。
4. prompt / 响应 DoS → 已加 prompt 长度与 body 大小上限。
5. 失败生成消耗额度 → 已退款。

复核子代理二次复测确认以上均成立。残留风险见 `docs/sprint14-pm-review.md`。

---

## 七、新增 / 修改文件

**新增（核心）**

- `src/providers/{baseImageProvider,mockImageProvider,openaiImageProvider,imageProviderFactory}.js`
- `src/services/imageService.js`
- `src/routes/images.js`
- `src/models/ImageAsset.js`
- `scripts/render_image_asset.py`
- `scripts/run-tests.js`
- `tests/setup-isolated-storage.js`
- `tests/imageGeneration.test.js`
- `tests/imageRoutes.test.js`
- `public/js/views/editorTabs.js`
- `public/js/views/images.js`
- `docs/sprint14-requirements-analysis.md`
- `docs/sprint14-workflow-plan.md`
- `docs/sprint14-pm-review.md`
- `docs/sprint14-delivery-report.md`
- `.workflow/context-sprint14.yaml`

**修改（主要）**

- `public/js/views/editor.js`、`public/js/app.js`、`public/js/api.js`、`public/js/i18n.js`、`public/css/style.css`
- `src/server.js`、`src/config/index.js`、`src/services/{quotaService,storageService,projectService,videoService}.js`
- `src/models/shot.js`、`src/routes/providers.js`、`src/providers/providerResolver.js`
- `package.json`、`eslint.config.js`、`.env.example`、`README.md`

> 工作区中原有 10 个未提交修改（README/Dockerfile/arch_report/render_title_card/providers/videoService/tests 等）均保留，未被回退。本轮改动未提交 commit。

---

## 八、已知限制与后续

1. `/storage/images/<id>.png` 仍通过 URL 公开可读（与视频 / 导出媒体一致）；后续可改签名 URL。
2. 私网 URL 校验不覆盖 DNS rebinding / 重定向。
3. 匿名请求共用 `default` 额度且无限流；生产建议强制登录或加 IP / 用户限流。
4. 全仓 lint 仍有 84 个历史 error，未清零。
5. Wave 2（音频生成、智能剪辑）未实现；剪辑 tab 当前是诚实的 Sprint 15 占位。

---

## 九、结论

Sprint 14 Wave 1 端到端闭环：五合一画布把创作路径收口为 5 个一级入口；图片生成从 provider、额度、审核、持久化到参考图回填全部真实可用，并真正进入视频生成参数；测试存储隔离与前端 lint 覆盖完成。465 个测试全通过，HTTP 与真实浏览器证据完整，两组独立复核 PASS。

**最终状态：`GLOBAL_DONE`。**

