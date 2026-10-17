/**
 * 抽取任务进度登记（进程内）：让前端能轮询「每个分片」的实时状态。
 * 单实例内有效；多实例部署需换成外部存储。
 */
import { runPool } from '../utils/pool.js'

const jobs = new Map()
const keyOf = (novelId, kind) => `${novelId}:${kind}`

export function startJob(novelId, kind, labels) {
  const job = {
    novelId,
    kind,
    startedAt: Date.now(),
    finishedAt: null,
    total: labels.length,
    done: 0,
    failed: 0,
    running: 0,
    tasks: labels.map((label, index) => ({
      index,
      label: String(label || `片${index + 1}`),
      status: 'pending',
      ms: 0,
      error: null,
    })),
  }
  jobs.set(keyOf(novelId, kind), job)
  return job
}

export function getJob(novelId, kind) {
  return jobs.get(keyOf(novelId, kind)) || null
}

export function getJobs(novelId) {
  return {
    characters: getJob(novelId, 'characters'),
    world: getJob(novelId, 'world'),
    both: getJob(novelId, 'both'),
  }
}

export function clearJob(novelId, kind) {
  jobs.delete(keyOf(novelId, kind))
}

function markRunning(job, i) {
  const t = job.tasks[i]
  if (t) t.status = 'running'
  job.running += 1
}

function markDone(job, i, ms) {
  const t = job.tasks[i]
  if (t) {
    t.status = 'done'
    t.ms = ms
  }
  job.running = Math.max(0, job.running - 1)
  job.done += 1
}

function markFailed(job, i, ms, error) {
  const t = job.tasks[i]
  if (t) {
    t.status = 'failed'
    t.ms = ms
    t.error = String(error || 'failed').slice(0, 160)
  }
  job.running = Math.max(0, job.running - 1)
  job.failed += 1
}

/**
 * 并发跑一组分片，逐片登记状态；call(g, i) 返回 { ok, data } 或 { ok:false, error }。
 */
export async function runGroups({ novelId, kind, groups, concurrency = 4, call }) {
  const job = startJob(novelId, kind, groups.map((g) => (g.titles && g.titles[0]) || ''))
  const results = new Array(groups.length).fill(null)
  await runPool(
    groups,
    async (g, i) => {
      const t0 = Date.now()
      markRunning(job, i)
      try {
        const r = await call(g, i)
        results[i] = r
        if (r && r.ok) markDone(job, i, Date.now() - t0)
        else markFailed(job, i, Date.now() - t0, (r && r.error) || 'empty')
      } catch (e) {
        results[i] = { ok: false, error: e.message }
        markFailed(job, i, Date.now() - t0, e.message)
      }
    },
    concurrency
  )
  job.finishedAt = Date.now()
  return { job, results }
}

export default { startJob, getJob, getJobs, clearJob, runGroups }
