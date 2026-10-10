/**
 * 场景服务
 * 管理内置场景库和用户自定义场景
 */
import { BUILTIN_SCENES, SCENE_CATEGORIES } from '../config/sceneLibrary.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { generateId } from '../utils/idGenerator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_DIR = path.resolve(__dirname, '../../storage')

export class SceneService {
  constructor() {
    this.customScenes = new Map()
    this.sceneImageDir = path.join(STORAGE_DIR, 'scenes')
    this._ensureDirs()
  }

  _ensureDirs() {
    if (!fs.existsSync(this.sceneImageDir)) {
      fs.mkdirSync(this.sceneImageDir, { recursive: true })
    }
  }

  /**
   * 获取场景列表（内置 + 用户自定义）
   */
  listScenes({ category = 'all', search = '', includeCustom = true } = {}) {
    let scenes = [...BUILTIN_SCENES]

    if (includeCustom) {
      scenes = scenes.concat(Array.from(this.customScenes.values()))
    }

    if (category !== 'all') {
      scenes = scenes.filter((s) => s.category === category)
    }

    if (search) {
      const q = search.toLowerCase()
      scenes = scenes.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    return {
      items: scenes.map((s) => ({
        ...s,
        isBuiltin: BUILTIN_SCENES.some((b) => b.id === s.id),
      })),
      total: scenes.length,
      categories: SCENE_CATEGORIES,
    }
  }

  /**
   * 获取单个场景
   */
  getScene(sceneId) {
    const builtin = BUILTIN_SCENES.find((s) => s.id === sceneId)
    if (builtin) return { ...builtin, isBuiltin: true }
    const custom = this.customScenes.get(sceneId)
    return custom ? { ...custom, isBuiltin: false } : null
  }

  /**
   * 创建用户自定义场景
   */
  createCustomScene({ name, description, category = 'indoor', tags = [], referenceImage = null, userId }) {
    if (!name) {
      throw new Error('Scene name is required')
    }

    const scene = {
      id: `custom-${generateId()}`,
      name,
      description: description || '',
      category,
      tags: Array.isArray(tags) ? tags : [],
      lighting: 'custom',
      referenceImage,
      userId,
      createdAt: new Date().toISOString(),
    }

    this.customScenes.set(scene.id, scene)
    return { ...scene, isBuiltin: false }
  }

  /**
   * 更新用户自定义场景
   */
  updateCustomScene(sceneId, updates, userId) {
    const scene = this.customScenes.get(sceneId)
    if (!scene) {
      throw new Error(`Custom scene not found: ${sceneId}`)
    }

    if (scene.userId !== userId) {
      throw new Error('无权操作该场景')
    }

    const allowedFields = ['name', 'description', 'category', 'tags', 'referenceImage']
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        scene[field] = updates[field]
      }
    }
    scene.updatedAt = new Date().toISOString()
    this.customScenes.set(sceneId, scene)
    return { ...scene, isBuiltin: false }
  }

  /**
   * 删除用户自定义场景
   */
  deleteCustomScene(sceneId, userId) {
    const scene = this.customScenes.get(sceneId)
    if (!scene) {
      throw new Error(`Custom scene not found: ${sceneId}`)
    }

    if (scene.userId !== userId) {
      throw new Error('无权操作该场景')
    }

    this.customScenes.delete(sceneId)
    return true
  }

  /**
   * 获取场景统计
   */
  getStats() {
    return {
      builtinTotal: BUILTIN_SCENES.length,
      customTotal: this.customScenes.size,
      total: BUILTIN_SCENES.length + this.customScenes.size,
      categories: SCENE_CATEGORIES.length,
    }
  }
}

export const sceneService = new SceneService()
export default sceneService
