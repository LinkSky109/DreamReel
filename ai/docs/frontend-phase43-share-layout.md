# 前端 Phase 43 交付报告 · 分享页独立布局

> 日期：2026-10-20
> 前置：`frontend-phase42-webhook-deliveries.md`
> 目标：`/share/:token` 使用无侧栏/无顶栏的独立公开布局

---

## 1. 完成范围

- `AppShell` 对 `/share/*` 直接透传子路由，不再渲染侧栏、顶栏、命令面板、通知/额度查询 UI。
- 分享页新增独立框架：
  - 顶部品牌栏 +「只读分享」标识 +「打开 DreamReel」入口
  - 内容区最大宽度 1160px，桌面 40px、移动 24/16px 留白
  - 底部「由 DreamReel 生成并分享」与版权信息
- 分享内容：
  - 项目标题、简介、日期眉题、只读徽标
  - 镜头数 / 时长 / 角色数 / 画幅四项统计
  - 镜头卡：视频优先、图片回退、未生成占位；状态与时长
  - 无镜头空状态、无效链接、项目不可用三种状态
- 分享链接的视频/图片继续携带 `?share=<token>`，不依赖登录态。
- 页面标题动态设为 `<项目名> · DreamReel`，离开时恢复站点标题。

---

## 2. 改动文件

```
web/src/app/AppShell.tsx        # /share/* 独立布局
web/src/pages/SharedProject.tsx # 独立分享框架与状态
web/src/pages/SharedProject.css # 新增
web/src/pages/SharedProject.test.tsx # 新增 2 条
ai/docs/frontend-phase43-share-layout.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **129 passed / 0 failed**（36 files） |
| `WEB_OUT_DIR=dist npx vite build` | 成功；主包 424.92 KB（gzip 133.02 KB） |

### 真实浏览器验证

- 公开分享链接 `/share/91fd11c5e787`：渲染项目名、独立品牌栏、空镜头状态；`document.title = "复刻-星海回声 · DreamReel"`。
- DOM 中不存在 `.dr-sidebar` / `.dr-topbar`，存在 `.share-topbar`。
- 无效链接 `/share/bad`：显示「分享链接无效」且仍保持独立布局。
- 375px：`scrollWidth = 375`，无横向溢出；顶栏自然换行。
- 回归 `/projects`：侧栏与顶栏正常恢复。

---

## 4. 未完成 / 已知限制

1. 分享密码未做输入页：后端 `ShareSettings.password` 存在，但当前无密码校验接口。
2. 分享页不展示评论（`allowComments` 未消费）。
3. 分享页视频依赖后端 `/storage` 的 `?share=` 放行策略；跨域 CDN 需单独配置。
4. 无镜头项目只显示空状态，未提供作者信息或返回作品广场入口。

---

## 5. 下一步

1. 分享密码校验与评论只读流。
2. Phase 5：全量 i18n、深色对比度、PWA 缓存版本化。
3. 全局 1440 / 1024 / 768 截图级视觉回归。
