import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { projectService } from '../services/projectService.js'
import { thumbnailService } from '../services/thumbnailService.js'
import { resolveProviderConfig } from '../providers/providerResolver.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

import { requireProjectOwnership } from '../middleware/projectAccess.js'
const STORAGE_DIR = path.resolve(config.storage.path)
const STORAGE_ROOT = STORAGE_DIR + path.sep

function resolveStoragePath(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/storage/')) return null
  const resolved = path.resolve(STORAGE_DIR, url.replace(/^\/storage\//, ''))
  return resolved.startsWith(STORAGE_ROOT) ? resolved : null
}

/**
 * 清理项目关联的所有文件（视频、音频、导出）
 */
function cleanupProjectFiles(project) {
  const deleted = []
  try {
    // 清理镜头视频
    if (project.shots) {
      for (const shot of project.shots) {
        if (shot.videoUrl) {
          const filePath = resolveStoragePath(shot.videoUrl)
          if (!filePath) continue
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            deleted.push(filePath)
          }
        }
      }
    }
    // 清理配音音频
    if (project.script && project.script.dubbing && project.script.dubbing.audioUrl) {
      const audioPath = resolveStoragePath(project.script.dubbing.audioUrl)
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath)
        deleted.push(audioPath)
      }
    }
    // 清理导出文件（按项目ID前缀匹配）
    const exportsDir = path.join(STORAGE_DIR, 'exports')
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir)
      for (const file of files) {
        if (file.includes(project.id)) {
          const filePath = path.join(exportsDir, file)
          fs.unlinkSync(filePath)
          deleted.push(filePath)
        }
      }
    }
  } catch (error) {
    logger.warn(`File cleanup incomplete for project ${project.id}: ${error.message}`)
  }
  return deleted
}

const router = Router()

// 辅助：获取当前用户 ID
function getUserId(req) {
  return req.user?.id || 'default'
}

