import path from 'path'
import { authService } from '../services/authService.js'
import { collaborationService } from '../services/collaborationService.js'
import { projectService } from '../services/projectService.js'
import { storageService } from '../services/storageService.js'

/**
 * R37：媒体文件访问控制加固
 *
 * 对 /storage 下用户生成媒体目录实施访问控制：
 * - 公开目录（bgm/sfx/scenes）保持公开访问
 * - 受保护目录（videos/exports/images/audio/previews/audio/voices/thumbnails/title-sequences）
 *   需要身份认证 + 项目归属校验
 * - 身份识别顺序：Authorization Bearer → Cookie → URL query share token
 * - share token 放行公开分享链路（?share=token）
 * - 无凭证裸链返回 401/403
 */

/** 完全公开的 storage 子目录 */
const PUBLIC_PATH_PREFIXES = ['/storage/audio/bgm/', '/storage/audio/sfx/', '/storage/scenes/']

/** 需要保护的 storage 子目录 */
const PROTECTED_PATH_PREFIXES = [
  '/storage/videos/',
  '/storage/exports/',
  '/storage/images/',
  '/storage/audio/previews/',
  '/storage/audio/voices/',
  '/storage/thumbnails/',
  '/storage/title-sequences/',
]

/**
 * 判断请求路径是否为公开目录
 */
function isPublicPath(reqPath) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => reqPath.startsWith(prefix))
}

/**
 * 判断请求路径是否属于受保护目录
 */
function isProtectedPath(reqPath) {
  return PROTECTED_PATH_PREFIXES.some((prefix) => reqPath.startsWith(prefix))
}

/**
 * 从请求中提取身份信息
 * 顺序：Authorization Bearer → Cookie token → URL query share token
 * @returns {{type:'user',user:object}|{type:'share',projectId:string,share:object}|null}
 */
function extractIdentity(req) {
  // 1. Authorization Bearer
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = authService.verifyToken(token)
    if (user) {
      return { type: 'user', user }
    }
  }

  // 2. Cookie（若存在 token）
  const cookieHeader = req.headers.cookie
  if (cookieHeader) {
    const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/)
    if (tokenMatch) {
      const user = authService.verifyToken(tokenMatch[1])
      if (user) {
        return { type: 'user', user }
      }
    }
  }

  // 3. URL query share token
  const shareToken = req.query?.share
  if (shareToken) {
    const result = collaborationService.getProjectByShareToken(shareToken)
    if (result) {
      return { type: 'share', projectId: result.projectId, share: result.share }
    }
    // 显式提供了 share token 但无效 → 标记为无效身份，后续返回 403
    return { type: 'invalid_share' }
  }

  return null
}

/**
 * 从媒体 URL 反查所属项目
 * 遍历项目数据、导出历史、图片资产等，找到包含该 URL 的项目
 * @returns {object|null} 项目对象或 null
 */
function findProjectByMediaUrl(mediaUrl) {
  const projects = Object.values(storageService.data.projects || {})

  // 1. 检查 shot.videoUrl 及版本历史
  for (const project of projects) {
    for (const shot of project.shots || []) {
      if (shot.videoUrl === mediaUrl) {
        return project
      }
      for (const version of shot.versions || []) {
        if (version.videoUrl === mediaUrl) {
          return project
        }
      }
    }
    // 2. 检查项目 coverUrl
    if (project.coverUrl === mediaUrl) {
      return project
    }
  }

  // 3. 检查导出历史
  const exportMap = storageService.data.exports || {}
  for (const [projectId, records] of Object.entries(exportMap)) {
    for (const record of records) {
      if (record.outputUrl === mediaUrl) {
        return projectService.getProject(projectId)
      }
    }
  }

  // 4. 检查图片资产
  const imageAssets = storageService.data.imageAssets || {}
  for (const asset of Object.values(imageAssets)) {
    if (asset.url === mediaUrl) {
      return projectService.getProject(asset.projectId)
    }
  }

  // 5. 文件名中包含 projectId 的目录（title-sequences / thumbnails）
  const basename = path.basename(mediaUrl)
  for (const project of projects) {
    if (basename.includes(project.id)) {
      return project
    }
  }

  return null
}

/**
 * 媒体访问控制中间件
 * 挂载在 express.static 之前，对受保护目录进行认证与授权
 */
export function mediaAccess(req, res, next) {
  // app.use('/storage/xxx', mediaAccess) 挂载时 req.path 已被截去前缀，
  // 需用 req.originalUrl 获取完整请求路径
  const reqPath = req.originalUrl?.split('?')[0] || req.path

  // 公开目录直接放行
  if (isPublicPath(reqPath)) {
    return next()
  }

  // 非保护路径也放行（兜底）
  if (!isProtectedPath(reqPath)) {
    return next()
  }

  const identity = extractIdentity(req)

  // 无凭证 → 401
  if (!identity) {
    return res.status(401).json({ error: '未登录，无法访问媒体文件' })
  }

  // 无效的 share token → 403
  if (identity.type === 'invalid_share') {
    return res.status(403).json({ error: '分享链接无效' })
  }

  // 用于反查的完整媒体 URL（去掉 query）
  const mediaUrl = reqPath

  // share token → 验证文件是否属于被分享的项目
  if (identity.type === 'share') {
    const project = findProjectByMediaUrl(mediaUrl)
    if (project && project.id === identity.projectId) {
      return next()
    }
    return res.status(403).json({ error: '无权访问该媒体文件' })
  }

  // 用户凭证 → 反查项目并校验归属
  const userId = identity.user.id
  const project = findProjectByMediaUrl(mediaUrl)

  if (!project) {
    // 无法反查归属的媒体文件（如临时生成但未持久化的预览）
    // 策略：允许已登录用户访问，拒绝匿名（已在上面处理）
    return next()
  }

  if (project.userId !== userId) {
    return res.status(403).json({ error: '无权访问该媒体文件' })
  }

  next()
}
