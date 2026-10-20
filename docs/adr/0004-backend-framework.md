# ADR-0004: 后端 HTTP 框架保持 Express（升级到 5.x）

- 状态：已接受（2026-10-20）
- 相关：ADR-0001（数据库）、ADR-0002（前后端分离）

## 背景

后端现状：

- Node.js 22 + ESM JavaScript；
- **Express 4.21**，41 个路由文件、**337 个端点**；
- 测试使用 `node:test` + `supertest`，765 个用例；
- 已有中间件：JWT、`authOptional`、媒体访问控制、性能监控；
- 企业级改造需要：参数校验、OpenAPI、限流、幂等、审计、队列。

问题不是"Express 能不能撑住"，而是**是否值得为了框架而重写 337 个端点**。

## 决策

**继续使用 Express，并升级到 5.x。** 不引入 NestJS/Fastify 重写。

配套技术栈：

| 层 | 选型 |
|---|---|
| 运行时 | Node.js 22 LTS，ESM |
| HTTP | **Express 5.x** |
| 参数校验 | zod（边界层） |
| 数据库 | PostgreSQL 16 + `pg` + Kysely |
| 迁移 | 编号 SQL + 自带 runner（advisory lock、校验和） |
| 队列 | BullMQ + Redis（Phase 7） |
| 日志/追踪 | pino + OpenTelemetry（Phase 7） |
| API 文档 | OpenAPI，由契约与路由元数据生成 |
| 测试 | `node:test` + `supertest` + 真实 PostgreSQL 集成测试 |

架构约束：

- **routes 只做 HTTP 适配**：解析、校验、调用 service、返回；
- **service 不依赖 `req/res`**；
- **repository 不依赖 HTTP**；
- 错误统一交给错误中间件，不在每层重复拼响应；
- 校验在边界完成，service 内不重复做类型判断。

## 为什么不是其他框架

| 方案 | 结论 | 原因 |
|---|---|---|
| **Fastify** | 暂不采用 | 性能与 schema 序列化更优，但迁移 337 个端点、重写中间件与测试成本高；当前瓶颈在数据库与长任务，不在 HTTP 框架 |
| **NestJS** | 不采用 | 模块/DI 适合大团队与 TS，但项目是 JS 且已有清晰分层；重写收益低于成本 |
| **Hono** | 不采用 | 轻量、Web 标准，适合边缘部署；Node 侧文件上传、长任务、生态中间件不如 Express 成熟 |
| **Koa** | 不采用 | 中间件模型差异带来的迁移成本没有对应收益 |
| **GraphQL / tRPC** | 不采用 | 企业开放 API 需要 REST + OpenAPI；内部类型安全可用 zod 生成类型 |

## Express 5 升级计划

Express 5 的关键收益：**async handler 的 rejected promise 自动进入错误中间件**、`req.query` 解析更严格、安全维护线。

升级步骤（独立小步，可回滚）：

1. `npm install express@^5`，锁定版本。
2. 兼容性扫描：
   - 通配符路由（`*` 改为命名参数）——当前代码未使用；
   - `res.sendfile`、`req.param()`、`app.del()`——当前未使用；
   - `res.status()` 非法状态码、`res.redirect('back')`——扫描确认。
3. 跑全量测试（765+）与 API 冒烟：`/health`、`/api/v1/meta`、小说核心链路。
4. 观察启动日志、错误中间件、静态资源与 legacy 桥接。
5. 通过后更新依赖与文档；失败则回退到 4.21（package-lock 保留）。

> 升级不改变现有路由与响应，属于框架维护，不并入业务迁移提交。

## 重新评估的触发条件

满足任一条件时再考虑 Fastify 或拆分服务：

- 压测显示 HTTP 层是瓶颈（P95 超标且数据库与外部 Provider 均不是主因）；
- 需要按 schema 做高性能序列化，且 Express 方案实测不足；
- 新增独立服务（如任务 Worker 网关），可独立选型，不要求与主 API 一致；
- 团队统一转向 TypeScript 并需要 DI/模块约束。

## 后果

正面：

- 零重写成本，现有 337 个端点、测试与中间件继续可用。
- 分层约束与 zod/Kysely 组合足以支撑企业级能力。
- 团队无需学习新框架。

负面：

- Express 的 schema-first 与序列化能力弱于 Fastify，需要自行用 zod + OpenAPI 补齐。
- 中间件顺序与错误处理需要团队约定，避免"每个路由自己 try/catch"。
- 性能上限低于 Fastify；通过压测与数据库优化先解决真实瓶颈。

## 验收

- Express 5 下 765+ 测试全绿；
- `/api/v1/meta`、小说列表/详情、批量出图、健康检查冒烟通过；
- 错误中间件能捕获 async 异常并返回统一错误结构；
- ADR 与本文件保持一致。
