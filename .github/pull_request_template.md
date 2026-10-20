## 背景

<!-- 要解决什么问题？关联 issue / 文档 -->

## 改动层

- [ ] frontend
- [ ] backend
- [ ] db
- [ ] llm

## 改动范围

<!-- 关键文件、接口、页面、迁移编号 -->

## 契约影响

- [ ] 无契约变化
- [ ] 新增字段/接口（向后兼容）
- [ ] 修改字段/行为
- [ ] 废弃字段（保留周期：___）

涉及 `src/contracts/*` 或 `docs/api/v1.md` 时，说明两端如何同步。

## 验证证据

```bash
# 粘贴实际执行的命令与结果
```

- [ ] frontend：`typecheck` / `test:web` / `build:web`
- [ ] backend：`lint` / `npm test`（含 DATABASE_URL）
- [ ] db：`db:migrate` / `db:status` / verify / outbox 状态
- [ ] llm：样例回归 / token / 延迟 / 成本
- [ ] 全量：`npm run check`

## 数据与迁移

- [ ] 无迁移
- [ ] 新增迁移：`__`
- [ ] 回滚方式：

## 安全与开关

- [ ] 新接口默认鉴权，或已加入公开白名单
- [ ] 敏感操作已加权限点
- [ ] 未提交密钥/`.env`
- [ ] 开关默认值安全

## 回滚

<!-- 开关 / 代码 / 数据，按优先级写 -->
