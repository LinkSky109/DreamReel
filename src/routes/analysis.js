import { Router } from 'express'
import { filmAnalysisService } from '../services/filmAnalysisService.js'
import { projectService } from '../services/projectService.js'
import logger from '../utils/logger.js'

const router = Router()

// 分析项目（异步触发，立即返回）
router.post('/project/:projectId', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)

    if (!project.shots || project.shots.length === 0) {
      return res.status(400).json({ error: '项目还没有镜头，请先生成剧本' })
    }

    // 立即返回，后台执行分析
    res.status(202).json({
      status: 'analyzing',
      projectId: project.id,
      message: 'AI 影评分析已启动',
    })

    // 后台执行分析并缓存结果
    filmAnalysisService
      .analyzeProject(project)
      .then((analysis) => {
        // 存储到项目中
        projectService.updateProject(project.id, {
          lastAnalysis: analysis,
        })
        logger.info(`Film analysis completed for project ${project.id}, score: ${analysis.overallScore}`)
      })
      .catch((error) => {
        logger.error(`Film analysis failed for project ${project.id}:`, error.message)
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 同步分析（等待结果返回，适合小项目）
router.post('/project/:projectId/sync', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)

    if (!project.shots || project.shots.length === 0) {
      return res.status(400).json({ error: '项目还没有镜头，请先生成剧本' })
    }

    const analysis = await filmAnalysisService.analyzeProject(project)

    // 缓存到项目
    await projectService.updateProject(project.id, {
      lastAnalysis: analysis,
    })

    logger.info(`Film analysis completed for project ${project.id}, score: ${analysis.overallScore}`)
    res.json(analysis)
  } catch (error) {
    logger.error('Film analysis failed:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// 获取最近一次分析结果
router.get('/project/:projectId', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)
    if (!project.lastAnalysis) {
      return res.status(404).json({ error: '还没有分析结果，请先触发分析' })
    }
    res.json(project.lastAnalysis)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
