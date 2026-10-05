import { Router } from 'express'
import { apiKeyService } from '../services/apiKeyService.js'

const router = Router()

// 创建（完整 key 仅返回一次）
router.post('/', async (req, res) => {
  try {
    const result = await apiKeyService.createKey({
      name: req.body.name,
      userId: req.body.userId || req.user?.id || 'default',
      scopes: req.body.scopes,
    })
    res.status(201).json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 列表
router.get('/', (req, res) => {
  res.json(apiKeyService.listKeys({ userId: req.query.userId || req.user?.id }))
})

// 吊销
router.delete('/:id', async (req, res) => {
  try {
    res.json(apiKeyService.revokeKey(req.params.id, req.user?.id))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
