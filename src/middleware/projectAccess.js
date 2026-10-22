import { projectService } from '../services/projectService.js'
import { ANONYMOUS_USER_ID } from './identity.js'

/**
 * 项目所有权校验基础机制（R36 / T16-001 / R3-T3.1）
 *
 * 统一的「用户 → 项目」归属校验入口：
 * - 匿名请求（无有效 token）固定视为 default 用户，只能操作 default 用户的项目
 * - 已登录用户校验 req.user.id === project.userId
 * - 项目不存在返回 404，跨用户访问返回 403
 *
 * 该机制同时作为 R37（媒体文件访问控制）的归属校验基础：
 * 媒体路由解析出 storage 路径所属项目后，复用 requireProjectOwnership 完成授权判定。
 */

/**
 * 按显式项目 ID 执行所有权校验（用于 body/query 传参的路由）
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} projectId
 * @returns {Promise<{project: object, userId: string}|null>} 校验通过返回项目与用户 ID；失败时已发送 404/403 响应，返回 null
 */
export async function requireProjectAccess(req, res, projectId) {
  const userId = req.userId

  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' })
    return null
  }

  let project
  try {
    project = await projectService.getProject(projectId)
  } catch (error) {
    res.status(404).json({ error: error.message })
    return null
  }

  if ((project.userId ?? ANONYMOUS_USER_ID) !== userId) {
    res.status(403).json({ error: '无权操作该项目' })
    return null
  }

  return { project, userId }
}

/**
 * 加载项目并执行所有权校验
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} [options]
 * @param {string} [options.projectIdParam='projectId'] 路径参数名（部分路由为 :id）
 * @returns {Promise<{project: object, userId: string}|null>} 校验通过返回项目与用户 ID；失败时已发送 404/403 响应，返回 null
 */
export async function requireProjectOwnership(req, res, { projectIdParam = 'projectId' } = {}) {
  return requireProjectAccess(req, res, req.params[projectIdParam])
}

/**
 * 回收站条目所有权校验
 * 回收站中的项目不在活跃项目表内，需单独校验 recycleBin 条目的归属
 * @returns {{item: object, userId: string}|null} 校验通过返回回收站条目；失败时已发送 404/403 响应，返回 null
 */
export function requireRecycleBinOwnership(req, res, { projectIdParam = 'projectId' } = {}) {
  const userId = req.userId

  const item = projectService.recycleBin.get(req.params[projectIdParam])
  if (!item) {
    res.status(404).json({ error: `项目不在回收站中: ${req.params[projectIdParam]}` })
    return null
  }

  if ((item.project.userId ?? ANONYMOUS_USER_ID) !== userId) {
    res.status(403).json({ error: '无权操作该项目' })
    return null
  }

  return { item, userId }
}
