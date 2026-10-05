import { v4 as uuidv4 } from 'uuid'

/**
 * R12：团队模型
 */

export const TEAM_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
}

export const ROLE_PERMISSIONS = {
  owner: ['manage_team', 'manage_members', 'create_project', 'edit_project', 'delete_project', 'view'],
  editor: ['create_project', 'edit_project', 'view'],
  viewer: ['view'],
}

export class Team {
  constructor({ id, name, description, ownerId, members, projectIds, createdAt, updatedAt } = {}) {
    this.id = id || uuidv4()
    this.name = name || '未命名团队'
    this.description = description || ''
    this.ownerId = ownerId || 'default'
    this.members = Array.isArray(members)
      ? members
      : [{ userId: this.ownerId, role: TEAM_ROLES.OWNER, name: '创建者', joinedAt: new Date().toISOString() }]
    this.projectIds = Array.isArray(projectIds) ? projectIds : []
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  getMember(userId) {
    return this.members.find((m) => m.userId === userId) || null
  }

  hasRole(userId, role) {
    return this.getMember(userId)?.role === role
  }

  can(userId, permission) {
    const member = this.getMember(userId)
    if (!member) return false
    return (ROLE_PERMISSIONS[member.role] || []).includes(permission)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ownerId: this.ownerId,
      members: this.members,
      projectIds: this.projectIds,
      memberCount: this.members.length,
      projectCount: this.projectIds.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

export default Team
