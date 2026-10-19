#!/usr/bin/env node
/**
 * 清理网盘同步测试在开发库留下的「夸克*」小说项目。
 *
 * 背景：早期同步测试直接写入了 storage/data/db.json，只清理了目录、没清理项目，
 * 导致制作台出现「夸克首次 / 增量 / 分片 / 覆盖 / 跳过 / 预习 / 无cookie / 鉴权」等空项目。
 *
 * 用法：
 *   node scripts/cleanup-novel-test-data.js --dry-run   # 只列出，不删除
 *   node scripts/cleanup-novel-test-data.js             # 删除（默认仅删无目录的测试项目）
 *   node scripts/cleanup-novel-test-data.js --force     # 即使有目录也删（谨慎）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { storageService } from '../src/services/storageService.js'
import { deleteNovelProject, novelDir } from '../src/services/novelProjectService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const TEST_TITLE = /^夸克(首次|增量|分片|覆盖|跳过|预习|无cookie|鉴权)$/

const targets = storageService
  .listNovelProjects()
  .filter((p) => TEST_TITLE.test(String(p.title || '').trim()))
  .filter((p) => force || !fs.existsSync(novelDir(p.id)))

console.log(`匹配测试项目：${targets.length} 个${dryRun ? '（dry-run）' : ''}`)
for (const p of targets) {
  console.log(`- ${p.id}  ${p.title}  dir=${fs.existsSync(novelDir(p.id)) ? 'exists' : 'missing'}`)
}

if (!targets.length) process.exit(0)
if (dryRun) process.exit(0)

// 备份开发库，删除失败可回滚
const dbPath = path.join(repoRoot, 'storage', 'data', 'db.json')
if (fs.existsSync(dbPath)) {
  const backup = path.join(repoRoot, 'storage', 'data', `db.backup-${Date.now()}.json`)
  fs.copyFileSync(dbPath, backup)
  console.log(`已备份：${backup}`)
}

for (const p of targets) {
  const r = deleteNovelProject(p.id)
  console.log(`已删除 ${p.id} ${p.title}（目录 ${r.removedDirs.length} 个，记录 ${JSON.stringify(r.removedRecords)}）`)
}

console.log('完成。')
