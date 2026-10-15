# DreamReel Sprint 17 交付报告（影评/评论模型基线 + 工程 lint 收口）

- 任务 ID：`TASK-20261010-017`
- 主题：T17-006 影评四维评分与评论模型基线；跨模块 lint 收口
- 来源提交：`cdd9c08 Merge Sprint 16/17/18 patches`（2026-10-10）
- 工作流上下文：`ai/workflow/context-sprint17.yaml`
- 最终状态：⚠️ `GLOBAL_DONE`（代码） / `PARTIAL`（验证），**含 1 项前端功能性回归**

> ⚠️ **补记说明**：Sprint 16/17/18 同属一个提交，无原始子代理记录。本报告于 2026-10-12 依据代码 diff 重建。

---

## 一、范围

| 项 | 名称 | 交付类型 | 状态 |
|---|---|---|---|
| T17-006 | 影评四维评分 + 评论模型 | 模型基线 | ✅ |
| ENG-LINT | 工程与前端 lint 收口 | 治理 | ⚠️ 引入回归 |
| ENG-TESTHYGIENE | 测试卫生 | 治理 | ✅ |

> **诚实标注**：提交信息列的「风格迁移工坊 / AI 影评增强（四维评分）/ 回收站与统计 / 项目检索 / Provider Resolver / 配额改进」在**源码 diff 中未见对应实现**——相应 `src/services` 与前端视图仅做了 lint 级微调，8 个测试文件也只改了 `catch` 绑定。该项与「回收站/统计/检索/配额改进」的措辞属于**提交信息夸大**，实际未交付功能。

---

## 二、T17-006 影评/评论模型基线

**新增 `src/models/review.js`**（标注 `T17-006 baseline model`）：

- 四维评分：`storyScore / visualScore / performanceScore / soundtrackScore`，`clampScore` 归一到 `[0,10]`。
- `overallScore` = 四维均值（保留 1 位小数）。
- 计数：`likeCount / commentCount / favoriteCount`（含 increment/decrement 方法）。
- 状态：`published | hidden | deleted`；本地 ID：`rev_<ts>_<rand>`。

**新增 `src/models/comment.js`**（标注 `T17-006 baseline model`）：

- `reviewId / userId / parentId(null=顶层) / content / likeCount / status`；本地 ID：`cmt_<ts>_<rand>`。

**边界**：仅模型，**无路由、无服务、无前端、无专用测试**。四维评分未接入既有 `filmAnalysisService`。

---

## 三、ENG-LINT 工程与前端 lint 收口

- 新增 `.eslintrc.json`；`package.json` 的 `lint` 覆盖 `public/js`。
- 大量 `catch (e)/(err)/(_)` 收敛为 `catch {}`。
- 结果：`npm run lint` → **0 error / 1 warning**（warning 在 `src/app.js`）。

### 🔴 引入的功能性回归（已于 2026-10-12 修复）

`public/js/views/editor.js` 中有 **45 处**（42 处引用 `err`、3 处引用 `e`）`catch {}`（已删除绑定）**仍在块内引用 `err` / `e`**，例如：

```js
} catch {
  showToast(err.message, 'error')   // ❌ err is not defined
}
```

定位命令（两种方法一致）：

```bash
# espree AST：51 个无参 catch 中 42 引用 err / 3 引用 e / 6 未引用
# rg 快检（仅统计紧邻下一行的 .message 引用，会少计 console.* 与 if 分支）
rg -U -c --pcre2 "catch\s*\{\s*\n\s*[^\n}]*(?:\berr\b|\be\b)\." public/js
```

影响：一旦执行到这些错误分支，`catch` 块自身抛 `ReferenceError`，掩盖原始错误、前端提示失效。典型位置（修复前行号）：剧本生成失败（798）、角色保存失败（952/1056/1104…）、弹窗发布/渲染失败（214/3456/3524）等。`src/` 无同类问题。

---

## 四、ENG-TESTHYGIENE 测试卫生

8 个既有测试文件仅做 `catch (e)` → `catch {}` 与未用变量清理（无行为变化）：

`commentEnhancements`、`notificationService`、`projectSearch`、`providerResolver`、`quotaService`、`recentProjects`、`recycleBin`、`statsService`。

---

## 五、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test`（合入 main 时） | 523 tests / 522 pass / **1 fail**（`templateMarket`，由 Sprint 18 FNV 缺陷引发） |
| `npm test`（2026-10-12 修复后） | **523 tests / 523 pass / 0 fail** |
| `npm run lint` | 0 error / 1 warning（warning 在 `src/app.js`） |
| T17-006 专用测试 | 无 |
| editor.js 缺陷测试 | 无（修复前后端无 E2E） |

---

## 六、新增 / 修改文件

**新增**：`src/models/review.js`、`src/models/comment.js`、`.eslintrc.json`

**修改（主要）**：`public/js/views/editor.js`（含 45 处缺陷，已修复）、`public/js/app.js`、`public/js/i18n.js`、`public/js/views/*`（directors/gallery/pricing/projectList/recycleBin/settings/stats/studios/titleSequences）、8 个测试文件

---

## 七、已知限制与风险

1. **editor.js 45 处 `catch {}` 引用未定义变量**——已于 2026-10-12 修复（espree AST 定位后还原 `catch (err)` / `catch (e)` 绑定）。
2. T17-006 仅模型基线，未接入任何链路，也无测试。
3. 提交信息对 Sprint 17 的范围存在夸大，实际未交付所列功能。
4. `src/app.js` 孤立且 import 失败（P2），见 Sprint 18 报告，仍待决策。

---

## 八、补记修复（2026-10-12）

- 用 espree 解析 `public/js/views/editor.js`，定位全部无参 `catch` 子句；对块内引用 `err`（42 处）或 `e`（3 处）的 45 处还原绑定，6 处未引用变量的保持 `catch {}`。
- 校验：`node --check` 通过；残留检测 0 命中；`node scripts/run-tests.js` → 523/523/0。
- 涉及文件：`public/js/views/editor.js`。

---

## 九、结论

Sprint 17 实际交付内容为：影评/评论**模型基线**（T17-006）+ 跨模块 lint 与测试卫生收口。其中前端 lint 收口曾引入 **45 处运行时缺陷**，已于 2026-10-12 修复并复测全绿。

**最终状态：`GLOBAL_DONE`（代码，含修复）。**
