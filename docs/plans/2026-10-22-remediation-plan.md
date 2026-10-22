> **状态更新 2026-10-22 15:20**：小说域 PG-only/legacy removal 已完成；R2-T2.2/T2.3/T2.7 完成；
> outbox/JSON 导出已删除；测试 817/138，`check:legacy` 0。本文中 `NOVEL_REPO_MODE`、`dual`、
> outbox、JSON 投影相关任务均为历史，不再执行；当前事实以 `docs/handoff/STATE.md` 为准。

# DreamReel 收口与整改实施计划（止血 → 收口 → 还债）

> **For Agent:** 本计划由多个智能体按轮次执行。开工前必须读 `docs/handoff/README.md`，领取任务后先读 `docs/handoff/STATE.md` 与 `docs/handoff/JOURNAL.md`；每个任务结束时必须更新这两个文件（见交接规范）。
>
> **Goal:** 在不破坏现有 820+138 测试与运行中数据的前提下，把 DreamReel 从「功能已成型、迁移半途、安全默认全开」推进到「可提交、可回滚、可对外」：先止血 P0，再完成小说域 PG 迁移收口，最后按域偿还技术债。
>
> **Architecture:** 以 `main` 为可发布基线；4 条并行泳道（数据安全 / 安全硬化 / 发布链 / 门禁与文档）各自在独立 git worktree 上开发，Lead 作为唯一集成者按「先 db、再 backend、再 frontend、再 docs」顺序合并并跑门禁。所有跨层改动先改契约，所有迁移只增不改，所有交付必须有可复现证据。
>
> **Tech Stack:** Node.js 22 + Express 5（ESM, JS）· React 19 + TypeScript + Vite · PostgreSQL 16 + Kysely（小说域）· JSON 文件库（其余域）· node:test + supertest · Vitest · Playwright · Docker Compose · Nginx。

---

## 0. 事实基线（2026-10-22 12:42 +08:00 实测，开工前须复核）

| 项 | 当前值 |
|---|---|
| 仓库 | `/Users/link/myApp/DreamReel`（`git@github.com:LinkSky109/DreamReel.git`） |
| 当前分支 | `feat/novel-pg-single-source`（在途迁移集成分支） |
| HEAD | `5080628 docs: 同步小说 PostgreSQL 单源与恢复文档` |
| 已提交 | `21176b7 feat(db): 建立小说域 PostgreSQL 迁移与恢复链路`（迁移 010–012、6 仓储、脚本、模型、测试）<br>`054ffb5 feat(llm): 增加小说分季分集规划与校验链路`（seasonPlan/episodePlan/seriesPlanner、脚本、测试）<br>`a2f72c0 feat(backend): 切换小说域 PostgreSQL 单源读写`（44 文件：service/route/app/config/scripts/package.json）<br>`cccc1b9 feat(frontend): 更新小说分季分集制作台`（web/src + public 产物 41 对替换）<br>`5080628 docs: 同步小说 PostgreSQL 单源与恢复文档`（11 篇 docs/AGENTS） |
| 已暂存未提交 | 无 |
| 未暂存 | 2 个 service 文件（`src/services/novelChildStore.js`、`src/services/novelProjectService.js`，写路径改读 PG，收口进行中） |
| 未跟踪 | `docs/plans/`、`docs/handoff/`（本计划与长期运行机制文档，待下一次 docs commit 收录） |
| 并发提示 | 12:23–12:40 期间观察到**另一执行者/会话在同一工作区持续提交与修改**。开工前必须先确认唯一执行者；见 §1.6 停止条件 7 |
| PostgreSQL | 本地 `dreamreel` 库，迁移 001–013 已应用、checksum 一致；小说域 1 部 / 1206 章 / 33 季 / 8496 集在库；outbox_events 已由 013 删除 |
| `.env` | 存在且已 gitignore；`PORT=3001`；`DATABASE_URL` 已配；`NOVEL_WRITE_MODE=postgres`；`OUTBOX_ENABLED=true`；`REQUIRE_AUTH` 未设置 → **生产模板同样未开** |
| 测试基线 | `npm run check` 通过：lint / typecheck / check:docs / 后端 817（串行跑，单次约 60s）/ 前端 138；E2E 1 条未复跑 |
| 已知硬约束 | `npm test` 不可并发（共享 `dreamreel_test` + `storage/test-run`）；已应用迁移不可改；不要删除 `default` org；不要提交 `.env`/`storage/` |

> 若开工时 `git status`、HEAD 或分支与上表不符：**先改 `STATE.md` 再执行**，不要假设。
> 历史分析证据（`storage/analysis/*.md`，gitignored）可作为问题定位参考，但以当前代码与命令输出为准。

---

## 1. 执行模型（多智能体 / 长期运行）

### 1.1 角色

| 角色 | 职责 | 人数 |
|---|---|---|
| **Lead（集成者）** | 唯一可操作 `main` 的人；派活、合并、跑全量门禁、维护 STATE/JOURNAL、对外汇报 | 1 |
| **Track Owner（泳道负责人）** | 在独立 worktree 完成本泳道任务，产出 commit + 证据，写交接单 | 3（db / security / release） |
| **Verifier** | 只跑门禁与冒烟，不改代码；写验证记录 | 1（可由 Lead 兼） |
| **Reviewer** | 对 db/auth/迁移类变更做独立 review（规则：db/auth 2 人，其余 1 人） | 1（可由另一 Track Owner 兼） |

### 1.2 分支与隔离

```
main ─────────────────────────► 可发布
 ├─ feat/novel-pg-single-source（在途集成，R0 完成后合入 main）
 ├─ fix/db-safety         ← R1 数据止血
 ├─ fix/security-p0       ← R1 安全止血
 ├─ fix/release-p0        ← R1 发布止血
 ├─ feat/contracts-r2     ← R2 契约收口（backend+docs）
 └─ feat/hardening-r3     ← R3 技术债（按子任务再开短期分支）
```

每个 Track 使用**独立 worktree**（同一物理仓库，互不覆盖）：

```bash
git worktree add -b fix/db-safety       ../DreamReel-wt/db       main
git worktree add -b fix/security-p0     ../DreamReel-wt/security main
git worktree add -b fix/release-p0      ../DreamReel-wt/release  main
# 依赖与配置：`.env` 软链，node_modules 软链（只读依赖）
ln -s /Users/link/myApp/DreamReel/.env       ../DreamReel-wt/security/.env
ln -s /Users/link/myApp/DreamReel/node_modules ../DreamReel-wt/security/node_modules
```

