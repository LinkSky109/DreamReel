import path from 'path'
import fs from 'fs'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { projectService } from './projectService.js'
import { quotaService } from './quotaService.js'
import { contentModerationService } from './contentModerationService.js'
import { getImageProviderForProject } from '../providers/imageProviderFactory.js'
import { ImageAsset } from '../models/ImageAsset.js'

const STORAGE_DIR = path.resolve(config.storage.path)
const IMAGE_DIR = path.join(STORAGE_DIR, 'images')

const ASPECT_SIZES = {
  '16:9': { width: 1024, height: 576, size: '1024x576' },
  '9:16': { width: 576, height: 1024, size: '576x1024' },
  '1:1': { width: 768, height: 768, size: '768x768' },
  '4:3': { width: 1024, height: 768, size: '1024x768' },
}

const STYLE_PROMPTS = {
  cinematic: '电影感构图，戏剧光影，浅景深',
  realistic: '写实摄影，自然光，真实质感',
  anime: '日系动画风格，干净线条，鲜明色彩',
  watercolor: '水彩插画，柔和晕染，纸张质感',
  minimal: '极简构图，大面积留白，克制配色',
}

const MAX_PROMPT_LENGTH = 2000

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export class ImageService {
  constructor() {
    if (!fs.existsSync(IMAGE_DIR)) {
      fs.mkdirSync(IMAGE_DIR, { recursive: true })
    }
  }

  _assets() {
    return storageService.get('imageAssets') || {}
  }

  _saveAssets(assets) {
    storageService.set('imageAssets', assets)
  }

  _getOrThrow(assetId) {
    const asset = this._assets()[assetId]
    if (!asset) throw httpError(404, `Image asset not found: ${assetId}`)
    return asset
  }

  _getOwnedAssetOrThrow(assetId, userId) {
    const asset = this._getOrThrow(assetId)
    if ((asset.userId || 'default') !== userId) {
      throw httpError(404, `Image asset not found: ${assetId}`)
    }
    return asset
  }

  async _getProjectOrThrow(projectId) {
    try {
      return await projectService.getProject(projectId)
    } catch {
      throw httpError(404, `Project not found: ${projectId}`)
    }
  }

  _assertProjectAccess(project, userId) {
    if ((project.userId || 'default') !== userId) {
      throw httpError(404, `Project not found: ${project.id}`)
    }
  }

  async generateImages({
    projectId,
    userId = 'default',
    prompt,
    aspectRatio = '16:9',
    style = 'cinematic',
    count = 1,
  } = {}) {
    if (!projectId) throw httpError(400, 'projectId 不能为空')
    if (!prompt || !prompt.trim()) throw httpError(400, 'prompt 不能为空')
    if (prompt.trim().length > MAX_PROMPT_LENGTH) {
      throw httpError(400, `prompt 过长（最多 ${MAX_PROMPT_LENGTH} 字符）`)
    }

    const parsedCount = Number.parseInt(count, 10)
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 4) {
      throw httpError(400, 'count 必须在 1-4 之间')
    }

    const sizeInfo = ASPECT_SIZES[aspectRatio]
    if (!sizeInfo) throw httpError(400, `不支持的 aspectRatio: ${aspectRatio}`)
    if (!STYLE_PROMPTS[style]) throw httpError(400, `不支持的 style: ${style}`)

    const project = await this._getProjectOrThrow(projectId)
    this._assertProjectAccess(project, userId)
    const moderation = contentModerationService.moderate(prompt, {
      userId,
      projectId,
      context: 'image_generate_prompt',
    })
    if (!moderation.passed) {
      throw httpError(403, '内容审核未通过')
    }

    const quota = quotaService.checkImageQuota(userId, parsedCount)
    if (!quota.allowed) throw httpError(403, quota.reason)

    quotaService.consumeImageQuota(userId, parsedCount)

    const provider = getImageProviderForProject(projectId, userId)
    const enhancedPrompt = `${prompt.trim()}。风格要求：${STYLE_PROMPTS[style]}。`
    const assets = []

    for (let i = 0; i < parsedCount; i += 1) {
      const asset = new ImageAsset({
        projectId,
        userId,
        prompt: prompt.trim(),
        enhancedPrompt,
        provider: provider.name,
        model: provider.model || provider.name,
        size: sizeInfo.size,
        width: sizeInfo.width,
        height: sizeInfo.height,
        aspectRatio,
        style,
        status: 'generating',
      })
      asset.url = `/storage/images/${asset.id}.png`
      asset.filePath = path.join(IMAGE_DIR, `${asset.id}.png`)

      const map = this._assets()
      map[asset.id] = asset.toJSON()
      this._saveAssets(map)

      try {
        const result = await provider.generateImage({
          prompt: enhancedPrompt,
          size: sizeInfo.size,
          width: sizeInfo.width,
          height: sizeInfo.height,
          aspectRatio,
          style,
          outputPath: asset.filePath,
        })
        asset.filePath = result.filePath || asset.filePath
        asset.width = result.width || asset.width
        asset.height = result.height || asset.height
        asset.size = result.size || asset.size
        asset.textRendered = result.textRendered === true
        asset.status = 'completed'
        asset.completedAt = new Date().toISOString()
        if (result.warning) asset.errorMessage = result.warning
      } catch (error) {
        asset.status = 'failed'
        asset.errorMessage = error.message
        logger.error(`Image generation failed for ${asset.id}:`, error.message)
      }

      const saved = this._assets()
      saved[asset.id] = asset.toJSON()
      this._saveAssets(saved)
      assets.push(asset.toJSON())
    }

    const failedCount = assets.filter((a) => a.status === 'failed').length
    if (failedCount > 0) {
      quotaService.refundImageQuota(userId, failedCount)
    }

    logger.info(`Image generation completed: project=${project.id} provider=${provider.name} count=${assets.length}`)
    return { assets, provider: provider.name, count: assets.length }
  }

  listAssets({ projectId = null, userId = null, status = null } = {}) {
    if (!userId) return { items: [], total: 0 }
    let items = Object.values(this._assets())
    if (projectId) items = items.filter((a) => a.projectId === projectId)
    items = items.filter((a) => (a.userId || 'default') === userId)
    if (status) items = items.filter((a) => a.status === status)
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return { items, total: items.length }
  }

  getAsset(assetId, userId = 'default') {
    return this._getOwnedAssetOrThrow(assetId, userId)
  }

  deleteAsset(assetId, userId = 'default') {
    const assets = this._assets()
    const asset = this._getOwnedAssetOrThrow(assetId, userId)

    if (asset.filePath && fs.existsSync(asset.filePath)) {
      try {
        fs.unlinkSync(asset.filePath)
      } catch (error) {
        logger.warn(`Failed to delete image file ${asset.filePath}: ${error.message}`)
      }
    }

    delete assets[assetId]
    this._saveAssets(assets)
    return { id: assetId, deleted: true }
  }

  async applyAsset(assetId, { targetType, targetId, projectId, userId = 'default' } = {}) {
    const asset = this._getOwnedAssetOrThrow(assetId, userId)
    if (asset.status !== 'completed' || !asset.url) {
      throw httpError(400, '只有生成完成的图片才能作为参考图')
    }
    if (!projectId) throw httpError(400, 'projectId 不能为空')
    if (!targetType || !targetId) throw httpError(400, 'targetType 与 targetId 不能为空')

    const project = await this._getProjectOrThrow(projectId)
    this._assertProjectAccess(project, userId)

    if (targetType === 'shot') {
      const shot = project.getShot(targetId)
      if (!shot) throw httpError(404, `Shot not found: ${targetId}`)
      shot.referenceImages = Array.from(new Set([...(shot.referenceImages || []), asset.url]))
      await projectService.updateProject(projectId, { shots: project.shots })
      return { asset, targetType, targetId, referenceImages: shot.referenceImages }
    }

    if (targetType === 'character') {
      const character = project.getCharacter(targetId)
      if (!character) throw httpError(404, `Character not found: ${targetId}`)
      character.referenceImages = Array.from(new Set([...(character.referenceImages || []), asset.url]))
      await projectService.updateProject(projectId, { characters: project.characters })
      return { asset, targetType, targetId, referenceImages: character.referenceImages }
    }

    if (targetType === 'scene') {
      const scene = (project.scenes || []).find((s) => s.id === targetId)
      if (!scene) throw httpError(404, `Project scene not found: ${targetId}`)
      scene.referenceImages = Array.from(new Set([...(scene.referenceImages || []), asset.url]))
      await projectService.updateProject(projectId, { scenes: project.scenes })
      return { asset, targetType, targetId, referenceImages: scene.referenceImages }
    }

    throw httpError(400, `不支持的 targetType: ${targetType}`)
  }

  getStats() {
    const items = Object.values(this._assets())
    return {
      total: items.length,
      completed: items.filter((a) => a.status === 'completed').length,
      failed: items.filter((a) => a.status === 'failed').length,
      provider: config.image.provider,
    }
  }
}

export const imageService = new ImageService()
export default imageService
