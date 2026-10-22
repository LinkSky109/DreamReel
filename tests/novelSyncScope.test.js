import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import config from '../src/config/index.js'
import { createNovelProject, deleteNovelProject, novelDir } from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import { buildManifest, resolveScope, SYNC_SCOPES } from '../src/services/novelSyncService.js'
import './helpers/pg-teardown.js'

const SAMPLE = `第1章 起点
张三走在路上。
`

describe('同步范围（产物 + 文档 / 仅产物 / 全部）', () => {
  let project
  before(async () => {
    project = await createNovelProject({ title: '范围测试' })
    await ingestNovel(project.id, { sourceType: 'text', text: SAMPLE })

    // 文档：角色卡 / 世界观
    fs.mkdirSync(path.join(novelDir(project.id), 'characters'), { recursive: true })
    fs.writeFileSync(path.join(novelDir(project.id), 'characters', 'characters.json'), '[]')
    fs.mkdirSync(path.join(novelDir(project.id), 'worldbuilding'), { recursive: true })
    fs.writeFileSync(path.join(novelDir(project.id), 'worldbuilding', 'world.json'), '{}')

    // 产物：图片 / 音视频 / 成片
    for (const [dir, name] of [
      [path.join(config.storage.path, 'images', 'novels', project.id), 'a.png'],
      [path.join(config.storage.path, 'videos', 'novels', project.id), 'b.mp4'],
      [path.join(config.storage.path, 'audio', 'voices', 'novels', project.id), 'c.mp3'],
      [path.join(config.storage.path, 'exports', 'novels', project.id), 'd.mp4'],
    ]) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, name), 'x')
    }
  })

  after(async () => {
    if (!project) return
    // PG 软删除 + 目录清理（deleteNovelProject 覆盖 novels/images/videos/audio/exports）。
    await deleteNovelProject(project.id)
    fs.rmSync(novelDir(project.id), { recursive: true, force: true })
    for (const dir of ['images', 'videos', 'audio/voices', 'exports']) {
      fs.rmSync(path.join(config.storage.path, dir, 'novels', project.id), { recursive: true, force: true })
    }
  })

  const tops = (files) => [...new Set(files.map((f) => f.rel.split(path.sep)[0]))].sort()

  it('deliverables（默认）：产物 + 文档，排除 source/chunks/episodes', () => {
    const files = buildManifest(project.id)
    assert.deepEqual(tops(files), ['audio', 'characters', 'exports', 'images', 'videos', 'worldbuilding'])
    assert.ok(!files.some((f) => /^(source|chunks|episodes)\//.test(f.rel)))
  })

  it('media：只要产物目录', () => {
    const files = buildManifest(project.id, { scope: 'media' })
    assert.deepEqual(tops(files), ['audio', 'exports', 'images', 'videos'])
  })

  it('all：包含内部工作数据（source/chunks）', () => {
    const files = buildManifest(project.id, { scope: 'all' })
    const t = tops(files)
    assert.ok(t.includes('source'))
    assert.ok(t.includes('chunks'))
  })

  it('未知 scope 抛错（不静默回退）', () => {
    assert.throws(() => resolveScope('nope'), /unknown sync scope/)
  })

  it('预设目录清单稳定（供 UI/文档引用）', () => {
    assert.deepEqual(SYNC_SCOPES.deliverables.dirs, [
      'exports', 'images', 'videos', 'audio', 'characters', 'worldbuilding', 'art', 'assets', 'handoff',
    ])
    assert.equal(SYNC_SCOPES.all.dirs, null)
  })
})
