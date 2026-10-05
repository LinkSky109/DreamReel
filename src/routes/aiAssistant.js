import { Router } from 'express'
import { aiAssistantService } from '../services/aiAssistantService.js'

const router = Router()

/**
 * 获取快捷操作列表
 */
router.get('/quick-actions', (req, res) => {
  try {
    const actions = aiAssistantService.getQuickActions()
    res.json({ actions })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取项目对话历史
 */
router.get('/conversation/:projectId', (req, res) => {
  try {
    const conversation = aiAssistantService.getConversation(req.params.projectId)
    res.json({ conversation, total: conversation.length })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 发送消息
 */
router.post('/chat/:projectId', async (req, res) => {
  try {
    const { message, userId } = req.body
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '消息内容不能为空' })
    }
    const response = await aiAssistantService.sendMessage(req.params.projectId, message, { userId })
    res.json(response)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 执行快捷操作
 */
router.post('/quick-action/:projectId', async (req, res) => {
  try {
    const { actionId, userId } = req.body
    if (!actionId) {
      return res.status(400).json({ error: 'actionId 不能为空' })
    }
    const response = await aiAssistantService.runQuickAction(req.params.projectId, actionId, { userId })
    res.json(response)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 清空对话
 */
router.delete('/conversation/:projectId', (req, res) => {
  try {
    const result = aiAssistantService.clearConversation(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
