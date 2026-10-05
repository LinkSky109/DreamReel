import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

// 清理测试数据
function cleanupTestProjects() {
  const testIds = []
  for (const [id, project] of projectService.projects.entries()) {
    if (project.name && project.name.startsWith('[批量测试]')) {
      testIds.push(id)
    }
  }
  for (const id of testIds) {
    projectService.projects.delete(id)
  }
}

test('projectService - batchDelete 批量删除', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 项目1', userId: 'test-batch-user' })
  const p2 = await projectService.createProject({ name: '[批量测试] 项目2', userId: 'test-batch-user' })
  const p3 = await projectService.createProject({ name: '[批量测试] 项目3', userId: 'test-batch-user' })

  const result = await projectService.batchDelete([p1.id, p2.id], 'test-batch-user')

  assert.equal(result.success.length, 2)
  assert.equal(result.failed.length, 0)
  assert.ok(result.success.includes(p1.id))
  assert.ok(result.success.includes(p2.id))

  // 验证 p3 还在
  const remaining = await projectService.getProject(p3.id)
  assert.equal(remaining.name, '[批量测试] 项目3')

  cleanupTestProjects()
})

test('projectService - batchDelete 不存在的项目', async () => {
  cleanupTestProjects()
  const result = await projectService.batchDelete(['non-existent-id'], 'test-batch-user')
  assert.equal(result.success.length, 0)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].error, '项目不存在')
})

test('projectService - batchArchive 批量归档', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 归档1', userId: 'test-batch-user' })
  const p2 = await projectService.createProject({ name: '[批量测试] 归档2', userId: 'test-batch-user' })

  const result = await projectService.batchArchive([p1.id, p2.id], true, 'test-batch-user')

  assert.equal(result.success.length, 2)
  assert.equal(result.failed.length, 0)

  const updated1 = await projectService.getProject(p1.id)
  const updated2 = await projectService.getProject(p2.id)
  assert.equal(updated1.isArchived, true)
  assert.equal(updated2.isArchived, true)

  cleanupTestProjects()
})

test('projectService - batchArchive 批量取消归档', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 取消归档', isArchived: true, userId: 'test-batch-user' })

  const result = await projectService.batchArchive([p1.id], false, 'test-batch-user')

  assert.equal(result.success.length, 1)
  const updated = await projectService.getProject(p1.id)
  assert.equal(updated.isArchived, false)

  cleanupTestProjects()
})

test('projectService - batchFavorite 批量收藏', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 收藏1', userId: 'test-batch-user' })
  const p2 = await projectService.createProject({ name: '[批量测试] 收藏2', userId: 'test-batch-user' })

  const result = await projectService.batchFavorite([p1.id, p2.id], true, 'test-batch-user')

  assert.equal(result.success.length, 2)
  const updated1 = await projectService.getProject(p1.id)
  const updated2 = await projectService.getProject(p2.id)
  assert.equal(updated1.isFavorite, true)
  assert.equal(updated2.isFavorite, true)

  cleanupTestProjects()
})

test('projectService - batchFavorite 批量取消收藏', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 取消收藏', isFavorite: true, userId: 'test-batch-user' })

  const result = await projectService.batchFavorite([p1.id], false, 'test-batch-user')

  assert.equal(result.success.length, 1)
  const updated = await projectService.getProject(p1.id)
  assert.equal(updated.isFavorite, false)

  cleanupTestProjects()
})

test('projectService - batchDelete 权限校验', async () => {
  cleanupTestProjects()
  const p1 = await projectService.createProject({ name: '[批量测试] 权限项目', userId: 'user-a' })

  // user-b 尝试删除 user-a 的项目
  const result = await projectService.batchDelete([p1.id], 'user-b')

  assert.equal(result.success.length, 0)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].error, '无权限')

  cleanupTestProjects()
})
