import { Router } from 'express'
import { marketplaceService } from '../services/marketplaceService.js'

const router = Router()

// 素材包列表
router.get('/packs', (req, res) => {
  res.json(marketplaceService.listPacks({ type: req.query.type, sort: req.query.sort }))
})

// 素材包详情
router.get('/packs/:packId', (req, res) => {
  try {
    res.json(marketplaceService.getPack(req.params.packId))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

// 购买 / 领取
router.post('/packs/:packId/purchase', (req, res) => {
  try {
    const r = marketplaceService.purchase(
      req.params.packId,
      req.body.userId || req.user?.id || 'default'
    )
    res.status(201).json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 我的资产
router.get('/my-assets', (req, res) => {
  res.json(marketplaceService.myAssets(req.query.userId || req.user?.id || 'default'))
})

export default router
