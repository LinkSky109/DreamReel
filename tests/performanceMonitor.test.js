import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { performanceMonitor } from '../src/services/performanceMonitor.js'

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    performanceMonitor.reset()
  })

  after(() => {
    performanceMonitor.destroy()
  })

  it('should record request stats', () => {
    const req = { method: 'GET', path: '/api/test' }
    const res = { statusCode: 200 }

    performanceMonitor.startRequest(req)
    performanceMonitor.endRequest(req, res)

    const stats = performanceMonitor.getRequestStats()
    assert.equal(stats.total, 1)
    assert.equal(stats.errors, 0)
  })

  it('should count errors', () => {
    const req = { method: 'GET', path: '/api/test' }
    const res = { statusCode: 500 }

    performanceMonitor.startRequest(req)
    performanceMonitor.endRequest(req, res)

    const stats = performanceMonitor.getRequestStats()
    assert.equal(stats.total, 1)
    assert.equal(stats.errors, 1)
    assert.equal(stats.errorRate, 100)
  })

  it('should track endpoint stats', () => {
    const req1 = { method: 'GET', path: '/api/fast', route: { path: '/api/fast' } }
    const req2 = { method: 'GET', path: '/api/slow', route: { path: '/api/slow' } }
    const res = { statusCode: 200 }

    performanceMonitor.startRequest(req1)
    performanceMonitor.endRequest(req1, res)
    performanceMonitor.startRequest(req2)
    performanceMonitor.endRequest(req2, res)

    const stats = performanceMonitor.getRequestStats()
    assert.equal(stats.busiestEndpoints.length, 2)
  })

  it('should get system resources', () => {
    const resources = performanceMonitor.getSystemResources()
    assert.ok(resources.cpu)
    assert.ok(resources.memory)
    assert.ok(resources.process)
    assert.ok(resources.uptime >= 0)
    assert.ok(resources.cpu.cores > 0)
    assert.ok(resources.memory.total > 0)
  })

  it('should get full report', () => {
    const report = performanceMonitor.getFullReport()
    assert.ok(report.system)
    assert.ok(report.requests)
    assert.ok(report.history)
    assert.ok(report.timestamp)
  })

  it('should reset stats', () => {
    const req = { method: 'GET', path: '/api/test' }
    const res = { statusCode: 200 }

    performanceMonitor.startRequest(req)
    performanceMonitor.endRequest(req, res)

    performanceMonitor.reset()

    const stats = performanceMonitor.getRequestStats()
    assert.equal(stats.total, 0)
    assert.equal(stats.errors, 0)
  })

  it('should calculate average response time', () => {
    const req1 = { method: 'GET', path: '/api/test' }
    const req2 = { method: 'GET', path: '/api/test' }
    const res = { statusCode: 200 }

    performanceMonitor.startRequest(req1)
    performanceMonitor.endRequest(req1, res)
    performanceMonitor.startRequest(req2)
    performanceMonitor.endRequest(req2, res)

    const stats = performanceMonitor.getRequestStats()
    assert.ok(stats.avgResponseTime >= 0)
    assert.ok(typeof stats.avgResponseTimeSec === 'string')
  })

  it('should get history data', () => {
    const history = performanceMonitor.getHistory()
    assert.ok(Array.isArray(history.requests))
    assert.ok(Array.isArray(history.errors))
    assert.ok(Array.isArray(history.responseTime))
  })
})
