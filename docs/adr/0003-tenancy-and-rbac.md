# ADR-0003: 多租户模型与 RBAC

- 状态：已接受（2026-10-20）
- 相关：ADR-0001

## 背景

当前数据模型是「用户 → 项目」两级，团队/企业能力主要落在 `teams`、`enterprise` 的 JSON 配置里：

- 32 处路由使用 `authOptional`，多数接口可匿名访问；
- 部分接口在无登录时回退到 `userId='default'`；
- 项目权限判断散落在路由与 service 中，没有统一策略层；
- 企业配置（SSO、密码策略、IP 白名单、水印）只是存储，没有强制执行。

这无法通过企业客户的安全审计，也无法防止跨项目/跨团队越权。

## 决策

1. 租户模型采用 **Organization → Team → Project** 三级：
   - `organizations` 是计费与数据隔离边界；
   - `teams` 是协作单位，可跨项目；
   - `projects` 归属一个 organization，可有 project members。
2. 所有租户数据表必须有 `org_id NOT NULL`，并建立 `(org_id, ...)` 复合索引。
3. 权限分两层：
   - 组织角色：`owner`、`admin`、`editor`、`viewer`、`billing`；
   - 项目角色：`owner`、`editor`、`commenter`、`viewer`。
4. 权限点采用 `resource:action` 命名：`project:read/write/delete`、`team:manage`、`billing:manage`、`audit:read`、`api_key:manage`。
5. 鉴权边界收紧：
   - 私有路由默认 `authRequired`；
   - 公开路由显式白名单（登录、注册、健康检查、公开分享、公开素材）；
   - 移除 `userId='default'` 隐式回退；
   - 统一 `req.auth = { userId, orgId, roles, scopes }`。
6. 租户隔离双层防护：应用层 `tenant` 中间件 + PostgreSQL RLS（事务内设置 `app.current_org_id`）。
7. 历史数据统一迁入 `default` organization；迁移脚本记录归属映射。
8. 审计日志只追加，记录登录、权限变更、删除、导出、API Key、计费与企业配置变更，并提供哈希链校验。

## 认证模式

- Web：`httpOnly + Secure + SameSite=Lax` 会话 Cookie，短期 Access Token，Refresh Token 轮换。
- 开放 API：API Key，仅存哈希，支持 scopes、过期、轮换、最后使用时间。
- 企业 SSO：OIDC Authorization Code + PKCE；SAML 作为后续适配器。
- 过渡期保留 Bearer JWT，避免破坏现有客户端。

## 备选方案

| 方案 | 结论 | 原因 |
|---|---|---|
| 仅 Team 两级 | 未采用 | 缺少企业级计费与数据隔离边界 |
| 仅 Project 级权限 | 未采用 | 无法表达组织管理员与跨项目角色 |
| 纯应用层过滤 | 未采用 | 一次遗漏即数据泄露，需要 RLS 兜底 |
| 自研 SSO | 未采用 | 维护成本高，OIDC 标准化程度足够 |

## 后果

正面：

- 企业客户可按组织隔离数据、统一计费、配置 SSO 与审计。
- 权限判断集中到策略层，路由只声明所需权限点。
- RLS 提供第二道防线，降低越权风险。

负面：

- 所有查询必须带 `org_id`，历史代码需要系统性改造。
- RLS 与连接池/事务配合需要谨慎（`SET LOCAL`）。
- 权限矩阵与迁移测试工作量较大。

## 验收

- 跨租户、跨项目访问测试全部返回 403/404。
- RBAC 矩阵覆盖 owner/admin/editor/viewer/billing。
- 私有路由未登录返回 401；公开白名单符合预期。
- 高危操作全部写入审计日志且可校验哈希链。
