import { Router } from 'express'
import { apiKeyService } from '../services/apiKeyService.js'
import { authRequired } from '../middleware/auth.js'
import { requirePermission } from '../middleware/authorize.js'
import { PERMISSIONS } from '../security/roles.js'

const router = Router()

// API Key 管理必须登录；身份只来自 req.user，忽略 body/query 中的 userId。
router.use(authRequired)

// 创建（完整 key 仅返回一次）
router.post('/', requirePermission(PERMISSIONS.API_KEY_MANAGE), async (req, res) => {
  try {
    const result = await apiKeyService.createKey({
      name: req.body?.name,
      userId: req.user.id,
      scopes: req.body?.scopes,
    })
    res.status(201).json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 列表（只返回本人）
router.get('/', (req, res) => {
  res.json(apiKeyService.listKeys({ userId: req.user.id }))
})

// 吊销（只能吊销本人）
router.delete('/:id', async (req, res) => {
  try {
    res.json(apiKeyService.revokeKey(req.params.id, req.user.id))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
