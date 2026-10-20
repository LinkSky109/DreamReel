# 前端 Phase 31 交付报告 · 回收站 React 化

> 日期：2026-10-20
> 前置：`8bdbef6`

## 完成

- `/recycle-bin` 从 legacy 迁移为 React
- 真实接口：
  - `GET /projects/recycle-bin/list`
  - `GET /projects/recycle-bin/stats`
  - `POST /projects/recycle-bin/:id/restore`
  - `DELETE /projects/recycle-bin/:id`
  - `DELETE /projects/recycle-bin`
- 列表：剧照封面、名称、描述、删除时间、镜头数、时长、风格
- 操作：恢复、永久删除（二次确认）、清空回收站（二次确认）
- 空状态与加载/错误态
- 删除 `public/js/views/recycleBin.js`

## 验证

临时项目「E2E 回收站项目」：

1. 删除后进入回收站，页面显示 2 个项目（含历史临时项目）
2. 点击「恢复」→ 回收站剩 1 个，API 同步
3. 对剩余项目「永久删除」→ 二次确认 → 回收站为空
4. 恢复后的临时项目已通过 API 永久清理
5. 真实项目「知识科普…」保留，回收站最终 0

## 命令

- lint 0 error
- typecheck 0 error
- test:web 90 passed
- npm test 750 passed
- build 成功（主包 420.7KB / gzip 131.9KB）

## 后续

- 统计/定价/API 控制台等剩余 legacy 页面
- 回收站分页（当前 50 条）
