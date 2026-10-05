import { projectService } from './projectService.js'
import { videoCompositingService } from './videoCompositingService.js'
import { audioService } from './audioService.js'
import ffmpeg from '../utils/ffmpeg.js'
import logger from '../utils/logger.js'

export const EDIT_PROFILES = [
  {
    id: 'fast',
    name: '快节奏',
    description: '短切、高能，适合动作与社媒投放',
    rhythmExponent: 0.72,
    transition: 'fade',
    transitionDuration: 0.3,
  },
  {
    id: 'narrative',
    name: '叙事',
    description: '稳定推进，保留呼吸感',
    rhythmExponent: 1.0,
    transition: 'cut',
    transitionDuration: 0,
  },
  {
    id: 'lyrical',
    name: '抒情',
    description: '更长镜头与柔和转场',
    rhythmExponent: 1.28,
    transition: 'fade',
    transitionDuration: 0.6,
  },
  {
    id: 'commercial',
    name: '商业广告',
    description: '前段抓眼、后段收束，适合产品片',
    rhythmExponent: 0.85,
    transition: 'fade',
    transitionDuration: 0.35,
  },
]

const MIN_SHOT_DURATION = 1
const MAX_TARGET_DURATION = 180

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function assertProjectAccess(project, userId) {
  if ((project.userId || 'default') !== userId) {
    throw httpError(404, `Project not found: ${project.id}`)
  }
}

export class EditPlanService {
  constructor() {
    this.xfadeSupported = null
  }

  listProfiles() {
    return EDIT_PROFILES
  }

  getProfile(profileId) {
    return EDIT_PROFILES.find((p) => p.id === profileId) || null
  }

