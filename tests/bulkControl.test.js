import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { beginRun, cancelRun, isCancelled, finishRun, getRunStatus } from '../src/services/bulkControl.js'

describe('批量出图中断控制 bulkControl', () => {
  it('开始 → 未取消', () => {
    beginRun('n1')
    assert.equal(isCancelled('n1'), false)
    assert.equal(getRunStatus('n1').running, true)
  })

  it('取消后 isCancelled=true 并记录时间', () => {
    beginRun('n2')
    const r = cancelRun('n2')
    assert.equal(r.cancelled, true)
    assert.ok(r.cancelledAt)
    assert.equal(isCancelled('n2'), true)
  })

  it('新一轮 beginRun 清除取消状态', () => {
    beginRun('n3')
    cancelRun('n3')
    assert.equal(isCancelled('n3'), true)
    beginRun('n3')
    assert.equal(isCancelled('n3'), false)
  })

  it('finishRun 结束运行但不改取消语义', () => {
    beginRun('n4')
    cancelRun('n4')
    const r = finishRun('n4', { ok: 2, failed: 1 })
    assert.equal(r.running, false)
    assert.equal(r.ok, 2)
    assert.equal(isCancelled('n4'), true)
  })

  it('未开始的 run 不视为取消', () => {
    assert.equal(isCancelled('never-started'), false)
    assert.equal(getRunStatus('never-started').running, false)
  })
})
