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

  // 用可控 stub 替代真实 mock+ffmpeg，避免全量测试并行时 CPU 竞争导致的墙钟抖动
  const originalProvider = videoService.provider
  const originalPoll = videoService.pollTaskStatus
  let inFlight = 0
  let maxInFlight = 0
  let taskSeq = 0

  videoService.provider = {
    name: 'concurrency-stub',
    supportsReferenceImages: () => false,
    generateVideo: async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 50))
      inFlight--
      return { taskId: `stub-${taskSeq++}` }
    },
  }
  videoService.pollTaskStatus = async (taskId) => {
    const task = videoService.activeTasks.get(taskId)
    if (task) {
      task.resolve({ videoUrl: 'mock://done.mp4', status: 'completed', consistencyScore: 0.8 })
      videoService.activeTasks.delete(taskId)
    }
  }

  try {
    const start = Date.now()
    const results = await videoService.generateShotsParallel(shots, project, null, null, 2)
    const elapsed = (Date.now() - start) / 1000

    assert.equal(results.length, 4)
    for (const result of results) {
      assert.equal(result.success, true)
    }
    // 4 个镜头、并发上限 2：同时在飞的请求不应超过 2，且确实用满了并发
    assert.equal(maxInFlight, 2, `Expected max in-flight 2, got ${maxInFlight}`)
    // 串行需 4×50ms，理想为 2×50ms；上限放宽以免调度抖动造成偶发失败
    assert.ok(elapsed < 5, `Expected < 5s with concurrency 2, got ${elapsed}s`)
  } finally {
    videoService.provider = originalProvider
    videoService.pollTaskStatus = originalPoll
    videoService.activeTasks.clear()
  }
})