**禁止**：两个 agent 在同一个 worktree 里改文件；同一时刻跑两个 `npm test`；在 `main` 上直接 commit（只有 Lead 的 merge commit 例外）。

### 1.3 轮次状态机

```
R0 基线 → R1 止血 → R2 收口 → R3 还债（可多轮）
任务状态：pending → claimed → in_progress → review → done
                            └→ blocked（附阻塞原因/证据/下一步）
```

每个任务必须闭环：**改代码 → 写测试 → 跑门禁 → commit → 更新 STATE/JOURNAL → Review → 合并**。没有证据不算完成。

### 1.4 门禁分级（统一走 `scripts/agent/gate.sh`，见 R0-T0.4）

| 级别 | 命令 | 何时用 |
|---|---|---|
| G0 quick | `gate.sh quick`（lint + typecheck） | 每次 commit 前 |
| G1 layer | `gate.sh backend / frontend / docs` | 对应层任务完成时 |
| G2 full | `gate.sh full`（lint+typecheck+docs+test+test:web，**串行**） | 合并 main 前（Lead 执行） |
| G3 release | `gate.sh e2e` + `gate.sh build` + `gate.sh smoke` | R1/R2 收尾、发布前 |

门禁结果必须贴进交接单（命令、退出码、关键输出行）。

### 1.5 交接与长期运行

- **唯一事实源**：`git` > `docs/handoff/STATE.md` > `docs/handoff/JOURNAL.md` > 本计划。
- 每个任务交接单使用 `docs/handoff/TEMPLATE.md`，并在 `JOURNAL.md` 追加一条（append-only），同时更新 `STATE.md` 看板。
- **交接触发**：任务完成 / 阻塞 > 2h / 上下文 > 60% 或单轮 > 45min / 用户打断 / 门禁连续失败 2 次。
- **阻塞升级 SLA**：2h @owner 提醒 → 8h Lead 接管或换人 → 24h 降级/绕行 → 48h 上报用户。
- **异常自愈**：可重试失败最多 3 次，退避 10min → 30min → 60min；第 3 次仍失败即 `blocked`，不得静默重跑。
- **定时巡检**：Lead 用 DSH 定时任务每日 10:00 巡检一次（读 STATE/JOURNAL → 查 git/worktree/CI → 更新看板 → 产出当日任务包）；每周五出周报。
- **上下文纪律**：一个轮次只做一个任务；不把上一任务的调试细节带进下一轮，需要时读交接单。

### 1.6 停止条件（任一触发即冻结并向 Lead 报告）

1. 出现未预期的 `git status` 变化（有非本任务文件被改动/被删除）。
2. 迁移在非测试库上执行失败，或 `schema_migrations` 与仓库文件 checksum 不一致。
3. `npm test` 连续 2 次失败且失败用例与本次改动无关（先怀疑并发/环境，确认后再继续）。
4. PG 不可连、`storage/` 不可写、`/health/ready` 503。
5. 需要改 `.env`、删除 `default` org、执行 `db:restore`/`series:rebuild` 等破坏性命令——必须先经 Lead 与用户确认。
6. 任务涉及生产部署/推送远端/发布——必须先经用户确认。
7. **发现并发执行者**：开工/巡检时若 `git log` 出现 STATE 未记录的新 commit，或工作区文件在未被本任务修改的情况下变化——立即停止写操作，@Lead 确认唯一执行者后再继续（本仓库已实际发生过）。

---

## 2. 阶段总览

| 阶段 | 目标 | 任务数 | 预计 | 完成标志 |
|---|---|---|---:|---|
| **R0 基线** | 备份可回滚；在途改动按层提交；合并 main；建立门禁与交接机制 | 6 | 0.5–1 天 | `main` 干净、`npm run check` 绿、tag `baseline/r0-*`、handoff 文档可用 |
| **R1 止血** | 数据不可逆风险、P0 安全、P0 发布阻断 | 16 | 2–3 天 | R1 验收清单全绿（见 §9）、tag `r1-stopgap` |
| **R2 收口** | 契约、Phase 3c-2、文档一致性、全量门禁与交付报告 | 7 | 3–5 天 | `check:full` 绿、E2E 绿、`npm run build`/`build:web` 绿、tag `r2-cutover` |
| **R3 还债** | P1/P2：IDOR、默认用户、校验、配额、长任务、前端质量、可观测 | 9 组 | 2 周+ | 每组独立验收并合入 main |

---

## 3. R0 — 基线与机制（Lead 主导，0.5–1 天）

### R0-T0.1 备份与回滚点（Lead，30 min）

**Files:** 仅写 `storage/backup/`（gitignored）。

**Steps:**
```bash
cd /Users/link/myApp/DreamReel
set -a; source .env; set +a
STAMP=$(date +%Y%m%d-%H%M); mkdir -p storage/backup
pg_dump "$DATABASE_URL" -Fc -f "storage/backup/dreamreel-$STAMP.dump"
tar -czf "storage/backup/archive-$STAMP.tgz" storage/archive storage/data
git bundle create "storage/backup/repo-$STAMP.bundle" --all
# 校验 dump 可读与关键计数（宿主无 psql，用 node + pg）
node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const m=await c.query('select count(*) from schema_migrations');const t=await c.query(\"select count(*) from information_schema.tables where table_schema='public'\");console.log('migrations',m.rows[0].count,'tables',t.rows[0].count);await c.end()})()"
```
**Expected:** dump 文件非空；`migrations 12 tables 27`；tgz、bundle 存在。
**记录:** 把文件路径、大小、命令写入 `JOURNAL.md`。
**回滚:** 恢复命令写进 `docs/runbooks/novel-pg-restore.md`（R1-T1A.2 一起改）。

### R0-T0.2 在途改动按层提交（Lead，2–3 h）

> **状态更新（12:40）：已由并发执行者基本完成** —— `a2f72c0`（backend）、`cccc1b9`（frontend）、`5080628`（docs）已落库；`21176b7`（db）、`054ffb5`（llm）此前已提交。**剩余**：2 个 service 文件（`novelChildStore.js`/`novelProjectService.js`）的收口改动仍在工作区，需由当前执行者提交或由 Lead 确认后接管；`docs/plans/` 与 `docs/handoff/` 尚未提交。若开工时已全部提交，本任务直接标 done 并跳到 T0.3。

