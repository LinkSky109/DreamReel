import { Character } from '../models/character.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * 角色一致性 Service
 * 负责角色锁定、特征提取、一致性评分
 */
export class CharacterService {
  constructor() {
    this.threshold = config.character.consistencyThreshold
  }

  /**
   * 创建角色并锁定
   * @param {Object} params
   * @param {string} params.name - 角色名称
   * @param {string} params.description - 外貌描述
   * @param {string[]} params.referenceImages - 参考图 URL 列表
   * @param {string} params.projectId
   */
  async createCharacter({ name, description, referenceImages = [], projectId }) {
    try {
      if (!name || name.trim().length === 0) {
        throw new Error('Character name is required')
      }

      const character = new Character({
        name,
        description,
        referenceImages,
        projectId,
      })

      // 如果有参考图，提取特征向量
      if (referenceImages.length > 0) {
        const featureVector = await this.extractFeatureVector(referenceImages)
        character.setFeatureVector(featureVector)
        logger.info(`Character locked: ${name}, references: ${referenceImages.length}`)
      } else {
        logger.info(`Character created without lock: ${name}`)
      }

      return character
    } catch (error) {
      logger.error('Failed to create character:', error.message)
      throw error
    }
  }

  /**
   * 为已有角色添加参考图并锁定
   */
  async lockCharacter(character, referenceImages) {
    try {
      if (!referenceImages || referenceImages.length === 0) {
        throw new Error('At least one reference image is required to lock character')
      }

      for (const img of referenceImages) {
        character.addReferenceImage(img)
      }

      const featureVector = await this.extractFeatureVector(referenceImages)
      character.setFeatureVector(featureVector)

      logger.info(`Character locked: ${character.name}, total references: ${character.referenceImages.length}`)
      return character
    } catch (error) {
      logger.error('Failed to lock character:', error.message)
      throw error
    }
  }

  /**
   * 提取角色特征向量
   * MVP 阶段：模拟特征提取（返回随机向量）
   * P1：接入真实人脸特征提取模型
   */
  async extractFeatureVector(referenceImages) {
    // MVP 模拟：生成 128 维特征向量
    // 实际实现应调用人脸检测 + 特征提取模型
    await new Promise((resolve) => setTimeout(resolve, 300))

    const vector = []
    for (let i = 0; i < 128; i++) {
      vector.push(Math.random() * 2 - 1)
    }

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    return vector.map((v) => v / norm)
  }

  /**
   * 计算两个特征向量的余弦相似度
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * 评估视频帧与角色的一致性
   * MVP 阶段：返回模拟评分
   */
  async evaluateConsistency(videoUrl, character) {
    if (!character.featureVector) {
      return { score: null, status: 'not_locked', message: 'Character not locked' }
    }

    // MVP 模拟评分
    // 实际实现：抽帧 -> 人脸检测 -> 提取帧特征 -> 与角色特征比对
    await new Promise((resolve) => setTimeout(resolve, 200))
    const score = 0.6 + Math.random() * 0.35 // 0.6-0.95

    return {
      score: parseFloat(score.toFixed(2)),
      status: score >= this.threshold ? 'consistent' : 'inconsistent',
      threshold: this.threshold,
      message: score >= this.threshold ? '角色一致性良好' : '角色一致性较低，建议重新生成',
    }
  }

  /**
   * 校验参考图是否可用
   */
  async validateReferenceImage(imageUrl) {
    // MVP 简化校验：检查 URL 格式
    // 实际实现：下载图片 -> 人脸检测 -> 检查是否有清晰人脸
    try {
      const url = new URL(imageUrl)
      if (!url.protocol.startsWith('http')) {
        return { valid: false, reason: 'Invalid URL protocol' }
      }
      return { valid: true }
    } catch {
      return { valid: false, reason: 'Invalid URL format' }
    }
  }
}

export const characterService = new CharacterService()
export default characterService
