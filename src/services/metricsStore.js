/**
 * 调用指标存储（Phase 0）
 *
 * 关键决策：指标**不写进 db.json**（storageService.save 是整库 debounce 全量重写，
 * 高频埋点会拖垮存储），改为每日一个 JSONL 追加文件：
 *   storage/metrics/invocations-YYYY-MM-DD.jsonl
 * 目录基于 config.storage.path，测试时自动落到隔离目录（见 tests/setup-isolated-storage.js）。
 *
 * 职责边界：本模块只做 I/O + 读取 + 保留期清理；聚合在 providerMetricsService。
 */

import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const FILE_RE = /^invocations-(\d{4}-\d{2}-\d{2})\.jsonl$/

function metricsDir() {
  return path.resolve(config.storage.path, 'metrics')
}

function fileForDate(dateStr) {
  return path.join(metricsDir(), `invocations-${dateStr}.jsonl`)
}

function dateKey(ts) {
  return String(ts).slice(0, 10)
}

/**
 * 追加一条调用指标（同步追加，保证单行完整、顺序确定）。
 * @param {object} metric
 */
export function appendInvocationMetric(metric) {
  if (!metric || typeof metric !== 'object') {
    throw new Error('appendInvocationMetric: metric must be an object')
  }
  if (!metric.ts) {
    throw new Error('appendInvocationMetric: metric.ts is required')
  }
  fs.mkdirSync(metricsDir(), { recursive: true })
  fs.appendFileSync(fileForDate(dateKey(metric.ts)), `${JSON.stringify(metric)}\n`, 'utf-8')
  return metric
}

/** 列出已有指标的日期（升序） */
export function listMetricDates() {
  const dir = metricsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .map((f) => FILE_RE.exec(f)?.[1])
    .filter(Boolean)
    .sort()
}

/**
 * 读取并按条件过滤指标。
 * @param {{from?:string, to?:string, stage?:string, provider?:string, model?:string, taskType?:string, projectId?:string, userId?:string}} [filters]
 * @returns {object[]}
 */
export function readInvocationMetrics(filters = {}) {
  const { from, to, stage, provider, model, taskType, projectId, userId } = filters
  const dir = metricsDir()
  if (!fs.existsSync(dir)) return []

  let dates = listMetricDates()
  if (from) dates = dates.filter((d) => d >= from)
  if (to) dates = dates.filter((d) => d <= to)

  const out = []
  for (const d of dates) {
    const content = fs.readFileSync(fileForDate(d), 'utf-8')
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue // 跳过损坏行，不影响其余指标
      }
      if (stage && rec.stage !== stage) continue
      if (provider && rec.provider !== provider) continue
      if (model && rec.model !== model) continue
      if (taskType && rec.taskType !== taskType) continue
      if (projectId && rec.projectId !== projectId) continue
      if (userId && rec.userId !== userId) continue
      out.push(rec)
    }
  }
  return out
}

/**
 * 清理超过保留期的原始 JSONL 文件。
 * @param {{rawRetentionDays?:number, now?:Date}} [opts]
 * @returns {{removed:string[], cutoff:string}}
 */
export function cleanupOldMetrics(opts = {}) {
  const { rawRetentionDays = 7, now = new Date() } = opts
  const dir = metricsDir()
  const cutoff = new Date(now.getTime() - rawRetentionDays * 86400000).toISOString().slice(0, 10)
  if (!fs.existsSync(dir)) return { removed: [], cutoff }

  const removed = []
  for (const f of fs.readdirSync(dir)) {
    const m = FILE_RE.exec(f)
    if (m && m[1] < cutoff) {
      try {
        fs.rmSync(path.join(dir, f))
        removed.push(f)
      } catch (error) {
        logger.warn(`cleanupOldMetrics: failed to remove ${f}: ${error.message}`)
      }
    }
  }
  return { removed, cutoff }
}

export { metricsDir, fileForDate }
export default { appendInvocationMetric, readInvocationMetrics, listMetricDates, cleanupOldMetrics }