**核对清单（按实际提交核对，而不是重复提交）:**
```bash
cd /Users/link/myApp/DreamReel && git status --porcelain | head -40   # 先核对
git log --oneline -8
git show --stat --oneline a2f72c0 cccc1b9 5080628 | head -80
# 关键核对：backend commit 不包含 web/public/docs；frontend commit 含 web+public 且 41 对替换；docs commit 含 AGENTS+docs
git diff --name-only 21176b7^..HEAD -- web public public/assets | head
```
**若仍有未提交改动（当前即如此）:** 由该改动的作者提交，或经 Lead 明确授权后按层补 commit：
- 后端文件 → `feat(backend): 写路径读 PG 收口`
- `docs/plans`、`docs/handoff` → `docs: 增加整改计划与长期交接机制`

**Expected:** `git status` 干净（仅 ignored 的 `.env`/`storage`）。
**Gate:** `npm run check`（G2）退出码 0。

### R0-T0.3 合并 main + 打基线 tag（Lead，30 min）

```bash
cd /Users/link/myApp/DreamReel
./scripts/agent/gate.sh full            # 先门禁，后合并（若脚本尚未建，先执行 R0-T0.4）
git switch main
git merge --no-ff feat/novel-pg-single-source -m "merge: 小说域 PG 单源与 LLM 分季分集（R0 基线）"
git tag -a baseline/r0-2026-10-22 -m "R0 基线：小说 PG 单源 + 分季分集已提交，check 全绿"
./scripts/agent/gate.sh full            # 合并后再跑一次
```
**Expected:** main 上 `npm run check` 绿；tag 存在；`STATE.md` 记录 merge sha。
**远端:** 仅当用户明确同意后 `git push origin main --tags`。

### R0-T0.4 门禁/测试锁脚本（Lead，30 min）

**Files:**
- Create `scripts/agent/gate.sh`
- Create `scripts/agent/kickoff.sh`

**Step 1 — `scripts/agent/gate.sh`：**
```bash
#!/usr/bin/env bash
# DreamReel 统一门禁：重型检查串行化（共享 dreamreel_test 库与 storage/test-run）
set -euo pipefail
cd "$(dirname "$0")/../.."
LEVEL="${1:-quick}"
LOCK_DIR="${TMPDIR:-/tmp}/dreamreel-gate.lock"

acquire() {
  for _ in $(seq 1 180); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo "$$" > "$LOCK_DIR/pid"
      trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
      return 0
    fi
    echo "[gate] 等待其它门禁/测试进程释放锁（$LOCK_DIR）..."
    sleep 5
  done
  echo "[gate] 获取锁超时（15 分钟）" >&2; exit 75
}

case "$LEVEL" in
  quick)    npm run lint; npm run typecheck ;;
  docs)     npm run check:docs ;;
  backend)  npm run lint; acquire; npm test ;;
  frontend) npm run typecheck; npm run test:web ;;
  full)     npm run lint; npm run typecheck; npm run check:docs; acquire; npm test; npm run test:web ;;
  e2e)      acquire; npm run test:e2e ;;
  build)    npm run build:web ;;
  smoke)    bash scripts/agent/smoke.sh ;;
  *) echo "usage: gate.sh quick|docs|backend|frontend|full|e2e|build|smoke" >&2; exit 2 ;;
esac
```
**Step 2 — `scripts/agent/kickoff.sh`：**
```bash
#!/usr/bin/env bash
# 开工自检：分支/worktree/依赖/工作区是否干净
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "branch: $(git branch --show-current)"
echo "HEAD:   $(git rev-parse --short HEAD)"
test -f .env || { echo "缺少 .env（或 symlink）" >&2; exit 1; }
test -d node_modules || { echo "缺少 node_modules（或 symlink）" >&2; exit 1; }
dirty=$(git status --porcelain -- . ':(exclude)storage' | wc -l | tr -d ' ')
echo "dirty tracked files: $dirty"
[ "$dirty" = "0" ] || { echo "工作区不干净，先交接/清理" >&2; git status --short | head -20; exit 2; }
echo "OK"
```
**Step 3:** `chmod +x scripts/agent/*.sh`
**Step 4:** `git add scripts/agent && git commit -m "chore(agent): 增加长期运行门禁与测试锁"`
**Acceptance:** `scripts/agent/kickoff.sh` 通过；`gate.sh quick` 退出码 0；`gate.sh full` 退出码 0（串行）。

### R0-T0.5 建立 worktree 与运行环境（Lead，30 min）

```bash
cd /Users/link/myApp/DreamReel
git worktree add -b fix/db-safety    ../DreamReel-wt/db       main
git worktree add -b fix/security-p0  ../DreamReel-wt/security main
git worktree add -b fix/release-p0   ../DreamReel-wt/release  main
for w in db security release; do
  ln -sfn /Users/link/myApp/DreamReel/.env        ../DreamReel-wt/$w/.env
  ln -sfn /Users/link/myApp/DreamReel/node_modules ../DreamReel-wt/$w/node_modules
done
```
**Expected:** 3 个 worktree；每个 `npm run check:docs` 可跑；`.env`/`node_modules` 为软链。
**注意:** 每个 worktree 的 `storage/` 自动创建为独立目录；`.env` 未设 `STORAGE_PATH`，不会串到主仓库。

### R0-T0.6 启动长期机制（Lead，10 min）

1. 读 `docs/handoff/README.md`，确认 `STATE.md` 已初始化为 R0。
2. 创建会话级目标（DSH）：`create_goal`，objective = 「按 docs/plans/2026-10-22-remediation-plan.md 完成 R0→R1→R2，每轮更新 STATE/JOURNAL 并跑门禁」。
3. 创建每日巡检：`schedule_create`，`daily 10:00 Asia/Shanghai`，prompt = 「巡检 DreamReel 整改：读 docs/handoff/STATE.md 与 JOURNAL.md 最新条目，检查 git/worktree/门禁日志，更新 STATE 并给出当日任务包与阻塞升级」。
4. 在 `JOURNAL.md` 记录机制启用。

---

## 4. R1 — 止血（2–3 天，三条泳道并行）

> 三条泳道都从 `main` 拉分支，各自 worktree；**互不改对方文件**。合并顺序：db → security → release（Lead 串行合并，每次合并前 G2）。

### 泳道 A：数据不可逆风险（`fix/db-safety`，owner：Track-A）