// 创建项目
router.post('/', async (req, res) => {
  try {
    const { name, description, targetDuration, style, platform, tags } = req.body
    const project = await projectService.createProject({
      name,
      description,
      targetDuration,
      style,
      platform,
      tags,
      userId: getUserId(req),
    })
    res.status(201).json(project.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 列出项目
router.get('/', async (req, res) => {
  try {
    const { limit, offset, search, status, style, platform, tag, favorite, archived, sort } = req.query
    const userId = getUserId(req)
    const result = await projectService.listProjects({
      userId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      search,
      status,
      style,
      platform,
      tag,
      favorite,
      archived,
      sort,
    })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 最近访问的项目
router.get('/recent', async (req, res) => {
  try {
    const userId = getUserId(req)
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5
    const projects = await projectService.getRecentProjects(userId, limit)
    res.json({ projects })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 批量删除
router.post('/batch/delete', async (req, res) => {
  try {
    const { projectIds } = req.body
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: 'projectIds 数组不能为空' })
    }
    const userId = getUserId(req)
    const result = await projectService.batchDelete(projectIds, userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 批量归档
router.post('/batch/archive', async (req, res) => {
  try {
    const { projectIds, archive } = req.body
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: 'projectIds 数组不能为空' })
    }
    const userId = getUserId(req)
    const result = await projectService.batchArchive(projectIds, archive === true, userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 批量收藏
router.post('/batch/favorite', async (req, res) => {
  try {
    const { projectIds, favorite } = req.body
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ error: 'projectIds 数组不能为空' })
    }
    const userId = getUserId(req)
    const result = await projectService.batchFavorite(projectIds, favorite === true, userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// ========== 回收站 ==========

// 列出回收站项目
router.get('/recycle-bin/list', (req, res) => {
  try {
    const userId = getUserId(req)
    const { limit = 50, offset = 0 } = req.query
    const result = projectService.listRecycleBin({ userId, limit: parseInt(limit), offset: parseInt(offset) })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 回收站统计
router.get('/recycle-bin/stats', (req, res) => {
  try {
    const userId = getUserId(req)
    const stats = projectService.getRecycleBinStats({ userId })
    res.json(stats)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 从回收站恢复项目
router.post('/recycle-bin/:projectId/restore', (req, res) => {
  try {
    const result = projectService.restoreProject(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 永久删除项目
router.delete('/recycle-bin/:projectId', (req, res) => {
  try {
    const result = projectService.permanentlyDeleteProject(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 清空回收站
router.delete('/recycle-bin', (req, res) => {
  try {
    const userId = getUserId(req)
    const result = projectService.emptyRecycleBin({ userId })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 切换收藏
router.post('/:projectId/favorite', async (req, res) => {
  try {
    const result = await projectService.toggleFavorite(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 切换归档
router.post('/:projectId/archive', async (req, res) => {
  try {
    const result = await projectService.toggleArchive(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 复制项目
router.post('/:projectId/duplicate', async (req, res) => {
  try {
    const { newName } = req.body
    const userId = getUserId(req)
    const duplicated = await projectService.duplicateProject(req.params.projectId, {
      newName,
      userId,
    })
    res.status(201).json(duplicated.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取所有标签
router.get('/tags', (req, res) => {
  try {
    const userId = getUserId(req)
    const tags = projectService.getAllTags(userId)
    res.json({ tags })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取项目详情
router.get('/:projectId', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)
    // 异步记录访问，不阻塞响应
    projectService.recordAccess(req.params.projectId).catch(() => {})
    res.json(project.toJSON())
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// 更新项目
router.put('/:projectId', async (req, res) => {
  try {
    const project = await projectService.updateProject(req.params.projectId, req.body)
    res.json(project.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 生成项目封面缩略图
router.post('/:projectId/thumbnail', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)
    const thumbnailUrl = await thumbnailService.generateProjectThumbnail(project)
    if (thumbnailUrl) {
      await projectService.updateProject(req.params.projectId, { coverUrl: thumbnailUrl })
      res.json({ success: true, coverUrl: thumbnailUrl })
    } else {
      res.status(400).json({ error: '没有可提取封面的已完成视频' })
    }
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 上传自定义封面（base64）
router.post('/:projectId/cover', async (req, res) => {
  try {
    const { image } = req.body
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: '请提供有效的 base64 图片数据' })
    }

    // 解析 base64 图片
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) {
      return res.status(400).json({ error: '图片格式不支持' })
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
    const base64Data = matches[2]
    const buffer = Buffer.from(base64Data, 'base64')

    // 限制文件大小（5MB）
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: '图片大小不能超过 5MB' })
    }

    // 保存到 thumbnails 目录
    const fs = await import('fs')
    const path = await import('path')
    const thumbnailsDir = path.resolve(process.cwd(), 'storage', 'thumbnails')
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true })
    }

    const filename = `cover_${req.params.projectId}_${Date.now()}.${ext}`
    const filepath = path.join(thumbnailsDir, filename)
    fs.writeFileSync(filepath, buffer)

    const coverUrl = `/storage/thumbnails/${filename}`
    await projectService.updateProject(req.params.projectId, { coverUrl })

    logger.info(`Custom cover uploaded: ${filename} for project ${req.params.projectId}`)
    res.json({ success: true, coverUrl })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 删除项目
router.delete('/:projectId', async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.projectId)
    const deletedFiles = cleanupProjectFiles(project)
    await projectService.deleteProject(req.params.projectId)
    logger.info(`Project deleted: ${req.params.projectId}, cleaned ${deletedFiles.length} files`)
    res.json({ success: true, deletedFiles: deletedFiles.length })
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// 导出项目（JSON 文件下载）
router.get('/:projectId/export', async (req, res) => {
  try {
    const data = await projectService.exportProject(req.params.projectId)
    const safeName = (data.name || 'project').replace(/[^\w\u4e00-\u9fa5-]/g, '_')
    const fileName = `dreamreel-${safeName}-${Date.now()}.json`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.json(data)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 导入项目（从 JSON 文件）
router.post('/import', async (req, res) => {
  try {
    // 支持两种格式：{ projectData: {...} } 或直接 {...}
    let projectData = req.body.projectData || req.body
    const userId = req.body.userId || req.user?.id || 'default'

    // 如果 body 本身就是项目数据（有 name 字段），直接使用
    if (!projectData.name && req.body.name) {
      projectData = req.body
    }

    if (!projectData || !projectData.name) {
      return res.status(400).json({ error: '无效的项目文件：缺少名称字段' })
    }

    // 创建新项目
    const project = await projectService.createProject({
      name: `${projectData.name} (导入)`,
      description: projectData.description || '',
      platform: projectData.platform || 'landscape',
      style: projectData.style || 'none',
      userId: userId || req.user?.id || 'default',
    })

    // 恢复剧本
    if (projectData.script) {
      await projectService.updateProject(project.id, { script: projectData.script })
    }

    // 恢复角色
    if (projectData.characters && Array.isArray(projectData.characters)) {
      for (const char of projectData.characters) {
        project.addCharacter({
          name: char.name,
          description: char.description,
          referenceImages: char.referenceImages || [],
          personality: char.personality,
        })
      }
    }

    // 恢复镜头（不恢复视频文件，状态重置为 pending）
    if (projectData.shots && Array.isArray(projectData.shots)) {
      for (const shot of projectData.shots) {
        project.addShot({
          description: shot.description,
          dialogue: shot.dialogue,
          narration: shot.narration,
          duration: shot.duration || 5,
          shotType: shot.shotType,
          cameraMovement: shot.cameraMovement,
          characterIds: shot.characterIds || [],
        })
      }
    }

    // 恢复场景
    if (projectData.scenes && Array.isArray(projectData.scenes)) {
      for (const scene of projectData.scenes) {
        project.addScene({
          name: scene.name,
          description: scene.description,
          referenceImages: scene.referenceImages || [],
        })
      }
    }

    await projectService.updateProject(project.id, {
      characters: project.characters,
      shots: project.shots,
      scenes: project.scenes,
    })

    logger.info(`Project imported: ${project.id} from ${projectData.name}`)
    res.status(201).json({
      success: true,
      projectId: project.id,
      message: `项目已导入为「${project.name}」`,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 更新镜头顺序
 */
router.put('/:id/shots/order', async (req, res) => {
  try {
    const { shotIds } = req.body
    if (!Array.isArray(shotIds) || shotIds.length === 0) {
      return res.status(400).json({ error: 'shotIds array is required' })
    }
    const project = await projectService.updateShotOrder(req.params.id, shotIds)
    res.json({ success: true, shots: project.shots.map((s) => s.toJSON ? s.toJSON() : s) })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 更新单个镜头时长
 */
router.put('/:id/shots/:shotId/duration', async (req, res) => {
  try {
    const { duration } = req.body
    if (!duration) {
      return res.status(400).json({ error: 'duration is required' })
    }
    const shot = await projectService.updateShotDuration(req.params.id, req.params.shotId, duration)
    res.json({ success: true, shot: shot.toJSON ? shot.toJSON() : shot })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// ========== Phase 1: 项目级 Provider 配置 ==========

/**
 * 获取项目模型配置
 * GET /api/projects/:projectId/model-config
 */
router.get('/:projectId/model-config', async (req, res) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const project = guard.project

    const resolved = {
      video: resolveProviderConfig('video', project.id, project.userId),
      llm: resolveProviderConfig('llm', project.id, project.userId),
      tts: resolveProviderConfig('tts', project.id, project.userId),
    }

    res.json({
      projectId: project.id,
      preferences: project.providerPreferences,
      resolved: {
        video: {
          provider: resolved.video.provider,
          model: resolved.video.model,
          source: resolved.video.source,
        },
        llm: {
          provider: resolved.llm.provider,
          model: resolved.llm.model,
          source: resolved.llm.source,
        },
        tts: {
          provider: resolved.tts.provider,
          model: resolved.tts.model,
          source: resolved.tts.source,
        },
      },
    })
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

/**
 * 更新项目模型配置
 * PUT /api/projects/:projectId/model-config
 * Body: { video?: { provider, model, config }, llm?: { provider, model, config }, tts?: { provider, model, config } }
 */
router.put('/:projectId/model-config', async (req, res) => {
  try {
    const { video, llm, tts } = req.body
    const project = await projectService.getProject(req.params.projectId)
    const userId = getUserId(req)

    // 权限检查：只有项目所有者或管理员可以修改
    if (project.userId !== userId) {
      return res.status(403).json({ error: '无权修改该项目的模型配置' })
    }

    const preferences = { ...project.providerPreferences }
    const now = new Date().toISOString()

    if (video !== undefined) {
      preferences.video = video === null ? null : { ...video, updatedAt: now }
    }
    if (llm !== undefined) {
      preferences.llm = llm === null ? null : { ...llm, updatedAt: now }
    }
    if (tts !== undefined) {
      preferences.tts = tts === null ? null : { ...tts, updatedAt: now }
    }
    preferences.updatedAt = now

    await projectService.updateProject(project.id, { providerPreferences: preferences })

    // 返回更新后的 resolved 配置
    const resolved = {
      video: resolveProviderConfig('video', project.id, project.userId),
      llm: resolveProviderConfig('llm', project.id, project.userId),
      tts: resolveProviderConfig('tts', project.id, project.userId),
    }

    res.json({
      projectId: project.id,
      preferences,
      resolved: {
        video: {
          provider: resolved.video.provider,
          model: resolved.video.model,
          source: resolved.video.source,
        },
        llm: {
          provider: resolved.llm.provider,
          model: resolved.llm.model,
          source: resolved.llm.source,
        },
        tts: {
          provider: resolved.tts.provider,
          model: resolved.tts.model,
          source: resolved.tts.source,
        },
      },
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
