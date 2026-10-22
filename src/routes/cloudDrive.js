import { Router } from 'express'
import fs from 'fs'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { QuarkAuth, saveCookie, loadCookie } from '../services/quarkAuth.js'
import { QuarkClient } from '../services/quarkClient.js'
import { encodeQr } from '../utils/qrcode.js'
import { toSVG } from '../utils/qrImage.js'
import { requirePermission } from '../middleware/authorize.js'
import { PERMISSIONS } from '../security/roles.js'

/**
 * 网盘登录 / 状态路由，挂载 /api/cloud-drive
 *
 * 夸克为私有接口，需扫码登录获取 cookie：
 *   POST /quark/qr                 → 生成二维码会话（返回 SVG，前端直接展示）
 *   GET  /quark/qr/:token/status   → 轮询；成功后落盘 cookie（绝不把 cookie 返回给前端）
 *   GET  /quark/status             → 当前登录态（?verify=1 会用 cookie 调一次真实接口校验）
 *   POST /quark/logout             → 清除扫码登录落盘的 cookie 文件（不动环境变量）
 */

const router = Router()

// 服务端共享网盘 cookie 属管理操作：强制要求企业级管理权限。
// REQUIRE_AUTH=false（开发/测试）时由 requirePermission 放行，保持本地演示可用。
router.use(requirePermission(PERMISSIONS.ENTERPRISE_MANAGE))

const SESSION_TTL_MS = 10 * 60 * 1000
const sessions = new Map() // token -> { token, requestId, qrUrl, createdAt }

function gcSessions() {
  const now = Date.now()
  for (const [token, s] of sessions) if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(token)
}

function authOpts() {
  return { authBase: config.quark.authBase, panBase: config.quark.panBase }
}

function cookieState() {
  const fromEnv = config.quark.cookie
  const fromFile = config.quark.cookieFile ? loadCookie(config.quark.cookieFile) : ''
  return {
    cookie: fromEnv || fromFile,
    source: fromEnv ? 'env' : fromFile ? 'file' : 'none',
    cookieFile: config.quark.cookieFile,
    root: config.quark.root,
  }
}

// 生成扫码登录二维码
router.post('/quark/qr', async (_req, res) => {
  try {
    gcSessions()
    const auth = new QuarkAuth(authOpts())
    const session = await auth.createQrSession()
    const qr = encodeQr(session.qrUrl, { ec: 'M' })
    sessions.set(session.token, { ...session, createdAt: Date.now() })
    res.json({
      success: true,
      data: {
        token: session.token,
        svg: toSVG(qr.modules, { scale: 6, border: 4 }),
        expiresInSec: Math.floor(SESSION_TTL_MS / 1000),
      },
    })
  } catch (error) {
    logger.warn(`夸克扫码二维码生成失败：${error.message}`)
    res.status(400).json({ success: false, error: error.message })
  }
})

// 轮询扫码状态；成功后换 cookie 并落盘
router.get('/quark/qr/:token/status', async (req, res) => {
  const { token } = req.params
  const session = sessions.get(token)
  if (!session) return res.status(404).json({ success: false, error: '二维码会话不存在或已过期，请重新生成' })
  try {
    const auth = new QuarkAuth(authOpts())
    const status = await auth.pollQrSession(session)

    if (status.state === 'success') {
      let cookie
      try {
        ;({ cookie } = await auth.completeLogin(status.serviceTicket))
      } catch (error) {
        sessions.delete(token)
        logger.warn(`夸克登录态获取失败：${error.message}`)
        return res.json({ success: true, data: { state: 'failed', message: `登录态获取失败：${error.message}` } })
      }
      // 用拿到的 cookie 真实验一次，只有能列根目录才算登录成功
      let probe
      try {
        probe = await new QuarkClient({ ...config.quark, cookie }).checkAuth()
      } catch (error) {
        probe = { ok: false, error: error.message }
      }
      sessions.delete(token)
      if (!probe.ok) {
        return res.json({ success: true, data: { state: 'failed', message: `登录态校验失败：${probe.error || 'cookie 不可用'}` } })
      }
      const cookieSavedTo = saveCookie(cookie, config.quark.cookieFile)
      logger.info(`夸克扫码登录成功，cookie 已落盘：${cookieSavedTo}`)
      return res.json({ success: true, data: { state: 'success', cookieSavedTo, canListRoot: true } })
    }

    if (status.state === 'failed') {
      sessions.delete(token)
      return res.json({ success: true, data: { state: 'failed', message: '二维码已失效或被拒绝，请重新生成' } })
    }
    res.json({ success: true, data: { state: 'pending' } })
  } catch (error) {
    logger.warn(`夸克扫码状态查询失败：${error.message}`)
    res.status(400).json({ success: false, error: error.message })
  }
})

// 当前登录态
router.get('/quark/status', async (req, res) => {
  try {
    const state = cookieState()
    const data = { configured: Boolean(state.cookie), source: state.source, root: state.root, verified: null }
    if (req.query.verify === '1' && state.cookie) {
      try {
        await new QuarkClient({ ...config.quark, cookie: state.cookie }).checkAuth()
        data.verified = true
      } catch (error) {
        data.verified = false
        data.error = error.message
      }
    }
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 退出登录：删除扫码落盘的 cookie 文件
router.post('/quark/logout', (req, res) => {
  try {
    const file = config.quark.cookieFile
    let removed = false
    if (file && fs.existsSync(file)) {
      fs.rmSync(file, { force: true })
      removed = true
    }
    const state = cookieState()
    res.json({ success: true, data: { removed, stillConfigured: Boolean(state.cookie), source: state.source } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
