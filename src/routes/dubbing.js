import { Router } from 'express'
import { dubbingService } from '../services/dubbingService.js'
import { projectService } from '../services/projectService.js'
import { quotaService } from '../services/quotaService.js'

const router = Router()

// 生成配音和字幕
router.post('/generate', async (req, res) => {
  try {
    const { projectId, language, voiceId, speed, burnSubtitles, dialogueAssignments, pauseSeconds } = req.body
    const uid = req.user?.id || 'default'

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }

    const project = await projectService.getProject(projectId)

    // 估算配音时长（中文约4字/秒，英文约3词/秒）
    const lines = dubbingService.extractDialogueLines(project)
    const totalChars = lines.reduce((sum, l) => sum + l.text.length, 0)
    const estimatedSeconds = Math.max(1, totalChars / 4)

    // 额度检查
    const quota = quotaService.checkDubbingQuota(uid, estimatedSeconds)
    if (!quota.allowed) {
      return res.status(403).json({
        error: quota.reason,
        quota: { usedSeconds: quota.used, limitSeconds: quota.limit },
      })
    }

    const result = await dubbingService.generateDubbing({
      project,
      language: language || 'zh',
      voiceId: voiceId || 'zh_male_calm',
      speed: speed || 1.0,
      burnSubtitles: burnSubtitles !== false,
      dialogueAssignments: dialogueAssignments || undefined,
      pauseSeconds: pauseSeconds !== undefined ? pauseSeconds : 0.4,
    })

    // 消耗实际配音时长
    if (result.success && result.totalDuration) {
      quotaService.consumeDubbingQuota(uid, Math.ceil(result.totalDuration))
    }

    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取可用音色
router.get('/voices', async (_req, res) => {
  try {
    const voices = await dubbingService.getAvailableVoices()
    res.json({ voices })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 预览单句配音
router.post('/preview', async (req, res) => {
  try {
    const { text, language, voiceId, speed, projectId } = req.body
    if (!text) {
      return res.status(400).json({ error: 'text is required' })
    }

    // Phase 1: 若传了 projectId，则按项目级 Provider 配置预览
    let project = null
    if (projectId) {
      project = await projectService.getProject(projectId)
    }

    const result = await dubbingService.previewVoice({
      text,
      language: language || 'zh',
      voiceId: voiceId || 'zh_male_calm',
      speed: speed || 1.0,
      projectId: project?.id || null,
      userId: project?.userId || req.user?.id || null,
    })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
