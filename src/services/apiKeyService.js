import { randomBytes } from 'crypto'
import { storageService } from './storageService.js'
import logger from '../utils/logger.js'

/**
 * R13：API Key 管理服务
 */
export class ApiKeyService {
  _load() {
    return storageService.get('apiKeys') || {}
  }

  _save(keys) {
    storageService.set('apiKeys', keys)
  }

  async createKey({ name, userId = 'default', scopes = ['project:read', 'project:write', 'video:generate'] }) {
    const keys = this._load()
    const id = randomBytes(8).toString('hex')
    const secret = randomBytes(24).toString('hex')
    const fullKey = `drk_${id}${secret}`
    const record = {
      id,
      name: name || '默认密钥',
      userId,
      scopes,
      keyPrefix: fullKey.slice(0, 12),
      // 本地开发存完整 key；生产应仅存 hash
      key: fullKey,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revoked: false,
      callCount: 0,
    }
    keys[id] = record
    this._save(keys)
    logger.info(`API key created: ${id} for ${userId}`)
    // 仅创建时返回一次完整 key
    return { ...this._public(record), apiKey: fullKey }
  }

  listKeys({ userId } = {}) {
    let keys = Object.values(this._load()).filter((k) => !k.revoked)
    if (userId) keys = keys.filter((k) => k.userId === userId)
    return { total: keys.length, items: keys.map((k) => this._public(k)) }
  }

  revokeKey(id, userId) {
    const keys = this._load()
    const key = keys[id]
    if (!key) throw new Error('API Key not found')
    if (userId && key.userId !== userId) throw new Error('无权限')
    key.revoked = true
    this._save(keys)
    return { success: true }
  }

  /**
   * 校验 key，返回记录（并更新使用时间/计数）
   */
  validate(fullKey) {
    const keys = this._load()
    const record = Object.values(keys).find((k) => k.key === fullKey && !k.revoked)
    if (!record) return null
    record.lastUsedAt = new Date().toISOString()
    record.callCount += 1
    this._save(keys)
    return record
  }

  hasScope(record, scope) {
    return record.scopes.includes(scope)
  }

  _public(k) {
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      callCount: k.callCount,
      revoked: k.revoked,
    }
  }
}

export const apiKeyService = new ApiKeyService()
export default apiKeyService
