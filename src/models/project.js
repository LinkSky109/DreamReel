import { generateId } from '../utils/idGenerator.js'
import { Shot } from './shot.js'

/**
 * 项目模型 — 包含剧本、角色库、场景库、镜头列表
 */
export const PROJECT_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
}

export class Project {
  constructor({ id, name, description, coverUrl, status, targetDuration, style, platform, script, characters, scenes, shots, tags, isFavorite, isArchived, userId, audioConfig, subtitleStyle, dialogueAssignments, visualStyle, isPublished, publishedAt, likeCount, viewCount, galleryCategory, challengeId, teamId, directorMode, studioId, providerPreferences, editPlan, createdAt, updatedAt, lastAccessedAt }) {
    this.id = id || generateId()
    this.name = name || '未命名项目'
    this.description = description || ''
    this.coverUrl = coverUrl || ''
    this.status = status || PROJECT_STATUS.DRAFT
    this.targetDuration = targetDuration || 60
    this.style = style || ''
    this.platform = platform || 'landscape' // landscape / portrait
    this.script = script || { synopsis: '', shots: [] }
    this.characters = characters || []
    this.scenes = scenes || []
    this.shots = shots || []
    this.tags = Array.isArray(tags) ? tags : []
    this.isFavorite = isFavorite === true
    this.isArchived = isArchived === true
    // R09：作品广场
    this.isPublished = isPublished === true
    this.publishedAt = publishedAt || null
    this.likeCount = likeCount || 0
    this.viewCount = viewCount || 0
    this.galleryCategory = galleryCategory || 'short'
    // R10：关联挑战
    this.challengeId = challengeId || null
    // R12：所属团队
    this.teamId = teamId || null
    // R29：导演模式 { enabled, directorId, appliedAt }
    this.directorMode = directorMode || { enabled: false, directorId: null, appliedAt: null }
    // R30：所属剧场厂牌 id
    this.studioId = studioId || null
    // R34：智能剪辑方案
    this.editPlan = editPlan || null
    this.userId = userId || 'default'
    this.audioConfig = audioConfig || {
      bgmId: null,
      sfxIds: [],
      voiceVolume: 1.0,
      bgmVolume: 0.3,
      sfxVolume: 0.5,
      bgmFadeIn: 2,
      bgmFadeOut: 2,
    }
    this.subtitleStyle = subtitleStyle || {
      fontFamily: 'Arial',
      fontSize: 24,
      fontColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 2,
      shadow: true,
      position: 'bottom', // bottom / top / center
      bilingual: false,
      secondaryLanguage: 'en',
      bold: false,
      italic: false,
      marginV: 30,
    }
    // R06：角色-音色映射 { characterId: voiceId }
    this.dialogueAssignments = dialogueAssignments || {}
    // R08：全局视觉风格锁定（色温/饱和度/对比度）
    this.visualStyle = visualStyle || {
      locked: false,
      colorTemperature: 0, // -100 冷 ~ 100 暖
      saturation: 0, // -100 ~ 100
      contrast: 0, // -100 ~ 100
      brightness: 0, // -100 ~ 100
    }
    // Phase 1: 各阶段 Provider 配置
    this.providerPreferences = providerPreferences || {
      video: null,
      llm: null,
      tts: null,
      updatedAt: null,
    }
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
    this.lastAccessedAt = lastAccessedAt || null
  }

  addShot(shotData) {
    const shot = new Shot({ ...shotData, projectId: this.id, index: this.shots.length })
    this.shots.push(shot)
    this.updatedAt = new Date().toISOString()
    return shot
  }

  addCharacter(character) {
    this.characters.push(character)
    this.updatedAt = new Date().toISOString()
    return character
  }

  toggleFavorite() {
    this.isFavorite = !this.isFavorite
    this.updatedAt = new Date().toISOString()
    return this.isFavorite
  }

  toggleArchive() {
    this.isArchived = !this.isArchived
    this.updatedAt = new Date().toISOString()
    return this.isArchived
  }

  recordAccess() {
    this.lastAccessedAt = new Date().toISOString()
    return this.lastAccessedAt
  }

  addTag(tag) {
    const cleanTag = tag.trim().toLowerCase()
    if (cleanTag && !this.tags.includes(cleanTag)) {
      this.tags.push(cleanTag)
      this.updatedAt = new Date().toISOString()
    }
    return this.tags
  }

  removeTag(tag) {
    const cleanTag = tag.trim().toLowerCase()
    this.tags = this.tags.filter((t) => t !== cleanTag)
    this.updatedAt = new Date().toISOString()
    return this.tags
  }

  hasTag(tag) {
    return this.tags.includes(tag.trim().toLowerCase())
  }

  getShot(shotId) {
    return this.shots.find((s) => s.id === shotId)
  }

  getCharacter(characterId) {
    return this.characters.find((c) => c.id === characterId)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      coverUrl: this.coverUrl,
      status: this.status,
      targetDuration: this.targetDuration,
      style: this.style,
      platform: this.platform,
      script: this.script,
      characters: this.characters.map((c) => (c.toJSON ? c.toJSON() : c)),
      scenes: this.scenes.map((s) => (s.toJSON ? s.toJSON() : s)),
      shots: this.shots.map((s) => (s.toJSON ? s.toJSON() : s)),
      tags: this.tags,
      isFavorite: this.isFavorite,
      isArchived: this.isArchived,
      isPublished: this.isPublished,
      publishedAt: this.publishedAt,
      likeCount: this.likeCount,
      viewCount: this.viewCount,
      galleryCategory: this.galleryCategory,
      challengeId: this.challengeId,
      teamId: this.teamId,
      directorMode: this.directorMode,
      studioId: this.studioId,
      editPlan: this.editPlan,
      userId: this.userId,
      audioConfig: this.audioConfig,
      subtitleStyle: this.subtitleStyle,
      dialogueAssignments: this.dialogueAssignments,
      visualStyle: this.visualStyle,
      providerPreferences: this.providerPreferences,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastAccessedAt: this.lastAccessedAt,
    }
  }
}

export default Project
