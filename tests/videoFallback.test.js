import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { VideoService } from '../src/services/videoService.js'
import { metricsDir } from '../src/services/metricsStore.js'

function makeService(chain) {
  const svc = new VideoService()
  // 立即完成轮询（测试重点在提交阶段回退）
  svc.pollTaskStatus = async (taskId) => {
    const t = svc.activeTasks.get(taskId)
    if (t) {
      t.resolve({ videoUrl: '/storage/videos/ok.mp4', status: 'completed', consistencyScore: 0.7 })
      svc.activeTasks.delete(taskId)
    }
  }
  svc._videoChain = () => chain
  return svc
}

function videoProvider(name, behavior) {
  return {
    name,
    model: `${name}-m`,
    recordsOwnMetrics: false,
    supportsReferenceImages: () => true,
    async generateVideo() {
      if (behavior === 'ok') return { taskId: `t-${name}` }
      throw new Error(behavior)
    },
  }
}

describe('videoService 提交阶段回退', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('主提交失败(可切换) → 回退成功，activeTasks 用实际提交的 provider', async () => {
    const svc = makeService([videoProvider('comfyui', 'connect ECONNREFUSED'), videoProvider('seedance', 'ok')])
    const res = await svc.generateShot({ projectId: 'p1', shotId: 's1', prompt: 'x', project: { userId: 'u1' } })
    assert.strictEqual(res.videoUrl, '/storage/videos/ok.mp4')
  })

  it('主失败不可切换(400) → 不回退，抛错', async () => {
    let goodCalled = false
    const good = videoProvider('seedance', 'ok')
    good.generateVideo = async () => { goodCalled = true; return { taskId: 't' } }
    const svc = makeService([videoProvider('comfyui', 'ComfyUI /prompt 400: bad'), good])
    await assert.rejects(() => svc.generateShot({ projectId: 'p', shotId: 's', prompt: 'x', project: { userId: 'u' } }), /400/)
    assert.strictEqual(goodCalled, false)
  })

  it('全失败 → 抛最后一次错误', async () => {
    const svc = makeService([videoProvider('comfyui', 'ECONNREFUSED'), videoProvider('seedance', '503 down')])
    await assert.rejects(() => svc.generateShot({ projectId: 'p', shotId: 's', prompt: 'x', project: { userId: 'u' } }), /503/)
  })
})
