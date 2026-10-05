import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

// 清理测试数据
function cleanupTestProjects() {
  const testIds = []
  for (const [id, project] of projectService.projects.entries()) {
    if (project.name && (project.name.startsWith('[复制测试]') || project.name.includes('(副本)'))) {
      testIds.push(id)
    }
  }
  for (const id of testIds) {
    projectService.projects.delete(id)
  }
}

test('projectService - duplicateProject 基本复制', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 源项目',
    description: '源项目描述',
    style: 'nolan',
    platform: 'portrait',
    tags: ['科幻', '实验'],
    userId: 'test-dup-user',
  })

  const duplicated = await projectService.duplicateProject(source.id)

  assert.notEqual(duplicated.id, source.id)
  assert.equal(duplicated.name, '[复制测试] 源项目 (副本)')
  assert.equal(duplicated.description, source.description)
  assert.equal(duplicated.style, source.style)
  assert.equal(duplicated.platform, source.platform)
  assert.deepEqual(duplicated.tags, source.tags)
  assert.equal(duplicated.isFavorite, false)
  assert.equal(duplicated.isArchived, false)

  cleanupTestProjects()
})

test('projectService - duplicateProject 自定义名称', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 自定义名称',
    userId: 'test-dup-user',
  })

  const duplicated = await projectService.duplicateProject(source.id, {
    newName: '我的自定义副本',
  })

  assert.equal(duplicated.name, '我的自定义副本')

  cleanupTestProjects()
})

test('projectService - duplicateProject 镜头状态重置为 pending', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 镜头测试',
    userId: 'test-dup-user',
  })

  // 添加已完成的镜头
  source.addShot({ description: '镜头1', status: 'completed', videoUrl: '/storage/videos/test.mp4' })
  source.addShot({ description: '镜头2', status: 'failed', errorMessage: '生成失败' })
  await projectService.updateProject(source.id, { shots: source.shots })

  const duplicated = await projectService.duplicateProject(source.id)

  assert.equal(duplicated.shots.length, 2)
  assert.equal(duplicated.shots[0].status, 'pending')
  assert.equal(duplicated.shots[0].videoUrl, '')
  assert.equal(duplicated.shots[1].status, 'pending')
  assert.equal(duplicated.shots[1].errorMessage, '')

  cleanupTestProjects()
})

test('projectService - duplicateProject 角色参考图清除', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 角色测试',
    userId: 'test-dup-user',
  })

  source.addCharacter({
    name: '主角',
    description: '男主角',
    referenceImages: ['/storage/ref/img1.jpg'],
    locked: true,
  })
  await projectService.updateProject(source.id, { characters: source.characters })

  const duplicated = await projectService.duplicateProject(source.id)

  assert.equal(duplicated.characters.length, 1)
  assert.equal(duplicated.characters[0].name, '主角')
  assert.deepEqual(duplicated.characters[0].referenceImages, [])
  assert.equal(duplicated.characters[0].locked, false)

  cleanupTestProjects()
})

test('projectService - duplicateProject 剧本深拷贝', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 剧本测试',
    userId: 'test-dup-user',
  })

  const script = {
    synopsis: '一个关于未来的故事',
    shots: [
      { description: '开场', dialogue: '你好', duration: 3 },
      { description: '结尾', narration: '结束', duration: 4 },
    ],
  }
  await projectService.updateProject(source.id, { script })

  const duplicated = await projectService.duplicateProject(source.id)

  assert.equal(duplicated.script.synopsis, '一个关于未来的故事')
  assert.equal(duplicated.script.shots.length, 2)

  // 验证是深拷贝（修改副本不影响源）
  duplicated.script.synopsis = '修改后的简介'
  const sourceAfter = await projectService.getProject(source.id)
  assert.equal(sourceAfter.script.synopsis, '一个关于未来的故事')

  cleanupTestProjects()
})

test('projectService - duplicateProject 复制后持久化', async () => {
  cleanupTestProjects()
  const source = await projectService.createProject({
    name: '[复制测试] 持久化测试',
    userId: 'test-dup-user',
  })

  const duplicated = await projectService.duplicateProject(source.id)

  // 验证可以从 service 中获取
  const fetched = await projectService.getProject(duplicated.id)
  assert.equal(fetched.id, duplicated.id)
  assert.equal(fetched.name, duplicated.name)

  cleanupTestProjects()
})