#### R1-T1A.1 修复 `db:verify:novels`（2 h）
**Files:** Modify `scripts/migrate-novels-to-pg.js:24-30`（`loadNovels`）、`:112-118`（双向比对）；可复用 `scripts/migrate-novel-children-to-pg.js:53-62` 的归档加载；Test `tests/dbVerifyArchive.test.js`（新建，纯函数级）。
**Steps:**
1. 先写失败测试：构造临时归档 JSON（1 部小说），断言 `loadNovels()` 能返回它（把 `loadNovels` 抽成可注入路径的纯函数并导出）。
2. 运行 `node --test tests/dbVerifyArchive.test.js` → FAIL（路径写死 db.json）。
3. 实现：`loadNovelSource()` 优先读 `db.json.novelProjects`，为空则用 `novelJsonArchive.findLatestNovelArchive()`；两边都空时报明确错误。
4. 复跑测试 → PASS。
5. 真实校验：`npm run db:verify:novels` → 期望 `verify: postgres=1 source=1 mismatches=0`，退出码 0（只读，不写库；如脚本仍会 INSERT org，先改成 verify 模式跳过写）。
6. Commit `fix(db): 让 db:verify:novels 支持归档回退（PG 单源后仍可校验）`。
**Acceptance:** 命令退出码 0 + 输出 mismatch=0 + 测试绿。
**Rollback:** 脚本仅读；回滚 commit 即可。

#### R1-T1A.2 重写回滚与恢复口径（2 h）
**Files:** `docs/runbooks/novels-postgres-cutover.md`（§回滚、§状态）、`docs/runbooks/novel-pg-restore.md`、`docs/runbooks/postgres-resilience-drills.md:132`、`AGENTS.md:17`、`docs/collaboration/layer-workflow.md`（开关表）、`.opencode/skills/dreamreel-layer-collaboration/SKILL.md:89`、`.env.example:208-211`、`deploy/docker-compose.dev.yml:42`。
**Steps:**
1. 全局检索：`rg -n 'NOVEL_REPO_MODE|NOVEL_WRITE_MODE=legacy.*回滚|JSON 为事实源|JSON.*最新事实源' AGENTS.md docs .opencode .env.example deploy`。
2. 统一口径：**Phase 3 之后回滚 = `pg_dump`/PITR 恢复 + `storage/archive/novels-from-db-*.json` 重建**；`legacy` 仅用于测试/E2E，不是生产回滚手段；`dual` 标注为「已废弃，仅兼容」。
3. 删除所有 `NOVEL_REPO_MODE` 死开关（文档、`.env.example`、compose、SKILL）。
4. 在 cutover runbook 顶部写「当前状态：PG 单源（2026-10-22），本文历史章节仅作背景」。
**Acceptance:** `rg 'NOVEL_REPO_MODE'` 无输出；`rg 'legacy' docs/runbooks` 不再宣称可回滚（允许“仅测试”表述）。
**Commit:** `docs(db): 修正 PG 单源后的回滚与恢复口径`。

#### R1-T1A.3 迁移 013：删除 episodes 旧唯一约束（2 h，**需 Reviewer**）
**Files:** Create `src/db/migrations/013_drop_legacy_episode_unique.sql`；Modify `tests/novelWriteRepositories.test.js`。
**Steps:**
1. 确认约束名：`003_novels.sql:103` 未命名 UNIQUE → 默认名 `episodes_novel_id_season_id_episode_no_key`。
2. 写迁移：
```sql
-- 013 删除 episodes 旧 (novel_id, season_id, episode_no) 唯一约束。
-- 新模型以 (novel_id, logical_key) 部分唯一索引（012）为业务键；旧约束会阻止重排/重编号。
ALTER TABLE episodes DROP CONSTRAINT IF EXISTS episodes_novel_id_season_id_episode_no_key;
```
3. 写测试（先失败）：在 `tests/novelWriteRepositories.test.js` 增加「同一集重排换序（episode_no 互换）成功且 logical_key 不变」用例。
4. 在 `_test` 库跑：`gate.sh backend`（会重建 `dreamreel_test` 并 migrate 到 013）→ PASS。
5. **不**对开发库自动执行；Lead 确认备份后跑 `npm run db:migrate`，再 `npm run db:status` 验证 13 条。
6. Commit `fix(db): 迁移 013 删除 episodes 旧唯一约束，支持重排`。
**Acceptance:** 测试绿；`db:status` 显示 013 已应用；重排用例通过。
**Rollback:** 新增迁移不可回滚执行；恢复走备份（已在 T0.1 准备）。

#### R1-T1A.4 迁移链冷启动验证（1 h）
**Steps:**
```bash
set -a; source .env; set +a
node -e "const {Client}=require('pg');(async()=>{const u=new URL(process.env.DATABASE_URL);u.pathname='/dreamreel_migratecheck';const c=new Client({connectionString:u.toString()});await c.connect();await c.query('drop database if exists dreamreel_migratecheck').catch(()=>{});await c.end()})()"
# 建库 + 从 0 迁移 + 校验
DATABASE_URL="$(node -e "const u=new URL(process.env.DATABASE_URL);u.pathname='/dreamreel_migratecheck';console.log(u.toString())")" npm run db:migrate
DATABASE_URL="…" node -e "…select count(*) from schema_migrations / information_schema.tables…"
DATABASE_URL="…" npm run db:status
# 清理
node -e "…drop database dreamreel_migratecheck…"
```
**Expected:** 13 条迁移全部应用、27 张表；校验后删除临时库。
**Evidence:** 输出贴进 `JOURNAL.md`；Commit 无（只为验证）。

#### R1-T1A.5 `dual` 模式显式废弃（1 h，可选）
**Files:** `src/config/index.js`（启动告警）、`docs/runbooks/*`。
**Steps:** 当 `NOVEL_WRITE_MODE=dual` 时 `logger.warn('[config] dual 已废弃：…')`；文档标注。测试：`tests/configCompat.test.js` 断言告警函数被调用（若无法单测则只做文档，不写测试）。
**Commit:** `chore(db): 标记 NOVEL_WRITE_MODE=dual 为废弃兼容态`。

### 泳道 B：安全止血（`fix/security-p0`，owner：Track-B）

> 原则：**默认拒绝、显式白名单、身份只来自 `req.auth`**。每条修复都先写会失败的测试。

#### R1-T1B.1 鉴权默认安全值（2–3 h）
**Files:** Create `src/config/authEnforce.js`；Modify `src/config/index.js:38`、`src/server.js`（启动告警）、`.env.example`（新增 `REQUIRE_AUTH`）、`docker-compose.yml:16-21`；Test `tests/authEnforce.test.js`（新建）。
**Steps:**
1. 失败测试（4 例）：`NODE_ENV=production` 且未设 → true；production + `REQUIRE_AUTH=false` → false；development 未设 → false；任意环境 `REQUIRE_AUTH=true` → true。
2. 实现：
```js
// src/config/authEnforce.js
export function resolveAuthEnforce(env = process.env) {
  if (env.REQUIRE_AUTH === 'true') return true
  if (env.REQUIRE_AUTH === 'false') return false
  return env.NODE_ENV === 'production'
}
```
`config/index.js` 改为 `enforce: resolveAuthEnforce()`。
3. `server.js` 启动日志：production 且 `!config.auth.enforce` → `logger.error('[security] 生产环境未开启 REQUIRE_AUTH，所有 /api 端点可匿名访问')`。
4. `.env.example` 增加：`# 强制登录（生产默认 true；本地开发可显式 false）\n# REQUIRE_AUTH=true`；`docker-compose.yml` environment 增加 `- REQUIRE_AUTH=true`。
5. 复跑测试 → PASS；`gate.sh full` → PASS（测试进程内 `REQUIRE_AUTH=false` 显式，不受影响）。
6. Commit `feat(security): 生产默认开启鉴权闸门并告警`。
**Acceptance:** 4 个单测绿；`NODE_ENV=production node -e "import('./src/config/index.js').then(m=>console.log(m.default.auth.enforce))"` 输出 true。

