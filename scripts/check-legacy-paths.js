#!/usr/bin/env node
/**
 * 小说域 legacy 路径门禁。
 *
 * 扫描生产代码 `src/**` 与 `scripts/**`，禁止重新引入已下线的 JSON / legacy 开关、
 * 内存水合、写镜像与 storageService 小说集合读写。测试与服务端文档不在扫描范围。
 *
 * 离线恢复/回填工具（只读归档 JSON 或从 JSON 重建 PG）单独 allowlist，见 LEGACY_ALLOWLIST。
 *
 * 用法：
 *   node scripts/check-legacy-paths.js
 *   npm run check:legacy
 *
 * 退出码：
 *   0 = 无违规
 *   1 = 存在违规（在 legacy 移除实现合并前，当前分支预期失败）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SCAN_DIRS = ['src', 'scripts']
const SELF_PATH = 'scripts/check-legacy-paths.js'

const RULES = [
  {
    id: 'novel-write-mode',
    pattern: /\bNOVEL_WRITE_MODE\b/,
    description: '小说写模式开关必须移除，写路径固定 PostgreSQL',
  },
  {
    id: 'novel-repo-mode',
    pattern: /\bNOVEL_REPO_MODE\b/,
    description: '小说读模式开关必须移除，读路径固定 PostgreSQL',
  },
  {
    id: 'pg-mode-branch',
    pattern: /\bisPg(?:Write|Read)Mode\b/,
    description: 'isPgWriteMode/isPgReadMode 运行时分支必须移除',
  },
  {
    id: 'pg-hydrate',
    pattern: /\bhydrateNovelsFromPg\b/,
    description: '启动从 PG 水合小说内存投影的逻辑必须移除',
  },
  {
    id: 'novel-json-archive-runtime',
    pattern: /\bnovelJsonArchive\b/,
    description: 'novelJsonArchive 运行时依赖必须移除，归档读取只允许离线工具',
  },
  {
    id: 'novel-write-sync-factory',
    pattern: /\b(?:createNovelWriteSync|createNovelChildWriteSync)\b/,
    description: 'outbox/dual 写镜像工厂必须移除，仅保留离线 apply* 函数',
  },
  {
    id: 'novel-mirror',
    pattern: /\b(?:novelMirror|novelChildMirror)\b/,
    description: '小说写镜像运行时必须移除',
  },
  {
    id: 'storage-service-novel-read',
    pattern:
      /\bstorageService\.(?:getNovelProject|listNovelProjects|listNovelChunks|getNovelChunk|listNovelCharacters|getNovelCharacter|listNovelCharacterStates|getNovelCharacterState|listNovelAssetImages|getNovelAssetImage|listSeasons|getSeason|listEpisodes|getEpisode|listWorldEntities|getWorldEntity|getCharacterSet|getWorldSet)\b/,
    description: 'storageService 同步小说集合读必须改为 PG 仓储/异步服务',
  },
  {
    id: 'storage-service-novel-collection',
    pattern:
      /\bstorageService\.data\.(?:novelProjects|novelChunks|novelCharacters|novelCharacterStates|seriesSeasons|seriesEpisodes|novelWorldEntities|novelAssetImages|characterSets|worldSets)\b/,
    description: 'storageService.data 小说集合读写必须移除',
  },
]

/**
 * allowlist 仅覆盖离线恢复/回填工具：
 * - 这些工具只读归档 JSON 或从旧 JSON 重建 PostgreSQL；
 * - 不得出现在请求路径、启动路径或测试编排中；
 * - 新增同类工具必须在此登记并说明原因。
 */
const LEGACY_ALLOWLIST = [
  {
    file: 'scripts/restore-novel-from-json.js',
    rules: [
      'novel-write-mode',
      'novel-json-archive-runtime',
      'storage-service-novel-read',
      'storage-service-novel-collection',
    ],
    reason: '离线灾难恢复：从归档 JSON 重建 PG，进程内设置环境变量后调用 apply*',
  },
  {
    file: 'scripts/backfill-novel-write-model.js',
    rules: ['novel-json-archive-runtime', 'storage-service-novel-read'],
    reason: '离线回填：读取旧 JSON/归档并写入 PG 新列',
  },
  {
    file: 'scripts/migrate-novel-children-to-pg.js',
    rules: ['novel-json-archive-runtime'],
    reason: '离线一次性迁移：读取归档 JSON 写入 PG 子集合',
  },
  {
    file: 'scripts/archive-novel-json.js',
    rules: [
      'novel-json-archive-runtime',
      'storage-service-novel-read',
      'storage-service-novel-collection',
    ],
    reason: '离线归档工具：只读旧 db.json 小说集合并写出归档副本',
  },
]

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]))
const ALLOWLIST_BY_FILE = new Map()
for (const entry of LEGACY_ALLOWLIST) {
  const ids = new Set(entry.rules)
  for (const id of ids) {
    if (!RULE_BY_ID.has(id)) {
      console.error(`[check:legacy] allowlist 引用了未知规则：${id} (${entry.file})`)
      process.exit(2)
    }
  }
  ALLOWLIST_BY_FILE.set(entry.file, { ...entry, ruleIds: ids })
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(?:js|mjs|cjs|ts|tsx)$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function isAllowed(relPath, ruleId) {
  const entry = ALLOWLIST_BY_FILE.get(relPath)
  return Boolean(entry && entry.ruleIds.has(ruleId))
}

const files = []
for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir)
  if (fs.existsSync(full)) walk(full, files)
}

const violations = []
let scanned = 0

for (const file of files.sort()) {
  const relPath = toPosix(path.relative(ROOT, file))
  if (relPath === SELF_PATH) continue
  scanned += 1
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')

  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue
      if (isAllowed(relPath, rule.id)) continue
      violations.push({
        rule: rule.id,
        description: rule.description,
        file: relPath,
        line: index + 1,
        text: line.trim(),
      })
    }
  }
}

console.log('小说域 legacy 路径门禁')
console.log(`  扫描目录：${SCAN_DIRS.map((dir) => `${dir}/**`).join(', ')}`)
console.log(`  扫描文件：${scanned}`)
console.log(`  规则数量：${RULES.length}`)
console.log(`  离线工具 allowlist：${LEGACY_ALLOWLIST.map((entry) => entry.file).join(', ')}`)
console.log('')

if (!violations.length) {
  console.log('PASS：未发现 legacy 路径。')
  process.exit(0)
}

const byRule = new Map()
for (const violation of violations) {
  if (!byRule.has(violation.rule)) byRule.set(violation.rule, [])
  byRule.get(violation.rule).push(violation)
}

console.error(`FAIL：发现 ${violations.length} 处 legacy 路径引用（${byRule.size} 类规则）。`)
for (const [ruleId, items] of [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const rule = RULE_BY_ID.get(ruleId)
  console.error('')
  console.error(`[${ruleId}] ${rule.description}`)
  for (const item of items) {
    console.error(`  - ${item.file}:${item.line}  ${item.text}`)
  }
}

console.error('')
console.error('说明：legacy 移除实现合并前，本门禁预期失败；')
console.error('      请在 docs/plans/2026-10-22-novel-legacy-removal.md 的 Phase 1-5 完成后将违规数降为 0。')
process.exit(1)