  buildPlan(project, { profile = 'narrative', targetDuration = null, bgmId = null } = {}) {
    if (!project) throw httpError(400, 'project is required')
    const profileDef = this.getProfile(profile)
    if (!profileDef) throw httpError(400, `未知剪辑预设: ${profile}`)

    const shots = (project.shots || []).filter((shot) => shot.videoUrl && shot.status === 'completed')
    if (shots.length === 0) {
      throw httpError(400, '没有可用于剪辑的已完成镜头')
    }
    if (shots.length > 200) {
      throw httpError(400, '镜头数量过多（最多 200 个）')
    }

    const baseDurations = shots.map((shot) => Math.max(MIN_SHOT_DURATION, shot.duration || 5))
    const baseTotal = baseDurations.reduce((sum, value) => sum + value, 0)
    const requested = Number(targetDuration ?? project.targetDuration ?? baseTotal)
    if (!Number.isFinite(requested)) {
      throw httpError(400, 'targetDuration 必须是有效数字')
    }
    const target = clamp(requested, MIN_SHOT_DURATION * shots.length, MAX_TARGET_DURATION)

    const effectiveBgmId = bgmId || project.audioConfig?.bgmId || null
    const bgm = effectiveBgmId ? audioService.getBgm(effectiveBgmId) : null
    const bpm = bgm?.bpm || null
    const beatGrid = bpm ? 60 / bpm / 2 : null

    const lockedIndexes = new Set()
    shots.forEach((shot, index) => {
      if (shot.locked) lockedIndexes.add(index)
    })
    const lockedTotal = [...lockedIndexes].reduce((sum, index) => sum + baseDurations[index], 0)
    const flexibleIndexes = shots.map((_, index) => index).filter((index) => !lockedIndexes.has(index))
    const flexibleTarget = Math.max(
      flexibleIndexes.length * MIN_SHOT_DURATION,
      target - lockedTotal
    )

    const weights = flexibleIndexes.map((index) => Math.pow(baseDurations[index], profileDef.rhythmExponent))
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1
    const plannedDurations = new Array(shots.length).fill(0)

    lockedIndexes.forEach((index) => {
      plannedDurations[index] = baseDurations[index]
    })

    flexibleIndexes.forEach((shotIndex, i) => {
      const raw = (flexibleTarget * weights[i]) / weightTotal
      plannedDurations[shotIndex] = Math.max(MIN_SHOT_DURATION, raw)
    })

    if (beatGrid) {
      flexibleIndexes.forEach((shotIndex) => {
        plannedDurations[shotIndex] = Math.max(
          beatGrid,
          Math.round(plannedDurations[shotIndex] / beatGrid) * beatGrid
        )
      })
    }

    if (flexibleIndexes.length > 0) {
      const lastFlexible = flexibleIndexes[flexibleIndexes.length - 1]
      const currentFlexibleTotal = flexibleIndexes.reduce((sum, index) => sum + plannedDurations[index], 0)
      const adjustment = flexibleTarget - currentFlexibleTotal
      plannedDurations[lastFlexible] = Math.max(MIN_SHOT_DURATION, plannedDurations[lastFlexible] + adjustment)
      if (beatGrid) {
        plannedDurations[lastFlexible] = Math.max(
          beatGrid,
          Math.round(plannedDurations[lastFlexible] / beatGrid) * beatGrid
        )
      }
    }

    const planShots = shots.map((shot, index) => {
      const duration = Number(plannedDurations[index].toFixed(2))
      const base = baseDurations[index]
      let reason = '按目标时长比例缩放'
      if (shot.locked) reason = '锁定镜头保留原时长'
      else if (duration > base) reason = '按目标时长扩展'
      else if (beatGrid) reason = `对齐 ${bpm} BPM 切点`
      return {
        shotId: shot.id,
        index: shot.index ?? index,
        in: 0,
        out: duration,
        duration,
        transition: index === 0 ? 'cut' : profileDef.transition,
        reason,
      }
    })

    const totalDuration = Number(planShots.reduce((sum, shot) => sum + shot.duration, 0).toFixed(2))

    return {
      id: `edit_${hashString([
        project.id,
        profile,
        target,
        effectiveBgmId || '',
        planShots.map((shot) => `${shot.shotId}:${shot.duration}`).join('|'),
      ].join('::'))}`,
      profile,
      profileName: profileDef.name,
      targetDuration: target,
      totalDuration,
      transition: profileDef.transition,
      transitionDuration: profileDef.transitionDuration,
      bpm,
      beatGrid,
      bgmId: effectiveBgmId,
      shots: planShots,
      summary: `${profileDef.name}：${planShots.length} 个镜头，目标 ${target}s，计划 ${totalDuration}s`,
    }
  }

  async generatePlan(projectId, options = {}, userId = 'default') {
    const project = await projectService.getProject(projectId)
    assertProjectAccess(project, userId)
    const plan = this.buildPlan(project, options)
    await projectService.setEditPlan(projectId, plan)
    logger.info(`Edit plan generated for project ${projectId}: ${plan.profile} ${plan.totalDuration}s`)
    return plan
  }

  async getPlan(projectId, userId = 'default') {
    const project = await projectService.getProject(projectId)
    assertProjectAccess(project, userId)
    return project.editPlan || null
  }

  async clearPlan(projectId, userId = 'default') {
    const project = await projectService.getProject(projectId)
    assertProjectAccess(project, userId)
    await projectService.setEditPlan(projectId, null)
    return { projectId, cleared: true }
  }

  async supportsXfade() {
    if (this.xfadeSupported !== null) return this.xfadeSupported
    try {
      this.xfadeSupported = await ffmpeg.hasFilter('xfade')
    } catch {
      this.xfadeSupported = false
    }
    return this.xfadeSupported
  }

  async renderPlan(projectId, userId = 'default') {
    const project = await projectService.getProject(projectId)
    assertProjectAccess(project, userId)
    if (!project.editPlan) throw httpError(400, '请先生成剪辑方案')
    const result = await videoCompositingService.renderEditPlan(project, project.editPlan)
    return result
  }
}

export const editPlanService = new EditPlanService()
export default editPlanService
