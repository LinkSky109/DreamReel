import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoService } from '../src/services/videoService.js'
import { projectService } from '../src/services/projectService.js'

test('videoService: generateShotsParallel should generate all shots', async () => {
  const project = await projectService.createProject({ name: '并行测试', userId: 'default' })
  project.addShot({ description: '镜头1', duration: 1 })
  project.addShot({ description: '镜头2', duration: 1 })
  await projectService.updateProject(project.id, { shots: project.shots })

  const progressCalls = []
  const results = await videoService.generateShotsParallel(
    project.shots,
    project,
    (p) => progressCalls.push(p),
    null,
    2
  )

  assert.equal(results.length, 2)
  assert.equal(results[0].success, true)
  assert.equal(results[1].success, true)
  assert.ok(results[0].videoUrl)
  assert.ok(results[1].videoUrl)
  assert.ok(progressCalls.length >= 2)
})

test('videoService: generateShotsParallel should handle errors gracefully', async () => {
  const project = await projectService.createProject({ name: '并行错误测试', userId: 'default' })
  const shots = [
    { id: 'shot1', description: '正常镜头', duration: 1, characterIds: [], sceneId: null },
    { id: 'shot2', description: '正常镜头2', duration: 1, characterIds: [], sceneId: null },
  ]

  const results = await videoService.generateShotsParallel(shots, project, null, null, 2)
  assert.equal(results.length, 2)
  // 两个都应该成功（mock provider）
  assert.equal(results[0].success, true)
  assert.equal(results[1].success, true)
})

test('videoService: generateShotsParallel should respect concurrency limit', async () => {
  const project = await projectService.createProject({ name: '并发控制测试', userId: 'default' })
  const shots = []
  for (let i = 0; i < 4; i++) {
    shots.push({ id: `shot${i}`, description: `镜头${i}`, duration: 1, characterIds: [], sceneId: null })
  }

  const start = Date.now()
  const results = await videoService.generateShotsParallel(shots, project, null, null, 2)
  const elapsed = (Date.now() - start) / 1000

  assert.equal(results.length, 4)
  // 4个镜头，2并发，每个约2-3秒，应该在6-10秒内完成
  // 串行需要8-12秒
  assert.ok(elapsed < 15, `Expected < 15s with concurrency 2, got ${elapsed}s`)
})
