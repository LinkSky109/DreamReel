# 前端 Phase 49 交付报告 · 英文复数与数字格式化

> 日期：2026-10-20
> 前置：`frontend-phase48-domain-labels-i18n.md`
> 目标：修复英文模式下 `1 shots` / `1 files` 等复数问题，并统一大数字格式

---

## 1. 完成范围

### 1.1 新增工具函数（`lib/format.ts`）

```ts
pluralize(1, 'shot') // shot
pluralize(2, 'shot') // shots
formatNumber(1234567, 'en') // 1,234,567
```

- `pluralize` 以 `Math.abs(count) === 1` 判断单数，0 走复数。
- `formatNumber` 使用 `Intl.NumberFormat`，中英均使用千分位；非有限值返回 `—`。

### 1.2 应用范围

| 位置 | 修复示例 |
|---|---|
| 编辑器顶栏 / 状态栏 / 生成 / 剪辑 / 版本 | `1 shot` / `2 shots` |
| 项目库 / 工作台 / 回收站 / 剧场计划 / 导演模式 / 片头 | 镜头数复数 |
| 素材商城 | `1 item` / `2 items` |
| 团队协作 | `1 member` / `1 project` |
| 创作者主页 / 作品广场 / 小说分镜 | 镜头数复数 |
| 创作数据 | 镜头、角色、导出数复数 + 千分位 |
| API 开发者 | 累计/单 Key 调用量千分位 |
| 设置 · 运行与性能 | 请求数/错误数千分位、CPU 核心复数 |
| 小说角色备选 / 同步文件数 | items / files 复数 |

---

## 2. 改动文件

```
web/src/lib/format.ts / format.test.ts
web/src/features/editor/{EditorPage,EditStage,VersionsStage,GenerateStage}.tsx
web/src/features/novel/{StoryboardTab,CharactersTab,SyncTab}.tsx
web/src/pages/{Dashboard,Projects,Stats,Gallery,Store,Settings,ApiConsole,Teams,Creator,Studios,Directors,RecycleBin,TitleSequences}.tsx
ai/docs/frontend-phase49-plural-numbers.md
```

---

## 3. 验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm run lint` | 0 error |
| `npm run test:web` | **133 passed / 0 failed**（37 files） |
| `npm run build:web` | 成功 |

`format.test.ts` 新增：单数/复数/0、千分位中英断言。

---

## 4. 未完成 / 已知限制

1. 后端返回的计数文案（如同步报告原始 JSON）不做本地化。
2. 仍有少量模板字符串未使用 `pluralize`（如 `1 files` 之外的动态报告）。
3. 日期/时间仅 `formatDate` 与 `relativeTime` 中英化，`toLocaleString()` 仍跟随浏览器 locale。
4. 未处理序数词（1st / 2nd）与货币格式。
5. 未做键盘 / 屏幕阅读器实测与截图级视觉回归。

---

## 5. 下一步

1. 端点清单与后端路由一致性检查。
2. 键盘 / 屏幕阅读器实测。
3. 1440 / 1024 / 768 截图级视觉回归。
4. 序数词与货币格式（如需要）。
