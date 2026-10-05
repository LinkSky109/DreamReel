import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'

describe('Recent Projects', () => {
  beforeEach(() => {
    // 清理测试数据
    storageService.data.projects = []
    projectService.projects.clear()
  })

  it('should record project access', async () => {
    const project = await projectService.createProject({
      name: '测试项目',
      userId: 'test-user',
    })

    assert.equal(project.lastAccessedAt, null)

    const accessTime = await projectService.recordAccess(project.id)
    assert.ok(accessTime)

    const updated = await projectService.getProject(project.id)
    assert.ok(updated.lastAccessedAt)
  })

  it('should sort projects by last accessed', async () => {
    const p1 = await projectService.createProject({ name: '项目1', userId: 'test-user' })
    const p2 = await projectService.createProject({ name: '项目2', userId: 'test-user' })

    // 先访问 p2，再访问 p1
    await new Promise((resolve) => setTimeout(resolve, 10))
    await projectService.recordAccess(p2.id)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await projectService.recordAccess(p1.id)

    const result = await projectService.listProjects({
      userId: 'test-user',
      sort: 'lastAccessedAt',
    })

    assert.equal(result.items[0].id, p1.id)
    assert.equal(result.items[1].id, p2.id)
  })

  it('should get recent projects', async () => {
    const p1 = await projectService.createProject({ name: '项目1', userId: 'test-user' })
    const p2 = await projectService.createProject({ name: '项目2', userId: 'test-user' })
    const p3 = await projectService.createProject({ name: '项目3', userId: 'test-user' })

    // 只访问 p1 和 p2
    await projectService.recordAccess(p1.id)
    await projectService.recordAccess(p2.id)

    const recent = await projectService.getRecentProjects('test-user', 5)
    assert.equal(recent.length, 2)
  })

  it('should limit recent projects', async () => {
    for (let i = 0; i < 5; i++) {
      const p = await projectService.createProject({ name: `项目${i}`, userId: 'test-user' })
      await projectService.recordAccess(p.id)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const recent = await projectService.getRecentProjects('test-user', 3)
    assert.equal(recent.length, 3)
  })

  it('should not include archived projects in recent', async () => {
    const p1 = await projectService.createProject({ name: '活跃项目', userId: 'test-user' })
    const p2 = await projectService.createProject({ name: '归档项目', userId: 'test-user' })

    await projectService.recordAccess(p1.id)
    await projectService.recordAccess(p2.id)
    await projectService.toggleArchive(p2.id)

    const recent = await projectService.getRecentProjects('test-user', 5)
    assert.equal(recent.length, 1)
    assert.equal(recent[0].name, '活跃项目')
  })
})
