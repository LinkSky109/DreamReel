import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Project } from '../src/models/project.js'
import { projectService } from '../src/services/projectService.js'

// 清理测试数据
function cleanupTestProjects() {
  const testIds = []
  for (const [id, project] of projectService.projects.entries()) {
    if (project.name && project.name.startsWith('[收藏测试]')) {
      testIds.push(id)
    }
  }
  for (const id of testIds) {
    projectService.projects.delete(id)
  }
}

test('Project 模型 - isFavorite 默认为 false', () => {
  const project = new Project({ name: '测试' })
  assert.equal(project.isFavorite, false)
})

test('Project 模型 - 构造函数接受 isFavorite', () => {
  const project = new Project({ name: '测试', isFavorite: true })
  assert.equal(project.isFavorite, true)
})

test('Project 模型 - toggleFavorite 切换状态', () => {
  const project = new Project({ name: '测试' })
  assert.equal(project.isFavorite, false)

  const result1 = project.toggleFavorite()
  assert.equal(result1, true)
  assert.equal(project.isFavorite, true)

  const result2 = project.toggleFavorite()
  assert.equal(result2, false)
  assert.equal(project.isFavorite, false)
})

test('Project 模型 - toJSON 包含 isFavorite', () => {
  const project = new Project({ name: '测试', isFavorite: true })
  const json = project.toJSON()
  assert.ok('isFavorite' in json)
  assert.equal(json.isFavorite, true)
})

test('projectService - createProject 支持 isFavorite', async () => {
  cleanupTestProjects()
  const project = await projectService.createProject({
    name: '[收藏测试] 收藏项目',
    isFavorite: true,
    userId: 'test-fav-user',
  })
  assert.equal(project.isFavorite, true)
  cleanupTestProjects()
})

test('projectService - toggleFavorite 切换收藏状态', async () => {
  cleanupTestProjects()
  const project = await projectService.createProject({
    name: '[收藏测试] 切换测试',
    userId: 'test-fav-user',
  })
  assert.equal(project.isFavorite, false)

  const result1 = await projectService.toggleFavorite(project.id)
  assert.equal(result1.isFavorite, true)

  const updated1 = await projectService.getProject(project.id)
  assert.equal(updated1.isFavorite, true)

  const result2 = await projectService.toggleFavorite(project.id)
  assert.equal(result2.isFavorite, false)

  const updated2 = await projectService.getProject(project.id)
  assert.equal(updated2.isFavorite, false)

  cleanupTestProjects()
})

test('projectService - listProjects 按收藏筛选', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[收藏测试] 收藏A', isFavorite: true, userId: 'test-fav-user' })
  await projectService.createProject({ name: '[收藏测试] 收藏B', isFavorite: true, userId: 'test-fav-user' })
  await projectService.createProject({ name: '[收藏测试] 普通项目', isFavorite: false, userId: 'test-fav-user' })

  const result = await projectService.listProjects({ userId: 'test-fav-user', favorite: true })
  assert.equal(result.items.length, 2)
  assert.ok(result.items.every((p) => p.isFavorite === true))

  cleanupTestProjects()
})

test('projectService - listProjects 收藏筛选与其他筛选组合', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[收藏测试] 科幻收藏', isFavorite: true, style: 'nolan', userId: 'test-fav-user' })
  await projectService.createProject({ name: '[收藏测试] 普通科幻', isFavorite: false, style: 'nolan', userId: 'test-fav-user' })

  const result = await projectService.listProjects({ userId: 'test-fav-user', favorite: true, style: 'nolan' })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].name, '[收藏测试] 科幻收藏')

  cleanupTestProjects()
})
