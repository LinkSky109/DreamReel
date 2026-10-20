# 前端 Phase 27 交付报告 · 编辑器展示小说来源

> 日期：2026-10-20
> 前置：`46aa7c8`

## 完成

- Shot 类型补充 `sourceNovelId` / `sourceStoryboardId`
- 编辑器分镜卡显示「小说 · 书名」，点击回到 `/novel/:id?tab=storyboard`
- 镜头检查器新增「来源」字段，同样可跳转
- 小说标题通过轻量 `listNovels` 查询映射，仅在存在来源镜头时请求

## 验证

临时项目「E2E 来源测试」：

- 小说一段标记 → 分镜板 → 新建项目
- 编辑器 shots 页显示 `小说 · E2E 来源测试`
- 链接指向 `#/novel/ddc...?tab=storyboard`
- 检查器显示来源字段
- 375px：无横向溢出
- 临时项目/小说已删除；真实项目与「殖装」未改动

## 命令

- lint 0 error
- typecheck 0 error
- test:web 82 passed
- npm test 750 passed
- build 成功（主包 419.8KB / gzip 131.6KB）

## 下一步

- 模板封面素材
- 项目卡菜单/收藏/批量条重排
