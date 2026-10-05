import crypto from 'crypto'

/**
 * 用户模型
 */
export class User {
  constructor({ id, username, email, passwordHash, salt, defaultProviderPreferences, createdAt, updatedAt }) {
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
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  /**
   * 验证密码
   */
  verifyPassword(password) {
    const hash = crypto.scryptSync(password, this.salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.passwordHash, 'hex'))
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
