# 交接单模板（TEMPLATE）

> 复制到 `docs/handoff/notes/<日期>-<任务ID>.md`，或在消息中按本结构发送。填写后同步更新 `STATE.md` 与 `JOURNAL.md`。

```markdown
# 交接单 · <任务ID> · <任务标题>

## 1. 元信息

- 日期/时间：
- 交接人（角色）：
- 接手人（角色）：
- 分支 / worktree：
- HEAD（交接时）：
- 任务状态：done / review / blocked

## 2. 我做了什么

- 变更摘要（3 行内）：
- 涉及文件（完整路径）：
  - `src/…`
  - `tests/…`
- 提交：
  - `<sha> <type(scope): message>`
- 契约/接口变化（有/无，若有写字段与兼容策略）：

## 3. 验证证据（真实命令 + 退出码 + 关键输出）

```
$ <command>
<关键输出>
exit <N>
```

- 门禁：`npm run check`（当前）/ `gate.sh`（R0-T0.4 后）→ 结果
- 新增/修改测试：文件、用例名、通过数
- 手工验证（curl/psql/浏览器）：命令与结果

## 4. 未完成 / 已知问题 / 风险

- 未完成项（含原因）：
- 已知边界（未验证、未覆盖、依赖环境）：
- 回归风险与影响面：
- 回滚方式（commit revert / 开关 / 备份恢复）：

## 5. 下一步

- 建议下一任务 ID：
- 接手人开工命令：
  ```bash
  cd <worktree> && git switch <branch> && git pull --ff-only
  npm run check
  ```
- 需要 @Lead 决策的事项：

## 6. 交接自检

- [ ] `STATE.md` 已更新（状态/owner/sha/下一步）
- [ ] `JOURNAL.md` 已追加一条
- [ ] 工作区干净（`git status` 仅 ignored；WIP commit 已标注）
- [ ] 未写入任何密钥 / `.env` 内容 / 绝对临时路径
- [ ] 证据可复现，命令未依赖未提交的本地状态
```
