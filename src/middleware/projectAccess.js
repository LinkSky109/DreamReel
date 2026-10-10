import { projectService } from '../services/projectService.js'

/**
 * 项目所有权校验基础机制（R36 / T16-001）
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
 * 加载项目并执行所有权校验
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} [options]
 * @param {string} [options.projectIdParam='projectId'] 路径参数名（部分路由为 :id）
 * @returns {Promise<{project: object, userId: string}|null>} 校验通过返回项目与用户 ID；失败时已发送 404/403 响应，返回 null
 */
export async function requireProjectOwnership(req, res, { projectIdParam = 'projectId' } = {}) {
  const userId = req.user?.id || 'default'

  let project
  try {
    project = await projectService.getProject(req.params[projectIdParam])
  } catch (error) {
    res.status(404).json({ error: error.message })
    return null
  }

  if (project.userId !== userId) {
    res.status(403).json({ error: '无权操作该项目' })
    return null
  }

  return { project, userId }
}

/**
 * 回收站条目所有权校验
 * 回收站中的项目不在活跃项目表内，需单独校验 recycleBin 条目的归属
 * @returns {{item: object, userId: string}|null} 校验通过返回回收站条目；失败时已发送 404/403 响应，返回 null
 */
export function requireRecycleBinOwnership(req, res, { projectIdParam = 'projectId' } = {}) {
  const userId = req.user?.id || 'default'

  const item = projectService.recycleBin.get(req.params[projectIdParam])
  if (!item) {
    res.status(404).json({ error: `项目不在回收站中: ${req.params[projectIdParam]}` })
    return null
  }

  if (item.project.userId !== userId) {
    res.status(403).json({ error: '无权操作该项目' })
    return null
  }

  return { item, userId }
}
