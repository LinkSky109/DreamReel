import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Project } from '../src/models/project.js'
import { projectService } from '../src/services/projectService.js'

// 清理测试数据
function cleanupTestProjects() {
  const testIds = []
  for (const [id, project] of projectService.projects.entries()) {
    if (project.name && project.name.startsWith('[归档测试]')) {
      testIds.push(id)
    }
  }
  for (const id of testIds) {
    projectService.projects.delete(id)
  }
}

test('Project 模型 - isArchived 默认为 false', () => {
  const project = new Project({ name: '测试' })
  assert.equal(project.isArchived, false)
})

test('Project 模型 - 构造函数接受 isArchived', () => {
  const project = new Project({ name: '测试', isArchived: true })
  assert.equal(project.isArchived, true)
})

test('Project 模型 - toggleArchive 切换状态', () => {
  const project = new Project({ name: '测试' })
  assert.equal(project.isArchived, false)

  const result1 = project.toggleArchive()
  assert.equal(result1, true)
  assert.equal(project.isArchived, true)

  const result2 = project.toggleArchive()
  assert.equal(result2, false)
  assert.equal(project.isArchived, false)
})

test('Project 模型 - toJSON 包含 isArchived', () => {
  const project = new Project({ name: '测试', isArchived: true })
  const json = project.toJSON()
  assert.ok('isArchived' in json)
  assert.equal(json.isArchived, true)
})

test('projectService - listProjects 默认排除归档项目', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[归档测试] 活跃项目', userId: 'test-arch-user' })
  await projectService.createProject({ name: '[归档测试] 归档项目', isArchived: true, userId: 'test-arch-user' })

  const result = await projectService.listProjects({ userId: 'test-arch-user' })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].name, '[归档测试] 活跃项目')

  cleanupTestProjects()
})

test('projectService - listProjects archived=true 仅返回归档项目', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[归档测试] 活跃项目', userId: 'test-arch-user' })
  await projectService.createProject({ name: '[归档测试] 归档项目', isArchived: true, userId: 'test-arch-user' })

  const result = await projectService.listProjects({ userId: 'test-arch-user', archived: true })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].name, '[归档测试] 归档项目')

  cleanupTestProjects()
})

test('projectService - listProjects archived=all 返回全部项目', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[归档测试] 活跃项目', userId: 'test-arch-user' })
  await projectService.createProject({ name: '[归档测试] 归档项目', isArchived: true, userId: 'test-arch-user' })

  const result = await projectService.listProjects({ userId: 'test-arch-user', archived: 'all' })
  assert.equal(result.items.length, 2)

  cleanupTestProjects()
})

test('projectService - toggleArchive 切换归档状态', async () => {
  cleanupTestProjects()
  const project = await projectService.createProject({
    name: '[归档测试] 切换测试',
    userId: 'test-arch-user',
  })
  assert.equal(project.isArchived, false)

  const result1 = await projectService.toggleArchive(project.id)
  assert.equal(result1.isArchived, true)

  const updated1 = await projectService.getProject(project.id)
  assert.equal(updated1.isArchived, true)

  const result2 = await projectService.toggleArchive(project.id)
  assert.equal(result2.isArchived, false)

  const updated2 = await projectService.getProject(project.id)
  assert.equal(updated2.isArchived, false)

  cleanupTestProjects()
})
