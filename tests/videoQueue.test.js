import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { videoService } from '../src/services/videoService.js'

describe('VideoQueue', () => {
  beforeEach(() => {
    // 清理活跃任务
    for (const [taskId] of videoService.activeTasks) {
      videoService.activeTasks.delete(taskId)
    }
    videoService.taskHistory = []
  })

  after(() => {
    // 清理
    for (const [taskId] of videoService.activeTasks) {
      videoService.activeTasks.delete(taskId)
    }
  })

  it('should get empty active tasks', () => {
    const tasks = videoService.getActiveTasks()
    assert.equal(tasks.length, 0)
  })

  it('should get queue stats', () => {
    const stats = videoService.getQueueStats()
    assert.ok(stats)
    assert.equal(stats.active, 0)
    assert.equal(stats.completed, 0)
    assert.equal(stats.failed, 0)
    assert.equal(stats.cancelled, 0)
  })

  it('should get project active tasks', () => {
    const tasks = videoService.getProjectActiveTasks('test-project')
    assert.equal(tasks.length, 0)
  })

  it('should cancel non-existent task', async () => {
    try {
      await videoService.cancelTask('non-existent-task')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.ok(error.message.includes('Task not found'))
    }
  })

  it('should cancel project tasks when none exist', async () => {
    const result = await videoService.cancelProjectTasks('test-project')
    assert.equal(result.total, 0)
    assert.equal(result.cancelled, 0)
  })

  it('should get task history', () => {
    const history = videoService.getTaskHistory()
    assert.ok(Array.isArray(history))
    assert.equal(history.length, 0)
  })

  it('should get task history with filters', () => {
    const history = videoService.getTaskHistory({ projectId: 'test', status: 'completed' })
    assert.ok(Array.isArray(history))
  })

  it('should record task history', () => {
    const taskInfo = {
      projectId: 'proj-1',
      shotId: 'shot-1',
      prompt: 'test prompt',
      startTime: Date.now() - 5000,
      duration: 5,
      resolution: '720p',
    }
    videoService._recordTaskHistory('task-1', taskInfo, 'completed', 'http://example.com/video.mp4')

    const history = videoService.getTaskHistory()
    assert.equal(history.length, 1)
    assert.equal(history[0].taskId, 'task-1')
    assert.equal(history[0].status, 'completed')
    assert.equal(history[0].projectId, 'proj-1')
    assert.ok(history[0].durationMs >= 0)
  })

  it('should filter task history by project', () => {
    const taskInfo1 = { projectId: 'proj-1', shotId: 'shot-1', prompt: 'p1', startTime: Date.now(), duration: 5, resolution: '720p' }
    const taskInfo2 = { projectId: 'proj-2', shotId: 'shot-2', prompt: 'p2', startTime: Date.now(), duration: 5, resolution: '720p' }
    videoService._recordTaskHistory('task-1', taskInfo1, 'completed')
    videoService._recordTaskHistory('task-2', taskInfo2, 'failed')

    const history1 = videoService.getTaskHistory({ projectId: 'proj-1' })
    assert.equal(history1.length, 1)
    assert.equal(history1[0].taskId, 'task-1')

    const history2 = videoService.getTaskHistory({ projectId: 'proj-2' })
    assert.equal(history2.length, 1)
    assert.equal(history2[0].taskId, 'task-2')
  })

  it('should filter task history by status', () => {
    const taskInfo = { projectId: 'proj-1', shotId: 'shot-1', prompt: 'p', startTime: Date.now(), duration: 5, resolution: '720p' }
    videoService._recordTaskHistory('task-1', taskInfo, 'completed')
    videoService._recordTaskHistory('task-2', taskInfo, 'failed')
    videoService._recordTaskHistory('task-3', taskInfo, 'cancelled')

    const completed = videoService.getTaskHistory({ status: 'completed' })
    assert.equal(completed.length, 1)

    const failed = videoService.getTaskHistory({ status: 'failed' })
    assert.equal(failed.length, 1)
  })

  it('should limit task history', () => {
    for (let i = 0; i < 10; i++) {
      const taskInfo = { projectId: 'proj-1', shotId: `shot-${i}`, prompt: 'p', startTime: Date.now(), duration: 5, resolution: '720p' }
      videoService._recordTaskHistory(`task-${i}`, taskInfo, 'completed')
    }

    const history = videoService.getTaskHistory({ limit: 3 })
    assert.equal(history.length, 3)
  })

  it('should update queue stats after recording history', () => {
    const taskInfo = { projectId: 'proj-1', shotId: 'shot-1', prompt: 'p', startTime: Date.now(), duration: 5, resolution: '720p' }
    videoService._recordTaskHistory('task-1', taskInfo, 'completed')
    videoService._recordTaskHistory('task-2', taskInfo, 'failed')

    const stats = videoService.getQueueStats()
    assert.equal(stats.completed, 1)
    assert.equal(stats.failed, 1)
    assert.equal(stats.total, 2)
  })
})
