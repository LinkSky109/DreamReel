import crypto from 'crypto'

/**
 * 用户模型
 */
export class User {
  constructor({ id, username, email, passwordHash, salt, defaultProviderPreferences, preferenceTags, scoreStyle, createdAt, updatedAt }) {
    this.id = id
    this.username = username
    this.email = email
    this.passwordHash = passwordHash
    this.salt = salt
    // Phase 1: 全局默认 Provider 偏好
    this.defaultProviderPreferences = defaultProviderPreferences || {
      video: null,
      llm: null,
      tts: null,
      updatedAt: null,
    }
    // C02: 社区推荐偏好
    this.preferenceTags = preferenceTags || []
    this.scoreStyle = scoreStyle || { story: 5, visual: 5, performance: 5, soundtrack: 5 }
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  /**
   * 验证密码
   */
  verifyPassword(password) {
    if (!this.salt || !this.passwordHash) return false // 旧数据/未设密码：直接判定失败，避免 scrypt 抛错
    const hash = crypto.scryptSync(password, this.salt, 64).toString('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.passwordHash, 'hex'))
    } catch {
      return false
    }
  }

  /**
   * 序列化为 JSON（不包含密码哈希）
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      defaultProviderPreferences: this.defaultProviderPreferences,
      preferenceTags: this.preferenceTags,
      scoreStyle: this.scoreStyle,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  /**
   * 从存储数据还原
   */
  static fromData(data) {
    return new User(data)
  }
}

export default User
