# 前端 Phase 36 交付报告 · 创意片头 React 化

> 日期：2026-10-20
> 前置：`fcd7d50`

## 完成

- `/title-sequences` 从 legacy 迁移为 React（P-08）
- 真实接口：
  - `GET /title-sequences`
  - `POST /title-sequences/:id/generate`
  - `GET /projects/:id`
  - `PUT /projects/:id`
- 页面：
  - 三列模板卡：实时风格预览、说明、推荐配乐、时长/分辨率
  - 生成弹层：片名/英文副标题实时预览、目标项目
  - 生成中禁用重复提交，使用真实 ffmpeg 渲染（无伪进度百分比）
  - 完成后 `<video controls muted playsInline>` 预览
  - 标题卡渲染失败时明确提示「纯色背景回退」
  - 插入项目片头：新增一个 completed 片头镜头并重排 index，不改现有镜头内容
- 删除 `public/js/views/titleSequences.js`

## 验证

- 前端测试：
  - 模板渲染与弹层
  - 片名实时预览
  - 生成参数与结果状态
  - 插入后镜头顺序、`videoUrl`、`status=completed`
- 后端 `tests/titleSequence.test.js`：6 passed
- 未执行真实 ffmpeg 生成（避免写入真实 storage）；生成链路由后端现有测试覆盖

## 命令

- lint 0 error
- typecheck 0 error
- test:web 101 passed
- titleSequence 后端测试 6 passed
- build 成功

## 未验证

- 当前会话无浏览器自动化工具，未做截图/肉眼视觉验收
- 未在真实项目执行「插入项目片头」

## 后续

- P-10 影评社区
- 片头真实渲染可在隔离 `STORAGE_PATH` 下做一次端到端验收
