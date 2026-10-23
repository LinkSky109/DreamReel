import { hostname } from 'node:os'
import config from '../config/index.js'
import { getVideoJobRepository } from '../repositories/videoJobRepository.js'
import { projectService } from '../services/projectService.js'
import { videoService } from '../services/videoService.js'
import { styleService } from '../services/styleService.js'
import { SHOT_STATUS } from '../models/shot.js'
import { generateId } from '../utils/idGenerator.js'
import logger from '../utils/logger.js'

/**
 * 视频长任务 worker（R3-T3.5）。
 * 单实例内置轮询；多实例通过数据库租约互斥。
 */
export function createVideoJobWorker({
  repo = getVideoJobRepository(),
  intervalMs = config.videoJobs.intervalMs,
  leaseMs = config.videoJobs.leaseMs,
  workerId = `${hostname()}:${process.pid}:${generateId().slice(0, 8)}`,
  executeShot = defaultExecuteShot,
  getProject = (id) => projectService.getProject(id),
  updateProject = (id, patch) => projectService.updateProject(id, patch),
} = {}) {
  let timer = null
  let busy = false

  async function updateShot(projectId, shotId, patch) {
    const project = await getProject(projectId)
    const shot = project.shots.find((item) => item.id === shotId)
    if (!shot) return
    Object.assign(shot, patch, { updatedAt: new Date().toISOString() })
    await updateProject(projectId, { shots: project.shots })
  }

  async function runJob(job) {
    const project = await getProject(job.projectId)
    const shots = job.shotIds
      .map((id) => project.shots.find((shot) => shot.id === id))
      .filter(Boolean)

    if (!shots.length) {
      await repo.finish(job.id, 'failed', {
        workerId,
        errorCode: 'SHOTS_NOT_FOUND',
        errorMessage: 'job 引用的镜头不存在',
      })
      return
    }

    let completed = 0
    let failure = null

    for (const shot of shots) {
      if (await repo.isCancelRequested(job.id)) {
        await repo.finish(job.id, 'canceled', { workerId, message: '已取消' })
        return
      }

      await repo.heartbeat(job.id, workerId, leaseMs)
      await updateShot(job.projectId, shot.id, { status: SHOT_STATUS.GENERATING })

      try {
        const result = await executeShot({ job, project, shot })
        completed++
        await updateShot(job.projectId, shot.id, {
          status: SHOT_STATUS.COMPLETED,
          videoUrl: result?.videoUrl,
          consistencyScore: result?.consistencyScore,
        })
      } catch (error) {
        if (!failure) failure = error
        await updateShot(job.projectId, shot.id, {
          status: SHOT_STATUS.FAILED,
          errorMessage: error.message,
        })
      }

      await repo.updateProgress(job.id, {
        completed,
        total: shots.length,
        message: `已完成 ${completed}/${shots.length}`,
      })
      await repo.heartbeat(job.id, workerId, leaseMs)
    }

    const canceled = await repo.isCancelRequested(job.id)
    if (canceled) {
      await repo.finish(job.id, 'canceled', { workerId, message: '已取消' })
      return
    }

    if (failure) {
      await repo.finish(job.id, 'failed', {
        workerId,
        errorCode: 'SHOT_FAILED',
        errorMessage: failure.message,
        message: `完成 ${completed}/${shots.length}，存在失败镜头`,
      })
      return
    }

    await repo.finish(job.id, 'succeeded', {
      workerId,
      message: `完成 ${completed}/${shots.length}`,
    })
  }

  async function tick() {
    if (busy) return null
    busy = true
    try {
      await repo.recoverExpired()
      const job = await repo.claimNext(workerId, leaseMs)
      if (!job) return null
      logger.info(`Video job claimed: ${job.id} by ${workerId} (attempt ${job.attempt})`)
      try {
        await runJob(job)
      } catch (error) {
        logger.error(`Video job failed unexpectedly: ${job.id}: ${error.message}`)
        await repo.finish(job.id, 'failed', {
          workerId,
          errorCode: 'WORKER_ERROR',
          errorMessage: error.message,
        })
      }
      return job.id
    } finally {
      busy = false
    }
  }

  function start() {
    if (timer) return
    timer = setInterval(() => {
      tick().catch((error) => logger.error(`Video job worker tick failed: ${error.message}`))
    }, intervalMs)
    if (typeof timer.unref === 'function') timer.unref()
    logger.info(`Video job worker started: ${workerId} interval=${intervalMs}ms`)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return { tick, start, stop, workerId, isBusy: () => busy }
}

export function defaultExecuteShot({ job, project, shot }) {
  const styleId = job.styleId || project.style || 'none'
  const prompt = styleService.applyStyleToPrompt(shot.description || '', styleId)
  return videoService.generateShot({
    projectId: project.id,
    shotId: shot.id,
    prompt,
    originalPrompt: shot.description,
    styleId: styleId !== 'none' ? styleId : null,
    referenceImages: videoService.collectReferenceImages(shot, project),
    duration: shot.duration || 5,
    aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
    project,
  })
}

let singleton = null

export function getVideoJobWorker() {
  if (!singleton) singleton = createVideoJobWorker()
  return singleton
}

export default getVideoJobWorker
