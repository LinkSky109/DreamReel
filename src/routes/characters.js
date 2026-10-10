import { Router } from 'express'
import { characterService } from '../services/characterService.js'
import { projectService } from '../services/projectService.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()

/**
 * 校验角色操作的项目所有权
 * @returns {Promise<object|null>} 项目对象或 null（已发送响应）
 */
async function assertCharacterProjectOwnership(req, res) {
  const { projectId } = req.body
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' })
    return null
  }
  const userId = req.user?.id || 'default'
  let project
  try {
    project = await projectService.getProject(projectId)
  } catch (error) {
    res.status(404).json({ error: error.message })
    return null
  }
  if (project.userId !== userId) {
    res.status(403).json({ error: '无权操作该项目' })
    return null
  }
  return project
}

// 创建角色
router.post('/', authRequired, async (req, res) => {
  try {
    const { name, description, referenceImages, projectId } = req.body

    if (!name || !projectId) {
      return res.status(400).json({ error: 'name and projectId are required' })
    }

    const project = await assertCharacterProjectOwnership(req, res)
    if (!project) return

    const character = await characterService.createCharacter({
      name,
      description,
      referenceImages: referenceImages || [],
      projectId,
    })

    // 添加到项目
    try {
      project.addCharacter(character)
    } catch {
      // 项目不存在时仍返回角色
    }

    res.status(201).json(character.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 锁定角色（添加参考图）
router.post('/:characterId/lock', authRequired, async (req, res) => {
  try {
    const { referenceImages } = req.body

    if (!referenceImages || referenceImages.length === 0) {
      return res.status(400).json({ error: 'At least one reference image is required' })
    }

    const project = await assertCharacterProjectOwnership(req, res)
    if (!project) return

    const character = project.getCharacter(req.params.characterId)

    if (!character) {
      return res.status(404).json({ error: 'Character not found' })
    }

    const locked = await characterService.lockCharacter(character, referenceImages)
    res.json(locked.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 评估角色一致性
router.post('/:characterId/evaluate', authRequired, async (req, res) => {
  try {
    const { videoUrl } = req.body

    const project = await assertCharacterProjectOwnership(req, res)
    if (!project) return

    const character = project.getCharacter(req.params.characterId)

    if (!character) {
      return res.status(404).json({ error: 'Character not found' })
    }

    const result = await characterService.evaluateConsistency(videoUrl, character)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 列出项目角色
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    res.json({
      total: project.characters.length,
      items: project.characters.map((c) => (c.toJSON ? c.toJSON() : c)),
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// R23: 更新角色造型（服装/妆容/整体风格）
router.patch('/:characterId/styling', authRequired, async (req, res) => {
  try {
    const { projectId, wardrobe, makeup, styling } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }

    const project = await assertCharacterProjectOwnership(req, res)
    if (!project) return

    const character = project.getCharacter(req.params.characterId)
    if (!character) {
      return res.status(404).json({ error: 'Character not found' })
    }
    character.updateStyling({ wardrobe, makeup, styling })
    // 持久化回项目
    await projectService.updateProject(projectId, { characters: project.characters })
    res.json({
      ...character.toJSON(),
      stylingPrompt: character.buildStylingPrompt(),
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
