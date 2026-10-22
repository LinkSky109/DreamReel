import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadNovelSource } from '../scripts/migrate-novels-to-pg.js'

/**
 * `db:verify:novels` 在 PG 单源后必须仍能校验：
 * db.json 不再写回小说集合，来源应回退到 storage/archive/novels-from-db-*.json。
 * 这里对可注入的来源加载器做纯函数级验证（不连数据库）。
 */
describe('db:verify:novels 来源加载', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamreel-novel-source-'))
  const dbFile = path.join(dir, 'db.json')
  const archiveFile = path.join(dir, 'novels-from-db-1.json')

  after(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('db.json 有小说集合时直接使用，不读取归档', () => {
    fs.writeFileSync(dbFile, JSON.stringify({ novelProjects: { n1: { id: 'n1', title: '库内小说' } } }))
    let archiveReads = 0
    const result = loadNovelSource({
      dbFile,
      findLatest: () => {
        archiveReads += 1
        return archiveFile
      },
      loadArchive: () => {
        archiveReads += 1
        return { collections: {} }
      },
    })
    assert.equal(result.novels.length, 1)
    assert.equal(result.novels[0].id, 'n1')
    assert.equal(result.source, dbFile)
    assert.equal(archiveReads, 0)
  })

  it('db.json novelProjects 为空时回退到最新归档', () => {
    fs.writeFileSync(dbFile, JSON.stringify({ novelProjects: {} }))
    fs.writeFileSync(
      archiveFile,
      JSON.stringify({ collections: { novelProjects: { n2: { id: 'n2', title: '归档小说' } } } })
    )
    const result = loadNovelSource({ dbFile, findLatest: () => archiveFile })
    assert.equal(result.novels.length, 1)
    assert.equal(result.novels[0].id, 'n2')
    assert.equal(result.source, archiveFile)
  })

  it('db.json 缺失且归档存在时仍可使用归档', () => {
    fs.rmSync(dbFile, { force: true })
    const result = loadNovelSource({ dbFile, findLatest: () => archiveFile })
    assert.equal(result.novels.length, 1)
    assert.equal(result.source, archiveFile)
  })

  it('db.json 与归档都没有小说时抛出明确错误', () => {
    fs.writeFileSync(dbFile, JSON.stringify({ novelProjects: {} }))
    fs.writeFileSync(archiveFile, JSON.stringify({ collections: { novelProjects: {} } }))
    assert.throws(() => loadNovelSource({ dbFile }), /没有小说|无小说/)
  })

  it('找不到归档文件时抛出明确错误', () => {
    fs.writeFileSync(dbFile, JSON.stringify({ novelProjects: {} }))
    assert.throws(() => loadNovelSource({ dbFile, findLatest: () => null }), /找不到归档|无小说/)
  })
})
