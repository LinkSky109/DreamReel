import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { imageService } from '../src/services/imageService.js'
import { storageService } from '../src/services/storageService.js'
import { projectService, ProjectService } from '../src/services/projectService.js'
import { quotaService } from '../src/services/quotaService.js'
import { getImageModelCatalog } from '../src/providers/imageProviderFactory.js'
import { videoService } from '../src/services/videoService.js'

const TEST_USER = 'r32-image-test'
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('R32 图片生成', () => {
  let projectId
  let shotId
  const createdAssetIds = []

  before(async () => {
    const project = await projectService.createProject({ name: 'R32 图片测试项目', userId: TEST_USER })
    projectId = project.id
    const hydrated = await projectService.getProject(projectId)
    const shot = hydrated.addShot({ description: '雨夜霓虹街头，主角回望', characterIds: [] })
    shotId = shot.id
    hydrated.characters = [{ id: 'r32-char', name: '主角', referenceImages: [] }]
    hydrated.scenes = [{ id: 'r32-scene', name: '雨夜街道', referenceImages: [] }]
    await projectService.updateProject(projectId, {
      shots: hydrated.shots,
      characters: hydrated.characters,
      scenes: hydrated.scenes,
    })
  })

  beforeEach(() => {
    // 每个用例重置测试用户图片额度，避免用例顺序影响
    storageService.data.usage[TEST_USER] = {}
  })

  after(async () => {
    for (const id of createdAssetIds) {
      try {
        imageService.deleteAsset(id, TEST_USER)
      } catch { /* ignore */ }
    }
    try {
      await projectService.deleteProject(projectId)
    } catch { /* ignore */ }
    storageService._flush()
  })

  async function generate(prompt = '雨夜霓虹街头', count = 1, userId = TEST_USER) {
    const result = await imageService.generateImages({
      projectId,
      userId,
      prompt,
      count,
      aspectRatio: '16:9',
      style: 'cinematic',
    })
    for (const asset of result.assets) createdAssetIds.push(asset.id)
    return result
  }

  it('provider 目录包含 mock/openai，且 mock 默认可用', () => {
    const catalog = getImageModelCatalog()
    const ids = catalog.map((p) => p.id).sort()
    assert.deepEqual(ids, ['mock', 'openai'])
    assert.equal(catalog.find((p) => p.id === 'mock').configured, true)
    assert.equal(catalog.find((p) => p.id === 'mock').realGeneration, false)
    assert.equal(catalog.find((p) => p.id === 'openai').realGeneration, true)
  })

  it('生成单张图片返回 completed 资产且文件是真实 PNG', async () => {
    const result = await generate('雨夜霓虹街头', 1)
    assert.equal(result.count, 1)
    assert.equal(result.provider, 'mock')
    const asset = result.assets[0]
    assert.equal(asset.status, 'completed')
    assert.equal(asset.aspectRatio, '16:9')
    assert.equal(asset.size, '1024x576')
    assert.ok(asset.url.startsWith('/storage/images/'))
    assert.ok(fs.existsSync(asset.filePath))
    const header = fs.readFileSync(asset.filePath).subarray(0, 8)
    assert.deepEqual(header, PNG_MAGIC)
    assert.equal(typeof asset.textRendered, 'boolean')
  })

  it('生成结果持久化到 imageAssets，可通过 getAsset 读取', async () => {
    const result = await generate('城市天台', 1)
    const assetId = result.assets[0].id
    assert.ok(storageService.get('imageAssets')[assetId])
    assert.equal(imageService.getAsset(assetId, TEST_USER).id, assetId)
  })

  it('一次生成 3 张返回 3 个独立资产', async () => {
    const result = await generate('深海宫殿', 3)
    assert.equal(result.count, 3)
    assert.equal(new Set(result.assets.map((a) => a.id)).size, 3)
    assert.ok(result.assets.every((a) => a.status === 'completed'))
  })

  it('prompt 为空返回 400 语义错误', async () => {
    await assert.rejects(() => generate('   ', 1), /prompt 不能为空/)
  })

  it('数量超出 1-4 返回 400 语义错误', async () => {
    await assert.rejects(() => generate('测试', 0), /count 必须在 1-4/)
    await assert.rejects(() => generate('测试', 5), /count 必须在 1-4/)
  })

  it('不支持的宽高比返回 400 语义错误', async () => {
    await assert.rejects(
      () => imageService.generateImages({ projectId, userId: TEST_USER, prompt: '测试', aspectRatio: '3:2' }),
      /不支持的 aspectRatio/
    )
  })

  it('不支持的风格返回 400 语义错误', async () => {
    await assert.rejects(
      () => imageService.generateImages({ projectId, userId: TEST_USER, prompt: '测试', style: 'cyberpunk' }),
      /不支持的 style/
    )
  })

  it('项目不存在返回 Project not found', async () => {
    await assert.rejects(
      () => imageService.generateImages({ projectId: 'no-such-project', userId: TEST_USER, prompt: '测试' }),
      /Project not found/
    )
  })

  it('内容审核拒绝时不生成资产', async () => {
    await assert.rejects(() => generate('色情内容测试', 1), /内容审核未通过/)
  })

  it('图片额度不足时拒绝且不落资产', async () => {
    const quotaUser = 'r32-quota-user'
    storageService.data.usage[quotaUser] = {}
    const quotaProject = await projectService.createProject({ name: 'R32 额度测试', userId: quotaUser })
    try {
      quotaService.consumeImageQuota(quotaUser, 10)
      const before = imageService.listAssets({ userId: quotaUser }).total
      await assert.rejects(
        () => imageService.generateImages({ projectId: quotaProject.id, userId: quotaUser, prompt: '超出额度', count: 1 }),
        /额度不足/
      )
      const afterCount = imageService.listAssets({ userId: quotaUser }).total
      assert.equal(afterCount, before)
    } finally {
      await projectService.deleteProject(quotaProject.id)
    }
  })

  it('图片可回填为镜头参考图并自动去重', async () => {
    const result = await generate('镜头参考图', 1)
    const asset = result.assets[0]
    const first = await imageService.applyAsset(asset.id, {
      targetType: 'shot',
      targetId: shotId,
      projectId,
      userId: TEST_USER,
    })
    assert.ok(first.referenceImages.includes(asset.url))
    const second = await imageService.applyAsset(asset.id, {
      targetType: 'shot',
      targetId: shotId,
      projectId,
      userId: TEST_USER,
    })
    assert.equal(second.referenceImages.filter((u) => u === asset.url).length, 1)
  })

  it('图片可回填为角色参考图', async () => {
    const result = await generate('角色定妆', 1)
    const asset = result.assets[0]
    const applied = await imageService.applyAsset(asset.id, {
      targetType: 'character',
      targetId: 'r32-char',
      projectId,
      userId: TEST_USER,
    })
    assert.ok(applied.referenceImages.includes(asset.url))
  })

  it('图片可回填为项目内场景参考图', async () => {
    const result = await generate('场景概念图', 1)
    const asset = result.assets[0]
    const applied = await imageService.applyAsset(asset.id, {
      targetType: 'scene',
      targetId: 'r32-scene',
      projectId,
      userId: TEST_USER,
    })
    assert.ok(applied.referenceImages.includes(asset.url))
  })

  it('未知 targetType / 目标对象返回明确错误', async () => {
    const result = await generate('错误目标测试', 1)
    const asset = result.assets[0]
    await assert.rejects(
      () => imageService.applyAsset(asset.id, { targetType: 'unknown', targetId: 'x', projectId, userId: TEST_USER }),
      /不支持的 targetType/
    )
    await assert.rejects(
      () => imageService.applyAsset(asset.id, { targetType: 'shot', targetId: 'no-shot', projectId, userId: TEST_USER }),
      /Shot not found/
    )
  })

  it('未知资产返回 Image asset not found', async () => {
    await assert.rejects(() => imageService.applyAsset('img_missing', { targetType: 'shot', targetId: shotId, projectId, userId: TEST_USER }), /Image asset not found/)
  })

  it('重启 hydrate 后镜头参考图不丢', async () => {
    const result = await generate('持久化参考图', 1)
    const asset = result.assets[0]
    await imageService.applyAsset(asset.id, { targetType: 'shot', targetId: shotId, projectId, userId: TEST_USER })
    const fresh = new ProjectService()
    const hydrated = await fresh.getProject(projectId)
    const shot = hydrated.getShot(shotId)
    assert.ok(shot.referenceImages.includes(asset.url))
  })

  it('回填后的镜头参考图会真实传给视频 provider', async () => {
    const result = await generate('视频链路参考图', 1)
    const asset = result.assets[0]
    await imageService.applyAsset(asset.id, { targetType: 'shot', targetId: shotId, projectId, userId: TEST_USER })

    const project = await projectService.getProject(projectId)
    const originalProvider = videoService.provider
    const originalPoll = videoService.pollTaskStatus
    let capturedReferenceImages = null
    videoService.provider = {
      name: 'stub',
      supportsReferenceImages: () => true,
      generateVideo: async (params) => {
        capturedReferenceImages = params.referenceImages
        return { taskId: 'stub-task' }
      },
    }
    videoService.pollTaskStatus = async (taskId) => {
      const task = videoService.activeTasks.get(taskId)
      if (task) {
        task.resolve({ videoUrl: 'mock://done.mp4', status: 'completed', consistencyScore: 0.9 })
        videoService.activeTasks.delete(taskId)
      }
    }

    try {
      await videoService.generateShot({ projectId, shotId, prompt: '参考图链路测试', project })
      assert.ok(Array.isArray(capturedReferenceImages))
      assert.ok(capturedReferenceImages.includes(asset.url))
    } finally {
      videoService.provider = originalProvider
      videoService.pollTaskStatus = originalPoll
      videoService.activeTasks.clear()
    }
  })

  it('删除资产会同时删除文件与记录', async () => {
    const result = await generate('待删除图片', 1)
    const asset = result.assets[0]
    assert.ok(fs.existsSync(asset.filePath))
    imageService.deleteAsset(asset.id, TEST_USER)
    assert.equal(fs.existsSync(asset.filePath), false)
    assert.equal(storageService.get('imageAssets')[asset.id], undefined)
  })

  it('图片资产按用户隔离：他人无法读取、删除或回填', async () => {
    const result = await generate('私有资产', 1)
    const asset = result.assets[0]
    assert.throws(() => imageService.getAsset(asset.id, 'other-user'), /not found/)
    assert.throws(() => imageService.deleteAsset(asset.id, 'other-user'), /not found/)
    await assert.rejects(
      () => imageService.applyAsset(asset.id, { targetType: 'shot', targetId: shotId, projectId, userId: 'other-user' }),
      /not found/
    )
    assert.equal(imageService.listAssets({ userId: 'other-user' }).total, 0)
  })
})
