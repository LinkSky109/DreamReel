import { Router } from 'express'
import { challengeService } from '../services/challengeService.js'

const router = Router()

// 挑战列表
router.get('/', (req, res) => {
  res.json(challengeService.listChallenges({ status: req.query.status }))
})

// 挑战详情（含作品排行）
router.get('/:challengeId', async (req, res) => {
  try {
    const detail = await challengeService.getChallengeDetail(req.params.challengeId)
    res.json(detail)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 参与挑战（创建项目）
router.post('/:challengeId/join', async (req, res) => {
  try {
    const r = await challengeService.joinChallenge(req.params.challengeId, {
      userId: req.body.userId || req.user?.id,
      name: req.body.name,
    })
    res.json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 投稿
router.post('/:challengeId/submit/:projectId', async (req, res) => {
  try {
    const r = await challengeService.submitToChallenge(
      req.params.challengeId,
      req.params.projectId
    )
    res.json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
