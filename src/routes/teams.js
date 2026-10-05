import { Router } from 'express'
import { teamService } from '../services/teamService.js'

const router = Router()

// 创建团队
router.post('/', async (req, res) => {
  try {
    const team = await teamService.createTeam({
      name: req.body.name,
      description: req.body.description,
      ownerId: req.body.ownerId || req.user?.id || 'default',
    })
    res.status(201).json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 团队列表
router.get('/', async (req, res) => {
  const result = await teamService.listTeams({ userId: req.query.userId })
  res.json(result)
})

// 团队详情
router.get('/:teamId', async (req, res) => {
  try {
    const team = await teamService.getTeam(req.params.teamId)
    res.json(team)
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

// 更新团队
router.put('/:teamId', async (req, res) => {
  try {
    const team = await teamService.updateTeam(req.params.teamId, req.body, req.user?.id)
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 添加成员
router.post('/:teamId/members', async (req, res) => {
  try {
    const team = await teamService.addMember(
      req.params.teamId,
      { userId: req.body.userId, name: req.body.name, role: req.body.role },
      req.user?.id
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 修改成员角色
router.put('/:teamId/members/:userId', async (req, res) => {
  try {
    const team = await teamService.updateMemberRole(
      req.params.teamId, req.params.userId, req.body.role, req.user?.id
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
      req.params.teamId, req.params.userId, req.user?.id
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
      req.params.teamId, req.params.projectId, req.user?.id
    )
    res.json(team)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 团队项目列表
router.get('/:teamId/projects', async (req, res) => {
  try {
    const projects = await teamService.listTeamProjects(req.params.teamId)
    res.json({ total: projects.length, items: projects })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