#### R1-T1B.2 `/api/v1` 白名单归一化（1–2 h）
**Files:** Modify `src/middleware/authGate.js:26,32`；Test `tests/securityPolicy.test.js`。
**Steps:**
1. 失败测试：`isPublicApiRequest` 对 `{baseUrl:'/api', path:'/v1/auth/login'}` 应为 true；对 `{baseUrl:'/api', path:'/v1/projects'}` 应为 false。
2. 实现 `normalizeApiPath(full)`：把 `/api/v1` → `/api`、`/api/v1/...` → `/api/...`，再做白名单匹配。
3. 复跑 `gate.sh backend` → PASS；补一条 v1 登录的 supertest（REQUIRE_AUTH=true）不 401。
4. Commit `fix(security): 修复 /api/v1 公开白名单不匹配`。
**Acceptance:** 新测试绿；开闸后 v1 登录可用。

#### R1-T1B.3 API Key 哈希化 + 强鉴权（3–4 h，**需 Reviewer**）
**Files:** `src/services/apiKeyService.js:17-37,61-68`、`src/routes/apiKeys.js:9-30`；Create `tests/apiKeys.test.js`。
**Steps:**
1. 失败测试：创建 key 后库内**不含明文**；`validate(fullKey)` 仍成功；匿名 `POST /api/api-keys` → 401；body 传 `userId` 被忽略；`GET /api/api-keys` 不带 query 时只返回本人。
2. 实现：
   - `createKey`：只存 `keyHash = sha256(fullKey)`、`keyPrefix`；完整 key 仅返回一次。
   - `_load()` 时惰性迁移：若旧记录有 `key` 无 `keyHash` → 计算 hash、删除 `key`、标记需要保存。
   - `validate`：按 hash 查找，用 `crypto.timingSafeEqual` 比较。
   - 路由：`router.use(authRequired)`；创建/列表/吊销都用 `req.user.id`，忽略 body/query userId；scopes 白名单校验。
3. `gate.sh backend` → PASS；手工 `curl -X POST localhost:3001/api/api-keys` → 401。
4. Commit `fix(security): API Key 只存哈希并强制登录与归属`。
**Acceptance:** 测试绿；`db.json` 中 `apiKeys[*]` 无 `key` 字段（仅 `keyHash/keyPrefix`）。

#### R1-T1B.4 封面上传路径穿越（2 h）
**Files:** `src/routes/projects.js:315-358`；Modify `tests/customCover.test.js`。
**Steps:**
1. 失败测试：`POST /api/projects/..%2F..%2Fevil/cover` 返回 400/404，且 `storage/` 外无文件生成；`ext=svg` 返回 400；非 owner → 403。
2. 实现顺序：
   - 最前面 `const own = await requireProjectOwnership(req,res); if (!own) return`
   - `const projectId = String(req.params.projectId)`；`if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return res.status(400)…`
   - `const extMap = { jpeg:'jpg', jpg:'jpg', png:'png', webp:'webp' }`；不在白名单 → 400
   - `const filepath = path.resolve(thumbnailsDir, filename)`；`if (!filepath.startsWith(path.resolve(thumbnailsDir) + path.sep)) return res.status(400)…`
3. `gate.sh backend` → PASS。
4. Commit `fix(security): 修复自定义封面路径穿越与越权写入`。
**Acceptance:** 三个新测试绿。

#### R1-T1B.5 管理面鉴权（3–4 h）
**Files:** `src/routes/enterprise.js`、`src/routes/system.js`、`src/routes/webhooks.js`、`src/routes/teams.js`、`src/routes/cloudDrive.js`；Create `tests/adminAuthz.test.js`。
**Steps:**
1. 失败测试（REQUIRE_AUTH=true，先注册 owner/viewer 两账号）：
   - 每个前缀无 token → 401；
   - viewer token 访问 enterprise/system/webhooks/cloud-drive → 403；
   - owner/admin token → 200（或业务 4xx，但不能是 401/403）。
2. 实现：
   - `enterprise.js`：`router.use(authRequired, requirePermission(PERMISSIONS.ENTERPRISE_MANAGE))`；`/audit*` 用 `AUDIT_READ`。
   - `system.js`：把 `GET /health` 留在 router.use 之前；其余 `authRequired + ENTERPRISE_MANAGE`。
   - `webhooks.js`：`router.use(authRequired, requirePermission(ENTERPRISE_MANAGE))`（临时；R3 做用户级归属）。
   - `teams.js`：`router.use(authRequired)`；所有 `ownerId/userId` 改为 `req.user.id`，成员操作校验当前用户是 team owner/admin。
   - `cloudDrive.js`：`router.use(authRequired, requirePermission(ENTERPRISE_MANAGE))`（服务端共享 cookie 属管理操作）。
3. `gate.sh backend` → PASS。
4. Commit `fix(security): 收紧企业/系统/Webhook/团队/云盘管理面鉴权`。
**Acceptance:** 新测试矩阵全绿；手工 curl 无 token 全部 401。

#### R1-T1B.6 媒体访问兜底收紧（2 h，可选/开关控制）
**Files:** `src/middleware/mediaAccess.js:189-195`、`src/config/index.js`。
**Steps:** 增加 `MEDIA_STRICT`（默认 false）；strict 时无法反查归属 → 403。文档记录；测试两条分支。Commit `fix(security): 媒体访问无法反查时不再默认放行（开关）`。
**Acceptance:** 开关关闭时行为不变；开启时越权 403。

### 泳道 C：发布止血（`fix/release-p0`，owner：Track-C）

