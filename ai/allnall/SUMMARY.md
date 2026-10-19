# DreamReel 工作内容总结

> 生成时间：2026-10-19
> 范围：剧集包存储同步（本地 / WebDAV / 夸克网盘）、夸克扫码登录、同步范围收敛

---

## 一、提交记录

| commit | 内容 |
|---|---|
| 本次提交 | 网盘同步：通用同步内核 + WebDAV 真实上传 + 夸克真实上传 + 扫码登录 + 同步范围 |

> `src/config/index.js`、`src/server.js`、`.env.example`、`README.md` 为多人共享文件，本次只提交了属于本工作的改动。

---

## 二、要解决的问题

原状：`novelSyncService` 只有「本地真实复制 + 夸克 dry-run」，夸克真实上传是留口；没有登录入口；同步会把 8000+ 个内部工作文件一起打包。

目标：让「剧集包 → 网盘」真正可用，并且只同步该交付的东西。

---

## 三、交付内容

### 1. 通用同步内核 `src/services/novelSyncService.js`

- **清单**：`storage/novels/<id>/**` + `exports/` + `images/` + `videos/` + `audio/`，排除 `sync/` 与系统垃圾文件（`.DS_Store` 等）
- **增量去重**：`size + mtimeMs` 指纹，≤1MB 小文件加内容 hash
- **冲突策略**：`overwrite`（先删同名）/ `skip`（HEAD 或远端查重）
- **并发 + 重试**：可重试错误指数退避；失败逐文件上报、不阻塞整批
- **ledger**：`storage/novels/<id>/sync/ledger.json`，含历史 entries 与按「后端+目标」分组的增量 state，tmp+rename 原子写

### 2. WebDAV / NAS `src/services/webdavClient.js`

MKCOL 逐级建目录、PUT 流式上传、HEAD 探测；Basic/Bearer；超时与可重试判定。兼容群晖 / Nextcloud / 坚果云 / 阿里云盘 WebDAV。

### 3. 夸克网盘 `src/services/quarkClient.js`

私有接口全链路：`file/upload/pre` → `file/update/hash`（秒传，失败可忽略）→ `file/upload/auth`（按 auth_meta 签名）→ OSS 并行分片 → `CompleteMultipartUpload` → `file/upload/finish`；目录 `file/sort` / `file`（建目录）/ `file/delete`。

### 4. 夸克扫码登录 `src/services/quarkAuth.js` + `src/utils/qrcode.js` / `qrImage.js`

- `getTokenForQrcodeLogin` → 二维码 URL → 轮询 `getServiceTicketByQrcodeToken` → `account/info` 捕获 `Set-Cookie`
- 二维码**本地生成**：纯 JS QR 编码器（字节模式、自动版本/掩码），逐模块对齐 python-qrcode；PNG（自写编码器）/ SVG 渲染
- 为什么不走在线二维码服务：二维码内容就是登录 token，交给第三方等于泄露登录态

### 5. 同步范围收敛（本次最新改动）

`SYNC_SCOPE` 三档，默认 `deliverables`：

| 预设 | 目录 |
|---|---|
| `deliverables`（默认） | 产物 `exports/ images/ videos/ audio/` + 文档 `characters/ worldbuilding/ art/ assets/ handoff/` |
| `media` | 仅产物 |
| `all` | 全部（含 `source/ chunks/ episodes/`） |

实测作品 `47dd19996161517b`：**产物 89 + 文档 19 = 108 个文件**；排除的内部工作数据（`source/` `chunks/` `episodes/`）共 **8405 个文件 / 51MB**。

### 6. 接口 / CLI / 前端

| 层 | 内容 |
|---|---|
| API | `POST /api/novels/:id/sync`（`backend` + `scope`）、`GET /manifest?scope=`、`GET /sync/scopes`、`GET /sync/ledger`；`/api/cloud-drive/quark/{qr,qr/:token/status,status,logout}` |
| CLI | `sync` / `manifest` / `ledger` / `quark-login` / `quark-check`，支持 `--scope`、`--remote-dir`、`--on-conflict` |
| 前端 | 小说项目「风格 / 同步」页：**网盘登录（夸克）卡片**（状态 / 扫码 / 校验 / 退出）+ **同步范围下拉**（切换即刷新清单数）+ 各后端预览/同步 |

---

## 四、真实 E2E 证据（不是 mock）

### 夸克（真实账号）

```
扫码登录        → canListRoot=true；cookie 落盘 storage/.quark-cookie（0600，298B）
同步 2 个文件    → uploaded=2 skipped=0 failed=[]  12,426,970B  6.3s
  clip.mp4 2,989,786B  （单分片）
  big.bin  9,437,184B  （4MB × 3 分片，带 x-oss-hash-ctx）
远端核对        → DreamReel/smoke-test/videos/ 两文件，字节数与本地一致
二次同步        → uploaded=0 skipped=2 failed=[]（增量去重生效）
```

