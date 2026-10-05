import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Project } from '../src/models/project.js'
import { projectService } from '../src/services/projectService.js'

// 清理测试数据
function cleanupTestProjects() {
  const testIds = []
  for (const [id, project] of projectService.projects.entries()) {
    if (project.name && project.name.startsWith('[标签测试]')) {
      testIds.push(id)
    }
  }
  for (const id of testIds) {
    projectService.projects.delete(id)
  }
}

test('Project 模型 - tags 字段默认为空数组', () => {
  const project = new Project({ name: '测试' })
  assert.deepEqual(project.tags, [])
})

test('Project 模型 - 构造函数接受 tags 参数', () => {
  const project = new Project({ name: '测试', tags: ['科幻', '短片'] })
  assert.deepEqual(project.tags, ['科幻', '短片'])
})

test('Project 模型 - addTag 添加标签', () => {
  const project = new Project({ name: '测试' })
  project.addTag('科幻')
  assert.deepEqual(project.tags, ['科幻'])
})

test('Project 模型 - addTag 自动转小写', () => {
  const project = new Project({ name: '测试' })
  project.addTag('Sci-Fi')
  assert.deepEqual(project.tags, ['sci-fi'])
})

test('Project 模型 - addTag 去重', () => {
  const project = new Project({ name: '测试' })
  project.addTag('科幻')
  project.addTag('科幻')
  assert.equal(project.tags.length, 1)
})

test('Project 模型 - removeTag 移除标签', () => {
  const project = new Project({ name: '测试', tags: ['科幻', '短片'] })
  project.removeTag('科幻')
  assert.deepEqual(project.tags, ['短片'])
})

test('Project 模型 - hasTag 检查标签', () => {
  const project = new Project({ name: '测试', tags: ['科幻', '短片'] })
  assert.equal(project.hasTag('科幻'), true)
  assert.equal(project.hasTag('不存在'), false)
})

test('Project 模型 - toJSON 包含 tags', () => {
  const project = new Project({ name: '测试', tags: ['科幻'] })
  const json = project.toJSON()
  assert.ok('tags' in json)
  assert.deepEqual(json.tags, ['科幻'])
})

test('projectService - createProject 支持 tags', async () => {
  cleanupTestProjects()
  const project = await projectService.createProject({
    name: '[标签测试] 带标签项目',
    tags: ['科幻', '实验'],
    userId: 'test-tag-user',
  })
  assert.deepEqual(project.tags, ['科幻', '实验'])
  cleanupTestProjects()
})

test('projectService - listProjects 按标签筛选', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[标签测试] 科幻项目', tags: ['科幻'], userId: 'test-tag-user' })
  await projectService.createProject({ name: '[标签测试] 纪录片项目', tags: ['纪录片'], userId: 'test-tag-user' })
  await projectService.createProject({ name: '[标签测试] 无标签项目', userId: 'test-tag-user' })

  const result = await projectService.listProjects({ userId: 'test-tag-user', tag: '科幻' })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].name, '[标签测试] 科幻项目')
  cleanupTestProjects()
})

test('projectService - getAllTags 返回所有标签', async () => {
  cleanupTestProjects()
  await projectService.createProject({ name: '[标签测试] 项目A', tags: ['科幻', '短片'], userId: 'test-tag-user' })
  await projectService.createProject({ name: '[标签测试] 项目B', tags: ['纪录片', '短片'], userId: 'test-tag-user' })

  const tags = projectService.getAllTags('test-tag-user')
  assert.ok(tags.includes('科幻'))
  assert.ok(tags.includes('短片'))
  assert.ok(tags.includes('纪录片'))
  assert.equal(tags.length, 3) // 去重后
  cleanupTestProjects()
})

test('projectService - updateProject 更新 tags', async () => {
  cleanupTestProjects()
  const project = await projectService.createProject({
    name: '[标签测试] 更新标签',
    tags: ['旧标签'],
    userId: 'test-tag-user',
  })

  const updated = await projectService.updateProject(project.id, { tags: ['新标签1', '新标签2'] })
  assert.deepEqual(updated.tags, ['新标签1', '新标签2'])
  cleanupTestProjects()
})
