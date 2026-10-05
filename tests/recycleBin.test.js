import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

describe('RecycleBin', () => {
  let testProjectId

  beforeEach(async () => {
    projectService.recycleBin.clear()
    // 创建测试项目
    const project = await projectService.createProject({
      name: '回收站测试项目',
      description: '用于测试回收站功能',
      userId: 'test-user',
    })
    testProjectId = project.id
  })

  after(async () => {
    projectService.recycleBin.clear()
    // 清理可能残留的项目
    try {
      await projectService.deleteProject(testProjectId)
    } catch (e) {}
  })

  it('should move project to recycle bin on delete', async () => {
    await projectService.deleteProject(testProjectId)

    // 项目不应在活跃列表中
    await assert.rejects(
      () => projectService.getProject(testProjectId),
      /Project not found/
    )

    // 项目应在回收站中
    const recycleBin = projectService.listRecycleBin()
    assert.equal(recycleBin.total, 1)
    assert.equal(recycleBin.items[0].id, testProjectId)
    assert.ok(recycleBin.items[0].deletedAt)
  })

  it('should record deletedBy', async () => {
    await projectService.deleteProject(testProjectId, { deletedBy: 'user-123' })
    const recycleBin = projectService.listRecycleBin()
    assert.equal(recycleBin.items[0].deletedBy, 'user-123')
  })

  it('should restore project from recycle bin', async () => {
    await projectService.deleteProject(testProjectId)

    const result = projectService.restoreProject(testProjectId)
    assert.equal(result.success, true)
    assert.ok(result.project)
    assert.equal(result.project.id, testProjectId)

    // 项目应回到活跃列表
    const project = await projectService.getProject(testProjectId)
    assert.ok(project)
    assert.equal(project.id, testProjectId)

    // 回收站应为空
    const recycleBin = projectService.listRecycleBin()
    assert.equal(recycleBin.total, 0)
  })

  it('should throw when restoring non-existent project', () => {
    assert.throws(
      () => projectService.restoreProject('non-existent-id'),
      /项目不在回收站中/
    )
  })

  it('should permanently delete project from recycle bin', async () => {
    await projectService.deleteProject(testProjectId)

    const result = projectService.permanentlyDeleteProject(testProjectId)
    assert.equal(result.success, true)

    // 项目不应在回收站中
    const recycleBin = projectService.listRecycleBin()
    assert.equal(recycleBin.total, 0)

    // 项目不应在活跃列表中
    await assert.rejects(
      () => projectService.getProject(testProjectId),
      /Project not found/
    )
  })

  it('should throw when permanently deleting non-existent project', () => {
    assert.throws(
      () => projectService.permanentlyDeleteProject('non-existent-id'),
      /项目不在回收站中/
    )
  })

  it('should empty recycle bin', async () => {
    // 创建多个项目并删除
    const p1 = await projectService.createProject({ name: '项目1', userId: 'test-user' })
    const p2 = await projectService.createProject({ name: '项目2', userId: 'test-user' })
    await projectService.deleteProject(p1.id)
    await projectService.deleteProject(p2.id)

    assert.equal(projectService.listRecycleBin().total, 2)

    const result = projectService.emptyRecycleBin()
    assert.equal(result.success, true)
    assert.equal(result.deletedCount, 2)
    assert.equal(projectService.listRecycleBin().total, 0)
  })

  it('should filter recycle bin by user', async () => {
    const p1 = await projectService.createProject({ name: '用户A项目', userId: 'user-a' })
    const p2 = await projectService.createProject({ name: '用户B项目', userId: 'user-b' })
    await projectService.deleteProject(p1.id)
    await projectService.deleteProject(p2.id)

    const userABin = projectService.listRecycleBin({ userId: 'user-a' })
    assert.equal(userABin.total, 1)
    assert.equal(userABin.items[0].name, '用户A项目')

    const userBBin = projectService.listRecycleBin({ userId: 'user-b' })
    assert.equal(userBBin.total, 1)
    assert.equal(userBBin.items[0].name, '用户B项目')
  })

  it('should get recycle bin stats', async () => {
    await projectService.deleteProject(testProjectId)

    const stats = projectService.getRecycleBinStats()
    assert.equal(stats.total, 1)
    assert.ok(stats.oldestDeletedAt)
    assert.ok(stats.newestDeletedAt)
  })

  it('should get empty recycle bin stats', () => {
    const stats = projectService.getRecycleBinStats()
    assert.equal(stats.total, 0)
    assert.equal(stats.oldestDeletedAt, null)
    assert.equal(stats.newestDeletedAt, null)
  })

  it('should sort recycle bin by deletedAt descending', async () => {
    const p1 = await projectService.createProject({ name: '旧项目', userId: 'test-user' })
    const p2 = await projectService.createProject({ name: '新项目', userId: 'test-user' })
    await projectService.deleteProject(p1.id)
    await new Promise((r) => setTimeout(r, 10))
    await projectService.deleteProject(p2.id)

    const recycleBin = projectService.listRecycleBin()
    assert.equal(recycleBin.items[0].name, '新项目')
    assert.equal(recycleBin.items[1].name, '旧项目')
  })

  it('should update updatedAt when restoring project', async () => {
    const project = await projectService.getProject(testProjectId)
    const originalUpdatedAt = project.updatedAt

    await new Promise((r) => setTimeout(r, 10))
    await projectService.deleteProject(testProjectId)
    const result = projectService.restoreProject(testProjectId)

    assert.ok(new Date(result.project.updatedAt) > new Date(originalUpdatedAt))
  })

  it('should throw when deleting already deleted project', async () => {
    await projectService.deleteProject(testProjectId)
    await assert.rejects(
      () => projectService.deleteProject(testProjectId),
      /Project not found/
    )
  })
})
