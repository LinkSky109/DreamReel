import { Router } from 'express'
import { teamService } from '../services/teamService.js'
import { PERMISSIONS } from '../security/roles.js'
import { validateBody } from '../middleware/validate.js'
import { teamCreateSchema, teamUpdateSchema, teamMemberAddSchema, teamMemberRoleSchema } from '../contracts/teams.js'

const router = Router()

/** 身份只来自认证上下文，禁止 body/query 指定。 */
function currentUserId(req) {
  return req.userId || req.auth?.userId || null
}

/** 组织级管理员可跨团队查看；普通用户必须是团队成员。 */
function canReadTeam(req, team) {
  const userId = currentUserId(req)
  if (!userId) return true // 开发/测试未开闸时保持旧行为
  if (req.auth?.permissions?.has(PERMISSIONS.ENTERPRISE_MANAGE)) return true
  return Boolean(team.getMember(userId))
}

// 创建团队
router.post('/', validateBody(teamCreateSchema), async (req, res) => {
  try {
    const team = await teamService.createTeam({
      name: req.validated.body.name,
      description: req.validated.body.description,
      ownerId: req.userId,
    })
    res.status(201).json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 团队列表
router.get('/', async (req, res) => {
  // 已登录时只返回本人可见团队；无登录态（开发/测试）保留旧的 query 过滤能力
  const userId = req.userId
  const result = await teamService.listTeams({ userId })
  res.json(result)
})

// 团队详情
router.get('/:teamId', async (req, res) => {
  try {
    const team = await teamService.getTeam(req.params.teamId)
    if (!canReadTeam(req, team)) return res.status(403).json({ error: '无权查看该团队' })
    res.json(team)
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

// 更新团队
router.put('/:teamId', validateBody(teamUpdateSchema), async (req, res) => {
  try {
    const team = await teamService.updateTeam(req.params.teamId, req.validated.body, req.userId)
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 添加成员
router.post('/:teamId/members', validateBody(teamMemberAddSchema), async (req, res) => {
  try {
    const team = await teamService.addMember(
      req.params.teamId,
      req.validated.body,
      req.userId
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 修改成员角色
router.put('/:teamId/members/:userId', validateBody(teamMemberRoleSchema), async (req, res) => {
  try {
    const team = await teamService.updateMemberRole(
      req.params.teamId, req.params.userId, req.validated.body.role, req.userId
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 移除成员
router.delete('/:teamId/members/:userId', async (req, res) => {
  try {
    const team = await teamService.removeMember(
      req.params.teamId, req.params.userId, req.userId
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 添加项目到团队
router.post('/:teamId/projects/:projectId', async (req, res) => {
  try {
    const team = await teamService.addProject(
      req.params.teamId, req.params.projectId, req.userId
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 团队项目列表
router.get('/:teamId/projects', async (req, res) => {
  try {
    const team = await teamService.getTeam(req.params.teamId)
    if (!canReadTeam(req, team)) return res.status(403).json({ error: '无权查看该团队' })
    const projects = await teamService.listTeamProjects(req.params.teamId)
    res.json({ total: projects.length, items: projects })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
