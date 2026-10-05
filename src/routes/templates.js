import { Router } from 'express'
import { templateService } from '../services/templateService.js'
import { projectService } from '../services/projectService.js'
import { scriptService } from '../services/scriptService.js'
import logger from '../utils/logger.js'

const router = Router()

// 列出所有模板
router.get('/', (req, res) => {
  try {
    const { category, search, type } = req.query
    const templates = templateService.listTemplates({ category, search, type })
    res.json({ total: templates.length, items: templates })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取用户创建的模板
router.get('/user/mine', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const templates = templateService.getUserTemplates(userId)
    res.json({ total: templates.length, items: templates })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 从项目创建模板
router.post('/user/create-from-project', async (req, res) => {
  try {
    const { projectId, name, description, category, icon, tags, userId } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId 不能为空' })
    }
    const project = await projectService.getProject(projectId)
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }
    const template = templateService.createTemplateFromProject(project, {
      name,
      description,
      category,
      icon,
      tags,
      userId: userId || 'default',
    })
    logger.info(`Template created from project ${projectId}: ${template.id}`)
    res.status(201).json(template)
  } catch (error) {
    logger.error('Failed to create template from project:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// 删除用户模板
router.delete('/user/:templateId', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const result = templateService.deleteUserTemplate(req.params.templateId, userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取模板分类
router.get('/categories', (req, res) => {
  try {
    const categories = templateService.listCategories()
    res.json({ items: categories })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取单个模板
router.get('/:templateId', (req, res) => {
  try {
    const template = templateService.getTemplate(req.params.templateId)
    res.json(template)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// 从模板创建项目（可选：自动生成剧本）
router.post('/:templateId/create', async (req, res) => {
  try {
    const { name, idea, targetDuration, style, platform, autoGenerateScript, userId } = req.body
    const params = templateService.buildProjectFromTemplate(req.params.templateId, {
      name,
      idea,
      targetDuration,
      style,
      platform,
    })

    const project = await projectService.createProject({
      name: params.name,
      targetDuration: params.targetDuration,
      style: params.style,
      platform: params.platform,
      userId: userId || 'default',
    })

    // 记录模板来源
    project.templateId = params.templateId
    await projectService.updateProject(project.id, { templateId: params.templateId })

    let scriptResult = null
    if (autoGenerateScript) {
      scriptResult = await scriptService.generateScript({
        idea: params.idea,
        targetDuration: params.targetDuration,
        style: params.style,
        projectId: project.id,
      })
      // 同步角色到项目
      const characters = (scriptResult.characters || []).map((c) => ({
        ...c,
        projectId: project.id,
        isLocked: false,
      }))
      const charIdByName = new Map(characters.map((c) => [c.name, c.id]))

      // 同步镜头到项目（关联角色 id）
      const shots = scriptResult.shots.map((shot, index) => {
        const characterIds = []
        for (const [name, cid] of charIdByName.entries()) {
          if ((shot.description || '').includes(name) || (shot.dialogue || '').includes(name)) {
            characterIds.push(cid)
          }
        }
        return {
          ...shot,
          projectId: project.id,
          index,
          characterIds: shot.characterIds?.length ? shot.characterIds : characterIds,
        }
      })
      await projectService.updateProject(project.id, {
        script: scriptResult,
        characters,
        shots,
      })
      logger.info(`Script auto-generated for template project: ${project.id}`)
    }

    logger.info(`Project created from template ${req.params.templateId}: ${project.id}`)
    res.status(201).json({
      project: project.toJSON(),
      idea: params.idea,
      script: scriptResult,
    })
  } catch (error) {
    logger.error('Failed to create project from template:', error.message)
    res.status(400).json({ error: error.message })
  }
})

export default router
