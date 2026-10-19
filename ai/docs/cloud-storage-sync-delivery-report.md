# 存储同步交付报告（本地 / WebDAV / 夸克网盘）

- 日期：2026-10-19
- 范围：剧集包（`storage/novels/<id>` + 媒体产物 + 成片）的本地与网盘同步
- 结论：**本地、WebDAV、夸克三条链路均真实可用**；夸克私有接口已用真实账号打通

---

## 一、交付内容

| 模块 | 文件 | 说明 |
|---|---|---|
| 同步内核 | `src/services/novelSyncService.js` | 清单构建、指纹增量去重、冲突策略、并发/重试、ledger 记账 |
| WebDAV | `src/services/webdavClient.js` | MKCOL/PUT/HEAD，Basic/Bearer，流式上传，超时与可重试判定 |
| 夸克客户端 | `src/services/quarkClient.js` | 预上传 → hash → auth → OSS 分片 → 合并 → finish |
| 夸克登录 | `src/services/quarkAuth.js` | 扫码登录（token → 轮询 → service ticket → cookie） |
| 二维码 | `src/utils/qrcode.js` / `qrImage.js` | 纯 JS QR 编码（对齐 python-qrcode）+ 本地 PNG/SVG 渲染 |
| SHA1 状态 | `src/utils/sha1State.js` | 并行分片所需的 `x-oss-hash-ctx`（增量 SHA1 中间状态） |
| 接口 | `src/routes/novels.js` / `src/routes/cloudDrive.js` | 同步 / 清单 / 范围 / ledger / 扫码登录 / 登录态 |
| 前端 | `public/js/views/novels.js` / `public/js/api.js` | 「风格 / 同步」页：网盘登录卡 + 范围选择 + 各后端同步 |
| CLI | `scripts/novel.js` | `sync` / `manifest` / `ledger` / `quark-login` / `quark-check` |

## 二、同步范围（默认：产物 + 文档）

`SYNC_SCOPE`（默认 `deliverables`）：

| 预设 | 目录 |
|---|---|
| `deliverables` | 产物 `exports/ images/ videos/ audio/` + 文档 `characters/ worldbuilding/ art/ assets/ handoff/` |
| `media` | 仅产物 `exports/ images/ videos/ audio/` |
| `all` | 全部（仍排除 `sync/` 与 `.DS_Store` 等垃圾文件） |

实测（作品 `47dd19996161517b`）：产物 89 个（222MB）+ 文档 19 个；被排除的内部工作数据 `source/ chunks/ episodes/` 共 **8405 个文件 / 51MB**。

## 三、真实 E2E 证据

### 夸克（真实账号，2026-10-19）

```
扫码登录            → canListRoot=true，cookie 落盘 storage/.quark-cookie（0600，298B）
同步 2 个文件        → uploaded=2 skipped=0 failed=[]  12,426,970B  6.3s
  clip.mp4 2,989,786B  （单分片）
  big.bin  9,437,184B  （4MB × 3 分片，带 x-oss-hash-ctx）
远端核对            → DreamReel/smoke-test/videos/ 下两个文件，字节数与本地一致
二次同步            → uploaded=0 skipped=2 failed=[]（增量去重生效）
```

测试产物已清理（远端目录、本地项目、db 记录均已删除）。

### WebDAV

本地 mock WebDAV 服务器验证：首次上传、增量跳过（0 次 PUT）、单文件变更只重传、dry-run、`skip` 走 HEAD、500 重试、401 逐文件上报。

## 四、真实测试发现并修复的两个协议错误

1. **上传域名**：参考实现硬编码 `ul-sz.oss-cn-shenzhen.aliyuncs.com` → `NoSuchBucket`。
   真实规则是 `https://{bucket}.{pre.upload_url 的 host}`（实测 `ul-sz.pds.quark.cn`）。现从响应推导，`QUARK_OSS_HOST` 可覆盖。
2. **多分片缺哈希上下文**：第 2 片起返回 400 `NoHashContext`。
   并行分片必须带 `x-oss-hash-ctx`（前序字节 SHA1 中间状态）。参考实现用硬编码样本映射规避；本实现按标准算法计算，并用 `crypto.createHash('sha1')` 对拍验证。

## 五、测试与静态检查

- `npm test`：**729 passed / 0 failed**
- 新增测试：`qrcode`（对齐参考实现）、`qrImage`（像素级校验）、`sha1State`、`quarkQrLogin`、`cloudDriveRoutes`、`novelQuarkSync`、`novelWebdavSync`、`novelSyncScope`
- `npm run lint`：本次涉及文件 0 error（仓库另有 2 个既有无关错误：`src/providers/llmProviderFactory.js:40` 未使用参数）

## 六、已知限制

1. 夸克为**私有接口**，协议可能随版本漂移；升级后若失败，先用 `quark-check` 与 `sync --dry-run` 定位。
2. 无断点续传：失败文件下次整体重传（按文件粒度，非分片粒度）。
3. 夸克并发默认 1（顺序上传）；大包首次同步耗时较长。
4. 未验证：>100MB 单文件、网络抖动下的真实重试行为。
5. `quark` 真实上传依赖 cookie，属敏感凭据：只作请求头发送、不落库、不打印、不返回给前端。

## 七、使用

```bash
# 登录（终端二维码 + 本地 PNG）
node scripts/novel.js quark-login
node scripts/novel.js quark-check

# 预览 / 真实同步（默认 deliverables）
node scripts/novel.js sync <novelId> --backend quark --dry-run
node scripts/novel.js sync <novelId> --backend quark --remote-dir <子目录>
node scripts/novel.js sync <novelId> --backend webdav --scope media
```
