import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'

describe('Custom Cover', () => {
  beforeEach(() => {
    // 清理测试数据
    storageService.data.projects = []
    projectService.projects.clear()
  })

  it('should update project coverUrl', async () => {
    const project = await projectService.createProject({
      name: '测试项目',
      userId: 'test-user',
    })

    assert.equal(project.coverUrl, '')

    const updated = await projectService.updateProject(project.id, {
      coverUrl: '/storage/thumbnails/cover_test.jpg',
    })

    assert.equal(updated.coverUrl, '/storage/thumbnails/cover_test.jpg')
  })

  it('should persist coverUrl after update', async () => {
    const project = await projectService.createProject({
      name: '测试项目',
      userId: 'test-user',
    })

    await projectService.updateProject(project.id, {
      coverUrl: '/storage/thumbnails/cover_test.jpg',
    })

    // 重新获取
    const fetched = await projectService.getProject(project.id)
    assert.equal(fetched.coverUrl, '/storage/thumbnails/cover_test.jpg')
  })

  it('should include coverUrl in toJSON', async () => {
    const project = await projectService.createProject({
      name: '测试项目',
      userId: 'test-user',
    })

    await projectService.updateProject(project.id, {
      coverUrl: '/storage/thumbnails/cover_test.jpg',
    })

    const json = project.toJSON()
    assert.equal(json.coverUrl, '/storage/thumbnails/cover_test.jpg')
  })

  it('should clear coverUrl when set to empty string', async () => {
    const project = await projectService.createProject({
      name: '测试项目',
      coverUrl: '/storage/thumbnails/cover_test.jpg',
      userId: 'test-user',
    })

    const updated = await projectService.updateProject(project.id, { coverUrl: '' })
    assert.equal(updated.coverUrl, '')
  })
})
