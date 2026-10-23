import { describe, it, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.5：video jobs 持久化、幂等、租约恢复与取消。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-video-jobs-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')
const { projectService } = await import('../src/services/projectService.js')
const { getPool } = await import('../src/db/client.js')
const { createVideoJobRepository } = await import('../src/repositories/videoJobRepository.js')
const { createVideoJobWorker } = await import('../src/workers/videoJobWorker.js')

const pool = getPool()
const repo = createVideoJobRepository(pool)

function register(prefix) {
  return authService.register({
    username: `${prefix}${Date.now()}${Math.random().toString(16).slice(2, 5)}`,
    email: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 5)}@example.com`,
    password: 'secret-123',
  })
}

async function makeProject(userId, shotCount = 2) {
  const project = await projectService.createProject({ name: 'job 项目', userId })
  const shots = Array.from({ length: shotCount }, (_, i) => ({
    id: `shot-${project.id}-${i}`,
    description: `镜头 ${i}`,
    status: 'pending',
    duration: 1,
  }))
  await projectService.updateProject(project.id, { shots })
  return project
}

beforeEach(async () => {
  await pool.query('DELETE FROM video_jobs')
})

after(async () => {
  await pool.query('DELETE FROM video_jobs').catch(() => {})
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('video jobs API', () => {
  it('创建幂等、查询、跨用户 403、取消与重复取消 409', async () => {
    const owner = register('jobowner')
    const other = register('jobother')
    const project = await makeProject(owner.user.id, 2)

    const first = await request(app)
      .post('/api/video/jobs')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', 'idem-1')
      .send({ projectId: project.id })
    assert.equal(first.status, 202, JSON.stringify(first.body))
    assert.equal(first.body.replayed, false)
    const jobId = first.body.jobId

    const replay = await request(app)
      .post('/api/video/jobs')
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', 'idem-1')
      .send({ projectId: project.id })
    assert.equal(replay.status, 200)
    assert.equal(replay.body.replayed, true)
    assert.equal(replay.body.jobId, jobId)
    assert.equal(storageService.getUsage(owner.user.id).daily.videoGenerations, 2)

    const detail = await request(app)
      .get(`/api/video/jobs/${jobId}`)
      .set('Authorization', `Bearer ${owner.token}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.total, 2)
    assert.equal(detail.body.status, 'queued')

    const forbidden = await request(app)
      .get(`/api/video/jobs/${jobId}`)
      .set('Authorization', `Bearer ${other.token}`)
    assert.equal(forbidden.status, 403)

    const cancel = await request(app)
      .post(`/api/video/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
    assert.equal(cancel.status, 200)
    assert.equal(cancel.body.status, 'canceled')

    const again = await request(app)
      .post(`/api/video/jobs/${jobId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
    assert.equal(again.status, 409)

    const list = await request(app)
      .get(`/api/video/jobs?projectId=${project.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    assert.equal(list.status, 200)
    assert.equal(list.body.total, 1)
  })

  it('额度不足返回 429', async () => {
    const owner = register('jobquota')
    const project = await makeProject(owner.user.id, 6)
    const res = await request(app)
      .post('/api/video/jobs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ projectId: project.id })
    assert.equal(res.status, 429, JSON.stringify(res.body))
    assert.equal(res.body.code, 'QUOTA_EXCEEDED')
  })
})

describe('video jobs 租约与恢复', () => {
  it('租约过期回到队列，超过最大尝试次数标记失败', async () => {
    const owner = register('joblease')
    const project = await makeProject(owner.user.id, 1)
    const job = await repo.create({
      userId: owner.user.id,
      projectId: project.id,
      shotIds: [project.shots[0].id],
      total: 1,
      maxAttempts: 2,
    })

    const claimed = await repo.claimNext('w1', -1000)
    assert.equal(claimed.id, job.id)
    assert.equal(claimed.status, 'running')
    assert.equal(claimed.attempt, 1)

    const recovered = await repo.recoverExpired()
    assert.deepEqual(recovered.requeued, [job.id])

    const claimedAgain = await repo.claimNext('w2', -1000)
    assert.equal(claimedAgain.attempt, 2)

    await repo.recoverExpired()
    const failed = await repo.findById(job.id)
    assert.equal(failed.status, 'failed')
    assert.equal(failed.errorCode, 'LEASE_EXPIRED')
  })

  it('worker 消费任务并写入进度与镜头结果', async () => {
    const owner = register('jobworker')
    const project = await makeProject(owner.user.id, 1)
    const { videoJobService } = await import('../src/services/videoJobService.js')
    const { job } = await videoJobService.createJob({
      userId: owner.user.id,
      project,
      shotIds: [project.shots[0].id],
    })

    const worker = createVideoJobWorker({
      repo,
      executeShot: async () => ({ videoUrl: 'mock://done.mp4', consistencyScore: 0.9 }),
    })
    const processed = await worker.tick()
    assert.equal(processed, job.id)

    const done = await repo.findById(job.id)
    assert.equal(done.status, 'succeeded')
    assert.equal(done.completed, 1)
    assert.equal(done.total, 1)

    const updated = await projectService.getProject(project.id)
    assert.equal(updated.shots[0].status, 'completed')
    assert.equal(updated.shots[0].videoUrl, 'mock://done.mp4')
  })
})
