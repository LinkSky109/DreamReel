import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import request from 'supertest'
import app from '../src/server.js'
import { editPlanService } from '../src/services/editPlanService.js'
import { projectService, ProjectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { seedAudioPack } from '../src/services/audioAssetService.js'
import ffmpeg from '../src/utils/ffmpeg.js'
import config from '../src/config/index.js'

const TEST_USER = 'default'
const STORAGE_DIR = path.resolve(config.storage.path)

function shot(id, index, { duration = 5, locked = false, videoUrl = `/storage/videos/${id}.mp4` } = {}) {
  return { id, index, duration, locked, status: 'completed', videoUrl, description: `镜头 ${index + 1}` }
}

describe('R34 智能剪辑', () => {
  let projectId

  before(async () => {
    const project = await projectService.createProject({ name: 'R34 剪辑测试项目', userId: TEST_USER })
    projectId = project.id
    await projectService.updateProject(projectId, {
      targetDuration: 15,
      shots: [shot('s1', 0), shot('s2', 1), shot('s3', 2), shot('s4', 3)],
      audioConfig: { bgmId: 'tension-01', sfxIds: [], voiceVolume: 1, bgmVolume: 0.3, sfxVolume: 0.5 },
    })
    await seedAudioPack({ bgmIds: ['tension-01'], sfxIds: [], duration: 3 })
  })

  after(async () => {
    try {
      await projectService.deleteProject(projectId)
    } catch { /* ignore */ }
    storageService._flush()
  })

  it('四种预设存在且未知预设返回 400 语义错误', () => {
    const ids = editPlanService.listProfiles().map((p) => p.id).sort()
    assert.deepEqual(ids, ['commercial', 'fast', 'lyrical', 'narrative'])
    assert.throws(() => editPlanService.buildPlan({ shots: [shot('s1', 0)] }, { profile: 'unknown' }), /未知剪辑预设/)
  })

  it('4 镜头目标 15s 生成确定性方案且总时长误差 <= 1s', async () => {
    const project = await projectService.getProject(projectId)
    const first = editPlanService.buildPlan(project, { profile: 'fast', targetDuration: 15 })
    const second = editPlanService.buildPlan(project, { profile: 'fast', targetDuration: 15 })
    assert.deepEqual(first, second)
    assert.ok(Math.abs(first.totalDuration - 15) <= 1)
    assert.equal(first.shots.length, 4)
  })

  it('targetDuration 非数字返回 400 语义错误', async () => {
    const project = await projectService.getProject(projectId)
    assert.throws(
      () => editPlanService.buildPlan(project, { profile: 'fast', targetDuration: 'abc' }),
      /targetDuration 必须是有效数字/
    )
  })

  it('锁定镜头时长不被压缩', async () => {
    await projectService.updateProject(projectId, {
      shots: [shot('s1', 0, { duration: 7, locked: true }), shot('s2', 1), shot('s3', 2), shot('s4', 3)],
    })
    const project = await projectService.getProject(projectId)
    const plan = editPlanService.buildPlan(project, { profile: 'fast', targetDuration: 12 })
    const locked = plan.shots.find((s) => s.shotId === 's1')
    assert.equal(locked.duration, 7)
    assert.match(locked.reason, /锁定/)
  })

  it('存在 BPM 时切点对齐 beat grid 并标明来源', async () => {
    const project = await projectService.getProject(projectId)
    const plan = editPlanService.buildPlan(project, { profile: 'narrative', targetDuration: 16, bgmId: 'tension-01' })
    assert.equal(plan.bpm, 140)
    assert.ok(plan.beatGrid > 0)
    const flexible = plan.shots.filter((s) => !s.reason.includes('锁定'))
    for (const item of flexible) {
      const ratio = item.duration / plan.beatGrid
      assert.ok(Math.abs(ratio - Math.round(ratio)) < 0.02, `${item.shotId} 未对齐 beat grid`)
    }
  })

  it('generatePlan 持久化，clearPlan 清除且不修改原镜头', async () => {
    const plan = await editPlanService.generatePlan(projectId, { profile: 'narrative', targetDuration: 15 })
    const project = await projectService.getProject(projectId)
    assert.equal(project.editPlan.id, plan.id)
    const durationsBefore = project.shots.map((s) => s.duration)
    await editPlanService.clearPlan(projectId)
    const afterClear = await projectService.getProject(projectId)
    assert.equal(afterClear.editPlan, null)
    assert.deepEqual(afterClear.shots.map((s) => s.duration), durationsBefore)
  })

  it('POST /api/edit-plans/generate 返回 201，GET 读取方案', async () => {
    const generated = await request(app)
      .post('/api/edit-plans/generate')
      .send({ projectId, profile: 'fast', targetDuration: 12 })
    assert.equal(generated.status, 201)
    const readback = await request(app).get(`/api/edit-plans/${projectId}`)
    assert.equal(readback.status, 200)
    assert.equal(readback.body.id, generated.body.id)
  })

  it('renderPlan 真实渲染 MP4（硬切路径）', async () => {
    const videosDir = path.join(STORAGE_DIR, 'videos')
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true })
    const v1 = path.join(videosDir, 'r34-a.mp4')
    const v2 = path.join(videosDir, 'r34-b.mp4')
    await ffmpeg.generatePlaceholder({ outputPath: v1, duration: 2, resolution: '720p' })
    await ffmpeg.generatePlaceholder({ outputPath: v2, duration: 2, resolution: '720p' })
    await projectService.updateProject(projectId, {
      targetDuration: 4,
      shots: [
        shot('r34-a', 0, { duration: 2, videoUrl: '/storage/videos/r34-a.mp4' }),
        shot('r34-b', 1, { duration: 2, videoUrl: '/storage/videos/r34-b.mp4' }),
      ],
    })
    await editPlanService.generatePlan(projectId, { profile: 'narrative', targetDuration: 3 })
    const result = await editPlanService.renderPlan(projectId)
    assert.ok(result.outputUrl.startsWith('/storage/exports/'))
    const outputPath = path.join(STORAGE_DIR, result.outputUrl.replace('/storage/', ''))
    assert.ok(fs.existsSync(outputPath))
    assert.equal(result.transitionApplied, 'cut')
    assert.equal(result.hasAudio, true)
    assert.ok(fs.statSync(outputPath).size > 1000)
  })

  it('xfade 能力探测返回布尔值', async () => {
    const supported = await editPlanService.supportsXfade()
    assert.equal(typeof supported, 'boolean')
  })

  it('他人项目的剪辑方案接口返回 404', async () => {
    const other = await projectService.createProject({ name: '他人剪辑项目', userId: 'other-edit-user' })
    try {
      const res = await request(app)
        .post('/api/edit-plans/generate')
        .send({ projectId: other.id, profile: 'fast', targetDuration: 5 })
      assert.equal(res.status, 404)
    } finally {
      await projectService.deleteProject(other.id)
    }
  })

  it('重启 hydrate 后 editPlan 不丢', async () => {
    await editPlanService.generatePlan(projectId, { profile: 'narrative', targetDuration: 6 })
    const fresh = new ProjectService()
    const project = await fresh.getProject(projectId)
    assert.ok(project.editPlan)
    assert.equal(project.editPlan.profile, 'narrative')
  })

  it('fade 方案使用 xfade，或在不支持时如实降级并标记', async () => {
    const supported = await editPlanService.supportsXfade()
    await editPlanService.generatePlan(projectId, { profile: 'fast', targetDuration: 3 })
    const result = await editPlanService.renderPlan(projectId)
    if (supported) {
      assert.equal(result.transitionApplied, 'xfade')
      assert.equal(result.transitionFallback, false)
    } else {
      assert.equal(result.transitionApplied, 'cut')
      assert.equal(result.transitionFallback, true)
    }
  })

  it('目标时长大于源镜头时长时，渲染会循环延长而不是停在源时长', async () => {
    const videosDir = path.join(STORAGE_DIR, 'videos')
    const v1 = path.join(videosDir, 'r34-short-a.mp4')
    const v2 = path.join(videosDir, 'r34-short-b.mp4')
    await ffmpeg.generatePlaceholder({ outputPath: v1, duration: 1, resolution: '720p' })
    await ffmpeg.generatePlaceholder({ outputPath: v2, duration: 1, resolution: '720p' })
    await projectService.updateProject(projectId, {
      targetDuration: 4,
      shots: [
        shot('r34-short-a', 0, { duration: 1, videoUrl: '/storage/videos/r34-short-a.mp4' }),
        shot('r34-short-b', 1, { duration: 1, videoUrl: '/storage/videos/r34-short-b.mp4' }),
      ],
      audioConfig: { bgmId: null, sfxIds: [], voiceVolume: 1, bgmVolume: 0.3, sfxVolume: 0.5 },
    })
    await editPlanService.generatePlan(projectId, { profile: 'narrative', targetDuration: 4 })
    const result = await editPlanService.renderPlan(projectId)
    assert.ok(result.duration >= 3.5, `expected >=3.5s, got ${result.duration}`)
  })
})
