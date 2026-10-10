import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

const TEST_USER = 'search_test_user'

test('projectService: listProjects with search should filter by name', async () => {
  // 创建测试项目
  await projectService.createProject({ name: '火星探险记', userId: TEST_USER })
  await projectService.createProject({ name: '海洋深处', userId: TEST_USER })
  await projectService.createProject({ name: '火星救援', userId: TEST_USER })

  const result = await projectService.listProjects({ userId: TEST_USER, search: '火星' })
  assert.ok(result.total >= 2)
  const names = result.items.map((p) => p.name)
  assert.ok(names.includes('火星探险记'))
  assert.ok(names.includes('火星救援'))
  assert.ok(!names.includes('海洋深处'))
})

test('projectService: listProjects with status filter', async () => {
  const project = await projectService.createProject({ name: '状态测试', userId: TEST_USER })
  project.addShot({ description: '镜头1', status: 'completed' })
  project.addShot({ description: '镜头2', status: 'pending' })
  await projectService.updateProject(project.id, { shots: project.shots })

  // 进行中
  const inProgress = await projectService.listProjects({ userId: TEST_USER, status: 'in-progress' })
  assert.ok(inProgress.items.some((p) => p.id === project.id))

  // 已完成（需要所有镜头都完成，这个项目不是）
  const completed = await projectService.listProjects({ userId: TEST_USER, status: 'completed' })
  assert.ok(!completed.items.some((p) => p.id === project.id))
})

test('projectService: listProjects with style filter', async () => {
  await projectService.createProject({ name: '风格测试', userId: TEST_USER, style: 'nolan' })

  const result = await projectService.listProjects({ userId: TEST_USER, style: 'nolan' })
  assert.ok(result.items.some((p) => p.name === '风格测试'))

  const noneResult = await projectService.listProjects({ userId: TEST_USER, style: 'none' })
  assert.ok(!noneResult.items.some((p) => p.name === '风格测试'))
})

test('projectService: listProjects with platform filter', async () => {
  await projectService.createProject({ name: '竖屏测试', userId: TEST_USER, platform: 'portrait' })

  const result = await projectService.listProjects({ userId: TEST_USER, platform: 'portrait' })
  assert.ok(result.items.some((p) => p.name === '竖屏测试'))
})

test('projectService: listProjects with sort', async () => {
  await projectService.createProject({ name: 'AAA项目', userId: TEST_USER })
  await projectService.createProject({ name: 'BBB项目', userId: TEST_USER })

  // 按名称排序
  const nameSorted = await projectService.listProjects({ userId: TEST_USER, sort: 'name' })
  const names = nameSorted.items.map((p) => p.name)
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  assert.deepEqual(names, sortedNames)
})

test('projectService: listProjects with combined filters', async () => {
  await projectService.createProject({ name: '综合测试火星', userId: TEST_USER, style: 'nolan', platform: 'portrait' })

  const result = await projectService.listProjects({
    userId: TEST_USER,
    search: '火星',
    style: 'nolan',
    platform: 'portrait',
  })
  assert.ok(result.items.some((p) => p.name === '综合测试火星'))
})
