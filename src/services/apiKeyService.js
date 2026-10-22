import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { storageService } from './storageService.js'
import logger from '../utils/logger.js'

/** 开放 API 支持的 scope 白名单（与 src/routes/openApi.js 的 requireScope 对齐）。 */
export const API_KEY_SCOPES = ['project:read', 'project:write', 'video:generate']

const DEFAULT_SCOPES = ['project:read', 'project:write', 'video:generate']

/**
 * API Key 只存 SHA-256 摘要，不落明文。
 * @param {string} fullKey
 * @returns {string} 64 位 hex
 */
export function hashApiKey(fullKey) {
  return createHash('sha256').update(String(fullKey)).digest('hex')
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/**
 * R13：API Key 管理服务
 * R1-T1B.3：仅存 keyHash/keyPrefix；读取旧明文记录时惰性迁移。
 */
export class ApiKeyService {
  _load() {
    const keys = storageService.get('apiKeys') || {}
    let migrated = false
    for (const record of Object.values(keys)) {
      if (!record || typeof record !== 'object') continue
      if (record.key && !record.keyHash) {
        record.keyHash = hashApiKey(record.key)
        delete record.key
        migrated = true
      } else if (Object.prototype.hasOwnProperty.call(record, 'key')) {
        // 已有 keyHash 的旧记录也移除残留明文
        delete record.key
        migrated = true
      }
    }
    if (migrated) this._save(keys)
    return keys
  }

  _save(keys) {
    storageService.set('apiKeys', keys)
  }

  async createKey({ name, userId = 'default', scopes = DEFAULT_SCOPES }) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('缺少 API Key 归属用户')
    }

    const requested = Array.isArray(scopes) && scopes.length ? scopes : DEFAULT_SCOPES
    const invalid = requested.filter((scope) => !API_KEY_SCOPES.includes(scope))
    if (invalid.length) {
      throw new Error(`无效的权限范围: ${invalid.join(', ')}`)
    }
    const grantedScopes = [...new Set(requested)]

    const keys = this._load()
    const id = randomBytes(8).toString('hex')
    const secret = randomBytes(24).toString('hex')
    const fullKey = `drk_${id}${secret}`
    const record = {
      id,
      name: name || '默认密钥',
      userId,
      scopes: grantedScopes,
      keyPrefix: fullKey.slice(0, 12),
      keyHash: hashApiKey(fullKey),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revoked: false,
      callCount: 0,
    }
    keys[id] = record
    this._save(keys)
    logger.info(`API key created: ${id}`)
    // 仅创建时返回一次完整 key；记录本身只有 hash
    return { ...this._public(record), apiKey: fullKey }
  }

  listKeys({ userId } = {}) {
    let keys = Object.values(this._load()).filter((k) => k && !k.revoked)
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
   * 校验 key，返回记录（并更新使用时间/计数）。
   * 只按 hash 匹配，永不比较明文。
   */
  validate(fullKey) {
    if (!fullKey || typeof fullKey !== 'string') return null
    const candidateHash = hashApiKey(fullKey)
    const keys = this._load()
    const record = Object.values(keys).find(
      (k) => k && !k.revoked && k.keyHash && safeEqualHex(k.keyHash, candidateHash)
    )
    if (!record) return null
    record.lastUsedAt = new Date().toISOString()
    record.callCount = (record.callCount || 0) + 1
    this._save(keys)
    return record
  }

  hasScope(record, scope) {
    return Array.isArray(record?.scopes) && record.scopes.includes(scope)
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
