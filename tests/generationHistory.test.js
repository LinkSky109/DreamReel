import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generationHistoryService } from '../src/services/generationHistoryService.js'
import { storageService } from '../src/services/storageService.js'

describe('GenerationHistoryService', () => {
  beforeEach(() => {
    // 清理测试数据
    storageService.data.generationHistory = []
    generationHistoryService.history = []
  })

  it('should record a generation', () => {
    const record = generationHistoryService.recordGeneration({
      projectId: 'proj_1',
      shotId: 'shot_1',
      prompt: 'a cat walking',
      provider: 'mock',
      status: 'completed',
      durationMs: 5000,
      userId: 'test-user',
    })

    assert.ok(record.id)
    assert.equal(record.projectId, 'proj_1')
    assert.equal(record.shotId, 'shot_1')
    assert.equal(record.prompt, 'a cat walking')
    assert.equal(record.provider, 'mock')
    assert.equal(record.status, 'completed')
    assert.equal(record.durationMs, 5000)
    assert.equal(record.userId, 'test-user')
    assert.ok(record.createdAt)
  })

  it('should record a failed generation', () => {
    const record = generationHistoryService.recordGeneration({
      projectId: 'proj_1',
      shotId: 'shot_2',
      prompt: 'a dog running',
      provider: 'mock',
      status: 'failed',
      error: 'API timeout',
      userId: 'test-user',
    })

    assert.equal(record.status, 'failed')
    assert.equal(record.error, 'API timeout')
  })

  it('should get project history', () => {
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_1', status: 'completed' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_2', status: 'failed' })
    generationHistoryService.recordGeneration({ projectId: 'proj_2', shotId: 'shot_3', status: 'completed' })

    const result = generationHistoryService.getProjectHistory('proj_1')
    assert.equal(result.total, 2)
    assert.equal(result.items.length, 2)
  })

  it('should filter project history by status', () => {
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_1', status: 'completed' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_2', status: 'failed' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_3', status: 'completed' })

    const result = generationHistoryService.getProjectHistory('proj_1', { status: 'completed' })
    assert.equal(result.total, 2)
  })

  it('should get shot history', () => {
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_1', status: 'completed', durationMs: 5000 })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_1', status: 'failed', error: 'retry' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', shotId: 'shot_2', status: 'completed' })

    const history = generationHistoryService.getShotHistory('shot_1')
    assert.equal(history.length, 2)
  })

  it('should get generation stats', () => {
    generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed', durationMs: 4000, provider: 'mock' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed', durationMs: 6000, provider: 'mock' })
    generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'failed', provider: 'mock' })

    const stats = generationHistoryService.getStats('proj_1')
    assert.equal(stats.total, 3)
    assert.equal(stats.completed, 2)
    assert.equal(stats.failed, 1)
    assert.equal(stats.successRate, 67)
    assert.equal(stats.avgDurationMs, 5000)
    assert.ok(stats.providerStats.mock)
  })

  it('should clear project history', () => {
    generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed' })
    generationHistoryService.recordGeneration({ projectId: 'proj_2', status: 'completed' })

    const result = generationHistoryService.clearProjectHistory('proj_1')
    assert.equal(result.removed, 1)

    const remaining = generationHistoryService.getProjectHistory('proj_1')
    assert.equal(remaining.total, 0)
  })

  it('should delete a single record', () => {
    const record = generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed' })

    const result = generationHistoryService.deleteRecord(record.id)
    assert.equal(result.removed, 1)

    const history = generationHistoryService.getProjectHistory('proj_1')
    assert.equal(history.total, 0)
  })

  it('should sort history by newest first', async () => {
    const r1 = generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const r2 = generationHistoryService.recordGeneration({ projectId: 'proj_1', status: 'completed' })

    const result = generationHistoryService.getProjectHistory('proj_1')
    assert.equal(result.items[0].id, r2.id)
    assert.equal(result.items[1].id, r1.id)
  })
})
