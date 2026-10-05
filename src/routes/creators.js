import { Router } from 'express'
import { creatorService } from '../services/creatorService.js'

const router = Router()

// R11：获取创作者主页
router.get('/:userId', async (req, res) => {
  try {
    const page = await creatorService.getCreatorPage(req.params.userId)
    // 非公开主页仅本人可看（半自动化：返回数据，前端控制）
    res.json(page)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// R11：更新创作者资料
router.put('/:userId', async (req, res) => {
  try {
    const profile = await creatorService.updateProfile(req.params.userId, req.body)
    res.json({ success: true, profile })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
