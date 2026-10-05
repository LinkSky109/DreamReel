import { Router } from 'express'
import { imageService } from '../services/imageService.js'
import { getImageModelCatalog, getAvailableProviders } from '../providers/imageProviderFactory.js'
import config from '../config/index.js'

const router = Router()

function sendError(res, error) {
  const status = error.statusCode || 400
  res.status(status).json({ error: error.message })
}

function publicAsset(asset) {
  if (!asset) return asset
  const safe = { ...asset }
  delete safe.filePath
  return safe
}

function publicResult(result) {
  if (!result) return result
  if (Array.isArray(result.assets)) {
    return { ...result, assets: result.assets.map(publicAsset) }
  }
  if (result.asset) {
    return { ...result, asset: publicAsset(result.asset) }
  }
  return result
}

// 生成图片（1-4 张）
router.post('/generate', async (req, res) => {
  try {
    const { projectId, prompt, aspectRatio, style, count = 1 } = req.body
    const result = await imageService.generateImages({
      projectId,
      userId: req.user?.id || 'default',
      prompt,
      aspectRatio,
      style,
      count,
    })
    res.status(201).json(publicResult(result))
  } catch (error) {
    sendError(res, error)
  }
})

// 图片资产列表
router.get('/assets', (req, res) => {
  try {
    const { projectId, status } = req.query
    const result = imageService.listAssets({
      projectId: projectId || null,
      userId: req.user?.id || 'default',
      status: status || null,
    })
    res.json({ ...result, items: result.items.map(publicAsset) })
  } catch (error) {
    sendError(res, error)
  }
})

// 单个资产
router.get('/assets/:id', (req, res) => {
  try {
    res.json(publicAsset(imageService.getAsset(req.params.id, req.user?.id || 'default')))
  } catch (error) {
    sendError(res, error)
  }
})

// 删除资产
router.delete('/assets/:id', (req, res) => {
  try {
    res.json(imageService.deleteAsset(req.params.id, req.user?.id || 'default'))
  } catch (error) {
    sendError(res, error)
  }
})

// 回填为镜头 / 角色 / 场景参考图
router.post('/assets/:id/apply', async (req, res) => {
  try {
    const result = await imageService.applyAsset(req.params.id, {
      ...req.body,
      userId: req.user?.id || 'default',
    })
    res.json(publicResult(result))
  } catch (error) {
    sendError(res, error)
  }
})

// Provider 状态与模型目录
router.get('/providers', (_req, res) => {
  res.json({
    current: config.image.provider,
    available: getAvailableProviders(),
    models: getImageModelCatalog(),
  })
})

// 图片资产统计
router.get('/stats', (_req, res) => {
  res.json(imageService.getStats())
})

export default router
