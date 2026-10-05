import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import request from 'supertest'
import app from '../src/server.js'
import config from '../src/config/index.js'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'

describe('项目删除清理路径 containment', () => {
  const sentinelName = `cleanup-sentinel-${Date.now()}.txt`
  const sentinelPath = path.resolve(config.storage.path, '..', sentinelName)
  let projectId

  before(async () => {
    fs.writeFileSync(sentinelPath, 'must-not-be-deleted', 'utf-8')
    const project = await projectService.createProject({ name: '清理穿越测试', userId: 'default' })
    projectId = project.id
    await projectService.updateProject(projectId, {
      shots: [{
        id: 'traversal-shot',
        index: 0,
        description: 'traversal',
        duration: 1,
        status: 'completed',
        videoUrl: `/storage/../${sentinelName}`,
      }],
    })
  })

  after(async () => {
    try {
      await projectService.deleteProject(projectId)
    } catch { /* ignore */ }
    if (fs.existsSync(sentinelPath)) fs.unlinkSync(sentinelPath)
    storageService._flush()
  })

  it('DELETE /api/projects/:id 不会删除 storage 外的文件', async () => {
    const res = await request(app).delete(`/api/projects/${projectId}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.deletedFiles, 0)
    assert.equal(fs.existsSync(sentinelPath), true)
  })
})
