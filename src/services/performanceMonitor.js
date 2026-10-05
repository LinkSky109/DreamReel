import os from 'os'
import logger from '../utils/logger.js'

/**
 * 性能监控服务
 * 实时监控系统资源和请求统计
 */

const MAX_HISTORY_POINTS = 60 // 保留最近 60 个数据点（每分钟一个）

class PerformanceMonitor {
  constructor() {
    this.requestCount = 0
    this.errorCount = 0
    this.totalResponseTime = 0
    this.responseTimeHistory = []
    this.requestHistory = []
    this.errorHistory = []
    this.endpointStats = new Map()
    this.startTime = Date.now()
    this.lastMinuteRequests = 0
    this.lastMinuteErrors = 0
    this.lastMinuteResponseTime = 0

    // 每分钟记录一次历史数据（测试模式下不启动）
    if (process.env.NODE_ENV !== 'test') {
      this.historyInterval = setInterval(() => this._recordHistoryPoint(), 60000)
      // 允许进程退出
      if (this.historyInterval.unref) {
        this.historyInterval.unref()
      }
    }
  }

  /**
   * 记录请求开始
   */
  startRequest(req) {
    req._startTime = Date.now()
  }

  /**
   * 记录请求结束
   */
  endRequest(req, res) {
    if (!req._startTime) return

    const duration = Date.now() - req._startTime
    const endpoint = `${req.method} ${req.route?.path || req.path}`
    const isError = res.statusCode >= 400

    this.requestCount++
    this.totalResponseTime += duration
    this.lastMinuteRequests++
    this.lastMinuteResponseTime += duration

    if (isError) {
      this.errorCount++
      this.lastMinuteErrors++
    }

    // 端点统计
    if (!this.endpointStats.has(endpoint)) {
      this.endpointStats.set(endpoint, { count: 0, errors: 0, totalTime: 0 })
    }
    const stats = this.endpointStats.get(endpoint)
    stats.count++
    stats.totalTime += duration
    if (isError) stats.errors++
  }

  /**
   * 记录历史数据点
   */
  _recordHistoryPoint() {
    const timestamp = new Date().toISOString()
    this.requestHistory.push({
      timestamp,
      count: this.lastMinuteRequests,
    })
    this.errorHistory.push({
      timestamp,
      count: this.lastMinuteErrors,
    })
    this.responseTimeHistory.push({
      timestamp,
      avg: this.lastMinuteRequests > 0 ? Math.round(this.lastMinuteResponseTime / this.lastMinuteRequests) : 0,
    })

    // 限制历史长度
    if (this.requestHistory.length > MAX_HISTORY_POINTS) {
      this.requestHistory = this.requestHistory.slice(-MAX_HISTORY_POINTS)
      this.errorHistory = this.errorHistory.slice(-MAX_HISTORY_POINTS)
      this.responseTimeHistory = this.responseTimeHistory.slice(-MAX_HISTORY_POINTS)
    }

    // 重置分钟计数
    this.lastMinuteRequests = 0
    this.lastMinuteErrors = 0
    this.lastMinuteResponseTime = 0
  }

  /**
   * 获取系统资源使用情况
   */
  getSystemResources() {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const loadAvg = os.loadavg()

    return {
      cpu: {
        loadAvg1m: loadAvg[0],
        loadAvg5m: loadAvg[1],
        loadAvg15m: loadAvg[2],
        cores: os.cpus().length,
        usagePercent: Math.min(100, Math.round((loadAvg[0] / os.cpus().length) * 100)),
      },
      memory: {
        total: totalMem,
        totalMB: Math.round(totalMem / 1024 / 1024),
        used: usedMem,
        usedMB: Math.round(usedMem / 1024 / 1024),
        free: freeMem,
        freeMB: Math.round(freeMem / 1024 / 1024),
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      process: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid,
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    }
  }

  /**
   * 获取请求统计
   */
  getRequestStats() {
    const avgResponseTime = this.requestCount > 0
      ? Math.round(this.totalResponseTime / this.requestCount)
      : 0

    const errorRate = this.requestCount > 0
      ? ((this.errorCount / this.requestCount) * 100).toFixed(2)
      : 0

    // Top 5 最慢端点
    const slowestEndpoints = Array.from(this.endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: Math.round(stats.totalTime / stats.count),
        errors: stats.errors,
        errorRate: stats.count > 0 ? ((stats.errors / stats.count) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5)

    // Top 5 最频繁端点
    const busiestEndpoints = Array.from(this.endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgTime: Math.round(stats.totalTime / stats.count),
        errors: stats.errors,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      total: this.requestCount,
      errors: this.errorCount,
      errorRate: parseFloat(errorRate),
      avgResponseTime,
      avgResponseTimeSec: (avgResponseTime / 1000).toFixed(2),
      slowestEndpoints,
      busiestEndpoints,
    }
  }

  /**
   * 获取历史趋势数据
   */
  getHistory() {
    return {
      requests: this.requestHistory,
      errors: this.errorHistory,
      responseTime: this.responseTimeHistory,
    }
  }

  /**
   * 获取完整性能报告
   */
  getFullReport() {
    return {
      system: this.getSystemResources(),
      requests: this.getRequestStats(),
      history: this.getHistory(),
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * 重置统计
   */
  reset() {
    this.requestCount = 0
    this.errorCount = 0
    this.totalResponseTime = 0
    this.endpointStats.clear()
    this.requestHistory = []
    this.errorHistory = []
    this.responseTimeHistory = []
    this.lastMinuteRequests = 0
    this.lastMinuteErrors = 0
    this.lastMinuteResponseTime = 0
    logger.info('Performance monitor reset')
  }

  /**
   * 销毁监控器，清除定时器
   */
  destroy() {
    if (this.historyInterval) {
      clearInterval(this.historyInterval)
      this.historyInterval = null
    }
  }
}

export const performanceMonitor = new PerformanceMonitor()
export default performanceMonitor
