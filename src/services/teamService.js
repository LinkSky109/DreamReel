import { storageService } from './storageService.js'
import { Team, TEAM_ROLES } from '../models/Team.js'
import { projectService } from './projectService.js'
import logger from '../utils/logger.js'

/**
 * R12：团队协作服务
 */
export class TeamService {
  _load() {
    const data = storageService.get('teams') || {}
    const teams = {}
    for (const [id, t] of Object.entries(data)) {
      teams[id] = new Team(t)
    }
    return teams
  }

  _save(teams) {
    const data = {}
    for (const [id, t] of Object.entries(teams)) data[id] = t.toJSON()
    storageService.set('teams', data)
  }

  async createTeam({ name, description, ownerId = 'default' }) {
    const teams = this._load()
    const team = new Team({ name, description, ownerId })
    teams[team.id] = team
    this._save(teams)
    logger.info(`Team created: ${team.id}`)
    return team
  }

  async getTeam(teamId) {
    const team = this._load()[teamId]
    if (!team) throw new Error(`Team not found: ${teamId}`)
    return team
  }

  async listTeams({ userId } = {}) {
    let teams = Object.values(this._load())
    if (userId) teams = teams.filter((t) => t.getMember(userId))
    return { total: teams.length, items: teams.map((t) => t.toJSON()) }
  }

  async updateTeam(teamId, updates, userId) {
    const teams = this._load()
    const team = teams[teamId]
    if (!team) throw new Error('Team not found')
    if (userId && !team.can(userId, 'manage_team')) throw new Error('无权限管理团队')
    if (updates.name) team.name = updates.name
    if (updates.description !== undefined) team.description = updates.description
    team.updatedAt = new Date().toISOString()
    this._save(teams)
    return team
  }

  async addMember(teamId, { userId, name, role = TEAM_ROLES.EDITOR }, operatorId) {
    const teams = this._load()
    const team = teams[teamId]
    if (!team) throw new Error('Team not found')
    if (operatorId && !team.can(operatorId, 'manage_members')) throw new Error('无权限管理成员')
    if (team.getMember(userId)) throw new Error('成员已存在')
    if (!Object.values(TEAM_ROLES).includes(role)) throw new Error('无效角色')
    team.members.push({ userId, name: name || userId, role, joinedAt: new Date().toISOString() })
    team.updatedAt = new Date().toISOString()
    this._save(teams)
    return team
  }

  async updateMemberRole(teamId, userId, role, operatorId) {
    const teams = this._load()
    const team = teams[teamId]
    if (!team) throw new Error('Team not found')
    if (operatorId && !team.can(operatorId, 'manage_members')) throw new Error('无权限管理成员')
    const member = team.getMember(userId)
    if (!member) throw new Error('成员不存在')
    if (member.role === TEAM_ROLES.OWNER) throw new Error('不能修改所有者角色')
    member.role = role
    this._save(teams)
    return team
  }

  async removeMember(teamId, userId, operatorId) {
    const teams = this._load()
    const team = teams[teamId]
    if (!team) throw new Error('Team not found')
    if (operatorId && !team.can(operatorId, 'manage_members')) throw new Error('无权限管理成员')
    if (team.getMember(userId)?.role === TEAM_ROLES.OWNER) throw new Error('不能移除所有者')
    team.members = team.members.filter((m) => m.userId !== userId)
    this._save(teams)
    return team
  }

  async addProject(teamId, projectId, userId) {
    const teams = this._load()
    const team = teams[teamId]
    if (!team) throw new Error('Team not found')
    if (userId && !team.can(userId, 'create_project')) throw new Error('无权限')
    if (!team.projectIds.includes(projectId)) team.projectIds.push(projectId)
    await projectService.updateProject(projectId, { teamId })
    this._save(teams)
    return team
  }

  async listTeamProjects(teamId) {
    const team = await this.getTeam(teamId)
    const projects = []
    for (const pid of team.projectIds) {
      try { projects.push(await projectService.getProject(pid)) } catch { /* skip */ }
    }
    return projects
  }
}

export const teamService = new TeamService()
export default teamService