测试产物已清理：远端目录、本地项目、db 记录、探测残留均已删除。

### 真实测试发现并修复的两个协议错误

1. **上传域名错**：参考实现硬编码 `ul-sz.oss-cn-shenzhen.aliyuncs.com` → `NoSuchBucket`。
   真实规则：`https://{bucket}.{pre.upload_url 的 host}`（实测 `ul-sz.pds.quark.cn`）。现在从响应推导，`QUARK_OSS_HOST` 可覆盖。
2. **多分片缺哈希上下文**：第 2 片起 400 `NoHashContext`。
   并行分片必须带 `x-oss-hash-ctx`（前序字节 SHA1 中间状态）。参考实现用硬编码样本映射规避；本实现按标准算法计算（`src/utils/sha1State.js`），并用 `crypto.createHash('sha1')` 对拍验证。

### 前端（真实浏览器）

- 「风格 / 同步」页正常渲染网盘登录卡，状态显示「已登录（扫码保存）」
- 点「校验登录态」→ `✅ 登录态有效`（真实请求夸克）
- 点「扫码登录」→ 内联 SVG 生成（390×390、1665 rect），进入轮询
- 切标签页再回来 → 二维码区与轮询被清理（无定时器泄漏）

---

## 五、测试与静态检查

- `npm test`：**729 passed / 0 failed**
- 新增测试：`qrcode`（对齐参考实现）、`qrImage`（像素级校验）、`sha1State`（对拍 crypto）、`quarkQrLogin`、`cloudDriveRoutes`、`novelQuarkSync`、`novelWebdavSync`、`novelSyncScope`
- `npm run lint`：本次涉及文件 0 error

> 说明：全量跑时音频用例（ffmpeg）偶发并发超时，单跑通过、复跑全绿；属既有 flaky（`scripts/run-tests.js` 里已有相关注释）。

---

## 六、已知限制

1. 夸克为**私有接口**，协议可能随版本漂移；失败时先 `quark-check` + `sync --dry-run` 定位。
2. 无断点续传：失败文件下次整体重传（文件粒度，非分片粒度）。
3. 夸克并发默认 1（顺序上传），大包首次同步较慢。
4. 未验证：>100MB 单文件、真实网络抖动下的重试行为。
5. cookie 为敏感凭据：只作请求头发送，不落库、不打印、不返回给前端。

---

## 七、文件索引（本工作新增/主要改动）

**新增**
- `src/services/novelSyncService.js`（重构为通用内核）
- `src/services/webdavClient.js`
- `src/services/quarkClient.js`
- `src/services/quarkAuth.js`
- `src/utils/qrcode.js` / `src/utils/qrImage.js` / `src/utils/sha1State.js`
- `src/routes/cloudDrive.js`
- `ai/docs/cloud-storage-sync-delivery-report.md`

**修改**
- `src/routes/novels.js`（sync / manifest / scopes / ledger）
- `src/config/index.js`（`sync.scope`、`webdav.*`、`quark.*`）
- `src/server.js`（挂载 `/api/cloud-drive`）
- `public/js/api.js`、`public/js/views/novels.js`（登录卡 + 范围选择）
- `scripts/novel.js`（`sync` / `manifest` / `ledger` / `quark-login` / `quark-check`）
- `.env.example`、`README.md`、`ai/docs/novel-series-plan.md`

**测试**
- 新增 `tests/{qrcode,qrImage,sha1State,quarkQrLogin,cloudDriveRoutes,novelQuarkSync,novelWebdavSync,novelSyncScope}.test.js` + `tests/qrcode.fixtures.js`
- 修改 `tests/novelSeries.test.js`（同步用例显式传 `scope: 'all'`）

---

## 八、关键配置

```bash
SYNC_SCOPE=deliverables        # deliverables | media | all

# WebDAV / NAS
WEBDAV_URL=
WEBDAV_USERNAME=
WEBDAV_PASSWORD=
WEBDAV_ROOT=DreamReel

# 夸克
# QUARK_COOKIE=                # 也可用 quark-login 扫码后落盘
# QUARK_COOKIE_FILE=storage/.quark-cookie
QUARK_ROOT=DreamReel
QUARK_OSS_HOST=pds.quark.cn
QUARK_PART_SIZE=4194304
QUARK_CONCURRENCY=1
```

## 九、使用

```bash
node scripts/novel.js quark-login                 # 扫码登录（终端 + 本地 PNG）
node scripts/novel.js quark-check                 # 验证登录态
node scripts/novel.js sync <id> --backend quark --dry-run
node scripts/novel.js sync <id> --backend quark --remote-dir <子目录>
node scripts/novel.js sync <id> --backend webdav --scope media
```
