# 前端 Phase 22 交付报告 · 分镜草稿送入项目

> 日期：2026-10-20
> 前置：`135cc0d`
> 目标：把小说分镜草稿变成真实项目镜头，打通「小说 → 分镜板 → 编辑器」

---

## 1. 新增能力

- 分镜板新增「送入项目」。
- 不传 `projectId` 时自动创建新项目：
  - 名称：`《书名》· 分镜板`
  - 描述：`由小说《书名》的段落标记生成`
  - 时长：草稿时长之和
  - 画幅：landscape
- 每条草稿变成真实 shot：
  - `description` = 草稿正文
  - `narration` = 草稿正文
  - `duration` / `shotType` / `cameraMovement`
- 导入成功跳转 `/project/:id?tab=shots`。

### 后端

- `POST /api/novels/:id/storyboard/import`
  - `{}` → 新建项目
  - `{ projectId }` → 追加到已有项目（接口已支持，UI 暂未暴露选择器）
  - 返回 `{ projectId, projectName, shots }`

## 2. 真实接口验证

临时项目「E2E 入库测试」（2 章、2 个标记）：

1. 生成分镜草稿 2 条。
2. 调用 `storyboard/import` → 返回项目 `d4eb70a052f756d8`，2 个镜头。
3. 查询项目：
   - `风从北面来。` · 5s · 中景 · 固定
   - `城门开了。` · 5s · 中景 · 固定
4. 临时小说与项目已删除；真实项目「殖装」未改动。

## 3. 命令结果

- `npm run lint`：0 error
- `npm run typecheck`：0 error
- `npm run test:web`：**79 passed**
- `npm test`：**750 passed / 0 failed**
- `npm run build`：成功（主包 419.7KB / gzip 131.6KB）

## 4. 已知限制

1. UI 只能新建项目，暂未提供「选择已有项目追加」。
2. 重复送入会重复追加；暂无去重。
3. shot 不携带小说章节/段落引用，后续追踪来源需补字段。
4. 项目镜头索引从 0 开始（沿用现有 Shot 模型）。

## 5. 下一步

1. 送入项目时支持选择已有项目 + 去重。
2. 角色/世界观跨页批量审校。
3. 工作台 + 项目库视觉对齐。