#### R1-T1C.1 前端 API 基址修复（1 h）
**Files:** `web/src/lib/api.ts:121-128`；Create `web/src/lib/apiBase.test.ts`。
**Steps:**
1. 失败测试：jsdom 下 `location.port=''` 时 `apiBase()==='/api'`；`ENV_API_URL` 优先；`localStorage` 覆盖次之。
2. 实现：
```ts
export function apiBase(): string {
  const envBase = (window as Window & { ENV_API_URL?: string }).ENV_API_URL
  if (envBase) return envBase
  const saved = localStorage.getItem('dreamreel_api_url')
  if (saved) return saved
  return '/api'   // 同源；Vite dev 与 Nginx 均已代理 /api
}
```
3. `gate.sh frontend` → PASS。Commit `fix(frontend): 生产环境 API 基址统一为同源 /api`。
**Acceptance:** 测试绿；`rg 'localhost:3000/api' web/src` 无输出。

#### R1-T1C.2 单进程镜像内构建 + 去掉示例密钥（3 h）
**Files:** `Dockerfile`（重写为多阶段）、`.dockerignore`（确认排除 `node_modules`、`storage`、`.env`）。
**Steps:**
1. 写新 Dockerfile：
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web/ ./web/
COPY public/ ./public/
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3 py3-pillow font-noto-cjk
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY --from=build /app/public ./public
RUN mkdir -p storage/videos storage/exports storage/audio storage/temp storage/data storage/thumbnails
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","node scripts/db-migrate.js && node src/server.js"]
```
2. 删除 `COPY .env.example ./.env`；启动时缺 `JWT_SECRET`（production）直接失败（`authService.js` 已有 ≥32 校验，确认会抛错 → 无需新增）。
3. 构建验证：`docker build -t dreamreel:r1 .`；无 Docker 则记 `blocked` 并转 CI 验证。
4. Commit `fix(release): 镜像内构建前端并移除示例密钥烘焙`。
**Acceptance:** 镜像构建成功；`docker run` 后 `/health/ready` 200；镜像内 `ls public/assets | wc -l` ≈ 71。

#### R1-T1C.3 Compose 补齐 PostgreSQL 与迁移启动（2 h）
**Files:** `docker-compose.yml`、`deploy/docker-compose.dev.yml`。
**Steps:**
1. 根 compose 增加：
```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dreamreel
      POSTGRES_PASSWORD: dreamreel
      POSTGRES_DB: dreamreel
    volumes: [dreamreel-pg:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dreamreel"]
      interval: 5s
      timeout: 3s
      retries: 20
  dreamreel:
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      - DATABASE_URL=postgres://dreamreel:dreamreel@postgres:5432/dreamreel
      - NOVEL_WRITE_MODE=postgres
      - OUTBOX_ENABLED=true
      - REQUIRE_AUTH=true
```
2. 移除容器内 localhost 依赖；`deploy/docker-compose.dev.yml` 删死开关并注明「容器内默认 legacy 仅用于无 PG 演示」。
3. 验证：`docker compose up -d`；`curl localhost:3000/health/ready` → `db: postgres`；`docker compose down -v`。
4. Commit `fix(release): Compose 补齐 PG 与迁移启动，移除死开关`。
**Acceptance:** compose 首次启动自动迁移成功；健康检查 200。

#### R1-T1C.4 构建产物策略（3 h，**决策点 D1，需用户/Lead 确认**）
> 背景：当前 `public/assets` 入库 + 镜像 `COPY public/` → 不可复现；但本地 `npm start` 依赖已构建产物。
**方案 A（推荐）**：产物退出 git。
```bash
git rm -r --cached public/assets
printf '\n# 前端构建产物（由 npm run build 生成）\npublic/assets/\n' >> .gitignore
```
- 更新 README「快速开始」：明确 `npm install && npm run build && npm start`；
- CI 增加 `npm run build` + `actions/upload-artifact`，不再要求 `public/` 干净；
- `scripts/clean-web-build.js` 保持清理逻辑（本地构建仍需要）；
- 验证：干净 clone → `npm ci && npm run build && npm start` → `/` 200 且 asset 200。

**方案 B（保守）**：保留入库 + CI 一致性门禁（`npm run build && git diff --exit-code -- public/`，需先固定 Vite hash 稳定性），并在发布脚本中强制 `git status --porcelain public/` 为空。
**Steps:** 由 Lead 与用户确认方案 → 按方案执行 → `gate.sh build` + `gate.sh smoke` → Commit `chore(release): 固定前端产物发布策略`。

#### R1-T1C.5 发布冒烟脚本（2 h）
**Files:** Create `scripts/agent/smoke.sh`。
**Steps:**
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export NODE_ENV=production REQUIRE_AUTH=true DB_DRIVER=json NOVEL_WRITE_MODE=legacy \
       OUTBOX_ENABLED=false JWT_SECRET="$(openssl rand -hex 32)" \
       PORT="${SMOKE_PORT:-3901}" STORAGE_PATH="/tmp/dreamreel-smoke-$$"
mkdir -p "$STORAGE_PATH/data"; echo '{"projects":{},"users":{}}' > "$STORAGE_PATH/data/db.json"
node src/server.js & PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf "$STORAGE_PATH"' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 1; done
curl -sf "http://127.0.0.1:$PORT/health/ready" >/dev/null
curl -sf "http://127.0.0.1:$PORT/api/v1/meta" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/projects")
[ "$code" = "401" ] || { echo "期望未登录 401，实际 $code"; exit 1; }
echo "smoke OK"
```
**Acceptance:** `gate.sh smoke` 退出码 0；脚本纳入 R1 门禁。
**Commit:** `test(release): 增加发布冒烟脚本（health/ready/meta/401）`。

---

## 5. R2 — 收口（3–5 天）

> 入口条件：R1 三泳道全部合并 main 且 G2 绿。R2 也在 worktree 上进行（`feat/contracts-r2` 与 `feat/cutover-r2`），Lead 合并。

### R2-T2.1 契约补齐（1.5 天，**必须先于前端合并**）
**Files:** Create `src/contracts/novels.js`；Modify `src/routes/novels.js`（`series/plan`、`episodes/:eid/outline`、`episodes/:eid/compose` 写接口接 `validateBody/validateQuery`）；Modify `docs/api/v1.md`（补 5–8 个新端点契约 + 统一包络/错误码说明）。
**Steps:**
1. 从现有 route 提取请求字段，写 zod schema（`z.coerce.number` 处理 query）。
2. 先写测试：非法 body → 422；合法 body → 进入 service（可用 supertest mock provider）。
3. 接中间件；`gate.sh docs` 通过（`check:docs` 只校验存在性）。
4. 文档补契约；`web/src/domain/types.ts` 如有字段缺失同步（前端类型只做镜像，不引 zod）。
5. Commit `feat(contracts): 补小说分季/分集大纲契约与文档`。
**Acceptance:** 422 测试绿；`docs/api/v1.md` 覆盖新增端点；`check:docs` 绿。

### R2-T2.2 移除 storageService 顶层 await（0.5–1 天） ✅ 已完成
**Files:** `src/services/storageService.js:827`（删除顶层 await）、`src/server.js`（显式初始化）、`scripts/*`（如需）、`tests/*`。
**Steps:**
1. 实现 `export async function initializeStorage()`：内部调用 `hydrateNovelsFromPg()`（非 PG 模式 no-op）；`server.js` 的 `isMainModule` 分支在 `listen` 前 `await initializeStorage()`。
2. 测试：`node -e "import('./src/services/storageService.js').then(()=>console.log('import ok'))"` 不再依赖数据库；`npm test` 全绿；E2E 绿。
3. Commit `refactor(storage): 取消模块顶层水合，改由 server 启动显式初始化`。
**Acceptance:** import 无副作用；G2 绿。

### R2-T2.3 Phase 3c-2：去除路由同步投影读（1 天） ✅ 已完成
**Files:** `src/routes/novels.js:340,460,507,1397`；`src/services/novelAsyncReadService.js`/`novelChildReadService.js`（补按 id 单条查询）。
**Steps:** 每处改 `await` 异步仓储读取；补测试（投影未水合时仍 200）；`gate.sh backend` 绿；提交 `refactor(novels): 路由读取统一走 PG 仓储`。

### R2-T2.4 文档与清单刷新（0.5 天） ✅ 已完成
**Steps:** `npm run inventory` → 刷新 `docs/architecture/route-inventory.md`、`storage-inventory.md`；更新 `docs/README.md`（42 router/94 service/338 端点/26 表）、`docs/architecture/database.md`（重写为 PG 单源现状，删 `NOVEL_REPO_MODE`）、`README.md`（环境变量开关、构建/部署）、ADR-0002（实施结果）、统一测试数口径。Commit `docs: 刷新架构清单与运行手册`。

### R2-T2.5 全量门禁与交付报告（0.5 天）
**Steps:** `gate.sh full` → `gate.sh e2e` → `gate.sh build` → `gate.sh smoke`；写 `docs/delivery/2026-10-XX-r2-cutover.md`（命令+结果+已知边界）；更新 STATE/JOURNAL；Lead 合并后 tag `r2-cutover`。

### R2-T2.6 双构建链收敛（0.5 天，依赖 D1 决策）
**Steps:** 若方案 A：删除 `web/dist` 相关残留、`copy-web-assets` 只服务分离部署、README 明确两种构建；若方案 B：加 `prebuild:web` 与 CI 校验。Commit `chore(build): 收敛前端构建链`。

### R2-T2.7 收尾已知边界（1 天，可选） ✅ 已完成（outbox/JSON 导出）
- `storage/novels/<id>/plan/*.json` 与 `novel_plan_artifacts` 双份：标注为缓存或删除写盘。
- `outbox` 空转：`OUTBOX_ENABLED=false` 默认化并写入文档（若确认不再需要镜像）。
- 删除死代码：`audioAssetService.js`、`novelJsonArchive.js`（后者在 T1A.1 可能已被使用，重查引用后再删）。

---

## 6. R3 — 还债（2 周+，按组领取）

> 每组独立短期分支（`fix/<layer>-<slug>`）、独立验收、独立合并；Lead 每组合并后跑 G2。任务颗粒在 kickoff 时再拆成 2–5 分钟步骤（遵循 writing-plans 规范）。

| ID | 任务 | 关键文件 | 首步 | 验收 | 依赖/工作量 |
|---|---|---|---|---|---|
| R3-T3.1 | **IDOR 全覆盖**：统一 `requireProjectOwnership` 并覆盖所有 `:projectId` 路由（projects/video/versions/export/analysis/collab/openApi） | `src/middleware/projectAccess.js`、`src/routes/*` | 先补 3 条越权失败测试 | 跨用户访问 403；own 200；矩阵测试绿 | 1.5 天 / 无 |
| R3-T3.2 | **移除 `userId='default'` 回退**（44 处）+ 禁止 body/query 指定身份 | `src/routes/*`、`src/middleware/auth.js` | 引入 `req.auth.userId` 单一来源 + 显式 `ALLOW_ANONYMOUS` 开关 | 匿名写接口 401/403；不再有 `\|\| 'default'` | 2 天 / T3.1 |
| R3-T3.3 | **zod 输入校验**覆盖写接口（projects/video/teams/store/gallery/novels） | `src/contracts/*`、`src/routes/*`、`src/middleware/validate.js` | 先 projects update 白名单 | 非法 body 422；契约文档同步 | 3 天 / T2.1 |
| R3-T3.4 | **付费端点配额与匿名 mock** | `src/middleware/quotaGuard.js`(新)、`src/routes/novels.js`、`src/services/providerResolver.js` | 先给角色抽取接 quota | 匿名/超额 → 429/403；real provider 仅登录可用 | 1.5 天 / T3.2 |
| R3-T3.5 | **长任务持久化**（jobs 表 + worker + 状态查询） | 新迁移 014、`src/services/videoService.js`、`src/routes/video.js` | 设计 job 状态机 ADR | 重启后任务可恢复；幂等键；进度查询 | 4 天 / T2.2 |
| R3-T3.6 | **错误处理统一**（AppError + 集中映射 + stack/requestId 日志） | `src/utils/appError.js`(新)、`src/app.js`、`src/routes/*` | 先 error middleware + 1 个域迁移 | 147 处 400 兜底逐步替换；500 不再泄漏 message | 1.5 天 / 无 |
| R3-T3.7 | **前端质量**：Editor RTL smoke、401 统一跳转、legacy CSS/JS 清理、ESLint 覆盖 web、恢复 StrictMode | `web/src/**`、`eslint.config.js`、`package.json` | 先 3 个 Editor smoke | coverage 门槛；`eslint web/src` 绿；`public/js` 删除后全绿 | 3 天 / R2 |
| R3-T3.8 | **可观测与韧性**：限流/幂等迁 Redis、CSP/HSTS、outbox dead/连接池告警、PITR 演练 | `src/middleware/*`、`deploy/`、`docs/runbooks/` | 先接 Redis（有 `REDIS_URL`） | 多实例限流有效；告警规则落地；演练报告 | 3 天 / R2 |
| R3-T3.9 | **文档/契约自动化**：route 清单与 `api.ts` 端点比对入 CI，OpenAPI 生成前端类型 | `scripts/`、`src/contracts/`、`web/src/domain/` | 先把本次核对脚本落到 `scripts/` | 死链/漂移 CI 报警；类型自动生成 | 1 天 / T2.1 |

---

## 7. 多智能体开工指令模板

### 7.1 Track-A（数据安全）
```
你是 DreamReel 整改的 Track-A 负责人。工作目录：/Users/link/myApp/DreamReel-wt/db（worktree，分支 fix/db-safety，基线 main 已由 Lead 合并 R0）。
先读：docs/handoff/README.md、docs/handoff/STATE.md、docs/handoff/JOURNAL.md、docs/plans/2026-10-22-remediation-plan.md 的「R1 泳道 A」。
然后执行 scripts/agent/kickoff.sh 自检。
本批任务：R1-T1A.1 → R1-T1A.2 → R1-T1A.3 → R1-T1A.4（按顺序，每个任务独立 commit，任务间跑 gate.sh backend）。
约束：不碰 src/routes、web/、.env、storage/；不跑 db:restore；迁移只增不改；测试必须串行（gate.sh 已加锁）。
完成后：更新 STATE.md 看板与 JOURNAL.md，按 TEMPLATE.md 写交接单，报告 commit sha、命令与证据、未完成项。
```

### 7.2 Track-B（安全）
```
你是 DreamReel 整改的 Track-B 负责人。worktree：/Users/link/myApp/DreamReel-wt/security，分支 fix/security-p0。
先读 handoff 三件套 + 计划「R1 泳道 B」；执行 scripts/agent/kickoff.sh。
本批任务：R1-T1B.1 → B.2 → B.3 → B.4 → B.5（B.6 可选）。
要求：每个任务先写失败测试（REQUIRE_AUTH=true 的测试文件需在 import app 前设置 env），再实现，再 gate.sh backend。
禁止：改 web/、迁 migration、改 .env；禁止用 body/query userId 作为身份来源。
完成后：更新 STATE/JOURNAL，交接单写清 401/403 验证矩阵与手工 curl 结果。
```

### 7.3 Track-C（发布链）
```
你是 DreamReel 整改的 Track-C 负责人。worktree：/Users/link/myApp/DreamReel-wt/release，分支 fix/release-p0。
先读 handoff 三件套 + 计划「R1 泳道 C」；执行 scripts/agent/kickoff.sh。
本批任务：R1-T1C.1 → C.2 → C.3 → C.4（C.4 先向 Lead 报告 D1 决策）→ C.5。
要求：前端改动跑 gate.sh frontend；Docker 相关跑 gate.sh build/smoke；无 Docker 时标记 blocked 并给出替代验证。
完成后：更新 STATE/JOURNAL，交接单附构建/镜像/冒烟命令与输出摘要。
```

### 7.4 Verifier
```
你是 DreamReel 整改的 Verifier。不修改代码。逐条执行 STATE.md 中「待验证」任务的门禁命令（gate.sh full/e2e/build/smoke），把命令、退出码、关键输出、耗时写入 JOURNAL.md 与验证记录；对失败项给出「环境问题 vs 代码问题」初判与证据。测试必须串行；发现并发测试进程立即报告 Lead。
```

---

## 8. 交付与证据规范

每个任务完成必须同时满足：
1. 代码 commit（Conventional Commits，层前缀：`feat(db):`/`fix(security):`/`feat(contracts):` 等）。
2. 测试：新增/修改的测试先失败后通过；`gate.sh` 对应级别退出码 0。
3. 证据：命令 + 退出码 + 关键输出；大输出存 `/tmp/dreamreel-evidence/<日期>/<任务ID>.log`，摘要写进交接单。
4. 文档：涉及行为/配置变更时同步 `docs/`（同 commit 或紧邻 commit）。
5. `STATE.md` 看板更新 + `JOURNAL.md` 追加 + 按 `TEMPLATE.md` 写交接单。
6. 工作区干净（`git status` 仅 ignored）。

**DoD 例外**：`blocked` 任务不要求代码完成，但必须有阻塞原因、已尝试方案、建议下一步与升级对象。

---

## 9. 阶段验收清单

### R1 验收（全部满足才可进 R2）
- [ ] `db:verify:novels` 退出码 0、`mismatches=0`
- [ ] `db:verify:novel-children` 退出码 0
- [ ] `db:status` 显示 013 已应用（或明确记录未应用原因）
- [ ] `rg 'NOVEL_REPO_MODE'` 无输出
- [ ] 生产环境鉴权默认开启；v1 登录 401 回归修复；匿名 `POST /api/api-keys` = 401
- [ ] 封面路径穿越/非法扩展名/非 owner 三条测试绿
- [ ] 管理面 5 个前缀无 token 全 401、viewer 403
- [ ] `rg 'localhost:3000/api' web/src` 无输出
- [ ] `docker compose up -d` 后 `/health/ready` = 200 且 `db:postgres`（或记录环境限制）
- [ ] `gate.sh full` + `gate.sh smoke` 绿
- [ ] STATE/JOURNAL 记录完整

### R2 验收
- [ ] `check:full` 绿（含 E2E）
- [ ] `build`/`build:web` 绿；干净 clone 可按 README 跑起
- [ ] `npm run inventory` 刷新后的清单与实现一致
- [ ] `docs/api/v1.md` 覆盖新增小说端点
- [ ] 交付报告 `docs/delivery/2026-10-XX-r2-cutover.md` 入库
- [ ] tag `r2-cutover`

### R3 验收
- 每组独立：测试绿 + 门禁绿 + 交接单完整 + Lead review 通过。

---

## 10. 回滚手册（速查）

| 场景 | 操作 |
|---|---|
| 某任务代码问题 | `git revert <commit>`（分支内）或丢弃分支；main 上只 revert merge commit |
| 迁移 013 已应用但需回退 | 不能删迁移；用 T0.1 的 `pg_dump` 恢复到独立库验证，再决定 PITR |
| 生产鉴权误开导致 429/401 | 显式 `REQUIRE_AUTH=false` 并重启（临时），同时保留告警；修复后恢复 true |
| 发布镜像回滚 | 回退到上一个镜像 tag；数据库随镜像迁移不回滚（只前滚） |
| PG 数据异常 | 停服务 → `pg_restore` 备份 → `db:restore:novel --novel <id>` → `db:backfill:novel-write` → 校验 |
| 前端产物问题 | 恢复上一个 `public/` commit（若产物入库）或重新 `npm run build`（若方案 A） |

---

## 11. 变更记录

| 日期 | 变更 | 人 |
|---|---|---|
| 2026-10-22 | 创建计划（基于 4 份分析报告 + 当前 HEAD `054ffb5` 复核） | lead |
