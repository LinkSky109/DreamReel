import { getVideoJobRepository, isTerminalStatus } from '../repositories/videoJobRepository.js'
import { quotaService } from './quotaService.js'
import { AppError } from '../utils/appError.js'
import logger from '../utils/logger.js'

/**
 * 长任务（video jobs）应用服务（R3-T3.5）。
 * 规则见 docs/adr/0005-video-job-persistence.md
 */

const JOB_TYPE = 'video_batch'

function selectPendingShots(project, shotIds) {
  const shots = Array.isArray(project.shots) ? project.shots : []
  if (Array.isArray(shotIds) && shotIds.length) {
    const wanted = new Set(shotIds)
    return shots.filter((shot) => wanted.has(shot.id))
  }
  return shots.filter((shot) => shot.status !== 'completed' && !shot.locked)
}

export function createVideoJobService({ repo = getVideoJobRepository() } = {}) {
  async function createJob({ userId, project, shotIds, styleId, idempotencyKey }) {
    if (idempotencyKey) {
      const existing = await repo.findByIdempotencyKey(userId, JOB_TYPE, idempotencyKey)
      if (existing) return { job: existing, replayed: true }
    }

    const targets = selectPendingShots(project, shotIds)
    if (!targets.length) {
      throw AppError.badRequest('没有可生成的镜头', { details: { projectId: project.id } })
    }

    const quota = quotaService.checkVideoQuota(userId)
    if (quota.remaining < targets.length) {
      throw new AppError(429, 'QUOTA_EXCEEDED', quota.reason || '今日视频生成额度不足', {
        details: { used: quota.used, limit: quota.limit, remaining: quota.remaining, requested: targets.length },
      })
    }

    if (idempotencyKey) {
      const raced = await repo.findByIdempotencyKey(userId, JOB_TYPE, idempotencyKey)
      if (raced) return { job: raced, replayed: true }
    }

    for (let i = 0; i < targets.length; i++) quotaService.consumeVideoQuota(userId)

    try {
      const job = await repo.create({
        userId,
        projectId: project.id,
        type: JOB_TYPE,
        shotIds: targets.map((shot) => shot.id),
        styleId: styleId || null,
        idempotencyKey: idempotencyKey || null,
        total: targets.length,
        payload: { styleId: styleId || null },
      })
      logger.info(`Video job created: ${job.id} (${job.total} shots, user=${userId})`)
      return { job, replayed: false }
    } catch (error) {
      if (error.code === '23505' && idempotencyKey) {
        const existing = await repo.findByIdempotencyKey(userId, JOB_TYPE, idempotencyKey)
        if (existing) return { job: existing, replayed: true }
      }
      throw error
    }
  }

  async function getJob(jobId) {
    const job = await repo.findById(jobId)
    if (!job) throw AppError.notFound('任务不存在')
    return job
  }

  async function listJobs(projectId, { limit = 20 } = {}) {
    return repo.listByProject(projectId, { limit })
  }

  async function cancelJob(jobId) {
    const job = await repo.findById(jobId)
    if (!job) throw AppError.notFound('任务不存在')
    if (isTerminalStatus(job.status)) {
      throw AppError.conflict(`任务已结束（${job.status}），无法取消`)
    }
    const updated = await repo.requestCancel(jobId)
    logger.info(`Video job cancel requested: ${jobId}`)
    return updated
  }

  return { createJob, getJob, listJobs, cancelJob }
}

let singleton = null

export function getVideoJobService() {
  if (!singleton) singleton = createVideoJobService()
  return singleton
}

export const videoJobService = {
  createJob: (...args) => getVideoJobService().createJob(...args),
  getJob: (...args) => getVideoJobService().getJob(...args),
  listJobs: (...args) => getVideoJobService().listJobs(...args),
  cancelJob: (...args) => getVideoJobService().cancelJob(...args),
}

export default videoJobService
