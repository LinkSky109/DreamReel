import crypto from 'crypto'
import { storageService } from './storageService.js'
import { User } from '../models/user.js'
import logger from '../utils/logger.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dreamreel-dev-secret-change-in-production'
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000 // 7 天

/**
 * 认证服务
 * 注册、登录、JWT 签发与验证
 */
export class AuthService {
  constructor() {
    if (!storageService.data.users) storageService.data.users = {}
  }

  /**
   * 用户注册
   */
  register({ username, email, password }) {
    // 校验
    if (!username || username.length < 2) {
      throw new Error('用户名至少 2 个字符')
    }
    if (!email || !email.includes('@')) {
      throw new Error('请输入有效的邮箱地址')
    }
    if (!password || password.length < 6) {
      throw new Error('密码至少 6 个字符')
    }

    // 检查用户名/邮箱是否已存在
    const existing = Object.values(storageService.data.users).find(
      (u) => u.username === username || u.email === email
    )
    if (existing) {
      throw new Error('用户名或邮箱已被注册')
    }

    // 哈希密码
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex')

    const user = new User({
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      salt,
    })

    storageService.data.users[user.id] = user
    storageService.save()

    logger.info(`User registered: ${username}`)
    return this._generateAuthResult(user)
  }

  /**
   * 用户登录
   */
  login({ email, password }) {
    if (!email || !password) {
      throw new Error('请输入邮箱和密码')
    }

    const userData = Object.values(storageService.data.users).find((u) => u.email === email)
    if (!userData) {
      throw new Error('邮箱或密码错误')
    }

    const user = User.fromData(userData)
    if (!user.verifyPassword(password)) {
      throw new Error('邮箱或密码错误')
    }

    logger.info(`User logged in: ${user.username}`)
    return this._generateAuthResult(user)
  }

  /**
   * 验证 JWT token
   */
  verifyToken(token) {
    try {
      const [headerB64, payloadB64, signature] = token.split('.')
      if (!headerB64 || !payloadB64 || !signature) return null

      // 验证签名
      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url')

      if (signature !== expectedSignature) return null

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

      // 检查过期
      if (payload.exp && Date.now() > payload.exp * 1000) return null

      // 查找用户
      const userData = storageService.data.users[payload.userId]
      if (!userData) return null

      return User.fromData(userData)
    } catch {
      return null
    }
  }

  /**
   * 根据 ID 获取用户
   */
  getUserById(userId) {
    const userData = storageService.data.users[userId]
    if (!userData) return null
    return User.fromData(userData)
  }

  /**
   * 更新用户模型偏好
   * @param {string} userId
   * @param {Object} params
   * @param {Object|null} params.video
   * @param {Object|null} params.llm
   * @param {Object|null} params.tts
   */
  updateUserModelPreferences(userId, { video, llm, tts }) {
    const user = this.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    const preferences = { ...user.defaultProviderPreferences }
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

    user.defaultProviderPreferences = preferences
    user.updatedAt = now

    // 持久化
    storageService.data.users[userId] = user.toJSON ? user.toJSON() : user
    storageService.save()

    logger.info(`User ${userId} model preferences updated`)
    return user
  }

  /**
   * 生成认证结果（用户信息 + token）
   */
  _generateAuthResult(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + JWT_EXPIRES_IN) / 1000),
    }

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payloadB64}`)
      .digest('base64url')

    const token = `${header}.${payloadB64}.${signature}`

    return {
      user: user.toJSON(),
      token,
      expiresIn: JWT_EXPIRES_IN,
    }
  }
}

export const authService = new AuthService()
export default authService
