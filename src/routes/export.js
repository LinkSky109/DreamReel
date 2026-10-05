import { Router } from 'express'
import { projectService } from '../services/projectService.js'
import { dubbingService } from '../services/dubbingService.js'
import { videoCompositingService } from '../services/videoCompositingService.js'
import { exportHistoryService } from '../services/exportHistoryService.js'
import { collaborationService } from '../services/collaborationService.js'
import logger from '../utils/logger.js'

const router = Router()

/**
 * 导出项目成片
 * POST /api/export/project/:projectId
 * Body: { burnSubtitles: true, language: 'zh', voiceId: 'zh_male_calm' }
 */
router.post('/project/:projectId', async (req, res) => {
  const { projectId } = req.params
  const { burnSubtitles = true, language = 'zh', voiceId = 'zh_male_calm', speed = 1.0 } = req.body

  try {
    const project = await projectService.getProject(projectId)

    // 检查是否有已完成的镜头
    const completedShots = (project.shots || []).filter((s) => s.status === 'completed' && s.videoUrl)
    if (completedShots.length === 0) {
      return res.status(400).json({
        error: '没有已完成的镜头',
        message: '请先在「镜头」标签生成视频，再导出成片',
      })
    }

    // 立即返回，后台异步处理
    res.status(202).json({
      status: 'processing',
      message: '正在合成成片，请稍候...',
      shotCount: completedShots.length,
    })

    // 后台执行导出
    ;(async () => {
      try {
        // 1. 生成配音
        let dubbingResult = null
        try {
          dubbingResult = await dubbingService.generateDubbing({
            project,
            language,
            voiceId,
            speed,
            burnSubtitles,
          })
          if (!dubbingResult.success) {
            logger.info('No dialogue found, exporting without audio')
            dubbingResult = null
          }
        } catch (dubbingError) {
          logger.warn('Dubbing generation failed during export, continuing without audio:', dubbingError.message)
        }

        // 2. 合成视频
        const result = await videoCompositingService.exportProject(project, {
          burnSubtitles,
          dubbingResult,
        })

        logger.info(`Export completed for project ${projectId}: ${result.outputUrl}`)
        // 注意：异步任务结果可通过轮询或 WebSocket 获取，MVP 阶段记录日志
      } catch (error) {
        logger.error(`Export failed for project ${projectId}:`, error.message)
      }
    })()
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 同步导出（等待完成后返回结果，用于测试和小项目）
 * POST /api/export/project/:projectId/sync
 */
router.post('/project/:projectId/sync', async (req, res) => {
  const { projectId } = req.params
  const { burnSubtitles = true, language = 'zh', voiceId = 'zh_male_calm', speed = 1.0 } = req.body

  try {
    const project = await projectService.getProject(projectId)

    const completedShots = (project.shots || []).filter((s) => s.status === 'completed' && s.videoUrl)
    if (completedShots.length === 0) {
      return res.status(400).json({
        error: '没有已完成的镜头',
        message: '请先生成视频再导出',
      })
    }

    // 生成配音
    let dubbingResult = null
    try {
      dubbingResult = await dubbingService.generateDubbing({
        project,
        language,
        voiceId,
        speed,
        burnSubtitles,
      })
      if (!dubbingResult.success) {
        dubbingResult = null
      }
    } catch (e) {
      logger.warn('Dubbing failed, exporting without audio:', e.message)
    }

    // 合成
    const result = await videoCompositingService.exportProject(project, {
      burnSubtitles,
      dubbingResult,
    })

    // 记录导出历史
    exportHistoryService.recordExport(projectId, {
      outputPath: result.outputPath,
      outputUrl: result.outputUrl,
      duration: result.duration,
      shotCount: completedShots.length,
      hasAudio: result.hasAudio,
      hasSubtitles: result.hasSubtitles,
    })

    // 记录活动
    collaborationService.addActivity(projectId, {
      type: 'export',
      message: `导出成片完成（${Math.round(result.duration)}秒）`,
    })

    res.json({
      status: 'completed',
      ...result,
      downloadUrl: result.outputUrl,
    })
  } catch (error) {
    logger.error('Sync export failed:', error.message)
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取项目导出历史
 * GET /api/export/project/:projectId/history
 */
router.get('/project/:projectId/history', (req, res) => {
  try {
    const history = exportHistoryService.getExportHistory(req.params.projectId)
    res.json({ total: history.length, items: history })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
