# 前端 Phase 21 交付报告 · 标记转分镜板

> 日期：2026-10-20
> 前置：`b099f24`
> 目标：补齐原型「转为分镜」动作，并保证大项目可用

---

## 1. 新增能力

### 分镜板（Storyboard）

- 新增工作台「分镜板」Tab。
- 顶栏「转为分镜」：把当前段落标记生成分镜草稿；无标记时禁用。
- 每个草稿包含：来源章节/段落、正文、时长、景别、运镜。
- 支持逐条编辑与保存、删除。
- 支持导出 `storyboard.json`（含序号/章节/文本/时长/景别/运镜）。
- 空状态会提示先标记段落，并显示当前标记数。

### 数据

- `NovelProject.storyboard` 持久化草稿。
- 同一章节+段落去重，重复点击只补新增标记。

### 后端

- `GET /api/novels/:id/storyboard`
- `POST /api/novels/:id/storyboard/from-marks`
- `PATCH /api/novels/:id/storyboard/:sid`
- `DELETE /api/novels/:id/storyboard/:sid`

## 2. 真实浏览器验证

临时项目「E2E 分镜板」（2 章）：

1. 标记两段 → 工作台「转为分镜」→ 生成 2 条草稿。
2. 分镜板显示「标记 2 · 分镜 2」，正文与章节来源正确。
3. 编辑第一条文本并保存 → API 返回新文本。
4. 删除第二条 → 列表剩 1 条、API 剩 1 条。
5. 375px：修复顶栏 4 个按钮换行后，无横向溢出。
6. 临时项目已删除；真实项目「殖装」保持只读、无改动。

### 命令结果

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**78 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（主包 419.6KB / gzip 131.6KB）

## 3. 仍未完成

1. 分镜草稿还不能直接送入项目/编辑器成为真实 shot。
2. 角色/世界观跨页批量审校未做。
3. 列表统计仍会读取全书 chunk 文本（可用 wordCount 汇总优化）。
4. 工作台/项目库整体未按原型重排。

## 4. 下一步

1. 分镜草稿 → 项目 shots 的导入接口。
2. 角色/世界观跨页选择与批量操作。
3. 工作台 + 项目库视觉对齐。
