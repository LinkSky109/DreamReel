/**
 * 角色与权限矩阵（Phase 5 基础）。
 * 组织角色用于租户级能力；项目角色用于项目内操作。
 */

export const ORG_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  BILLING: 'billing',
}

export const PROJECT_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  COMMENTER: 'commenter',
  VIEWER: 'viewer',
}

export const PERMISSIONS = {
  PROJECT_READ: 'project:read',
  PROJECT_WRITE: 'project:write',
  PROJECT_DELETE: 'project:delete',
  NOVEL_READ: 'novel:read',
  NOVEL_WRITE: 'novel:write',
  NOVEL_DELETE: 'novel:delete',
  TEAM_MANAGE: 'team:manage',
  BILLING_MANAGE: 'billing:manage',
  AUDIT_READ: 'audit:read',
  API_KEY_MANAGE: 'api_key:manage',
  ENTERPRISE_MANAGE: 'enterprise:manage',
}

const P = PERMISSIONS

const ALL = Object.values(P)

export const ORG_ROLE_PERMISSIONS = {
  owner: ALL,
  admin: ALL.filter((p) => p !== P.BILLING_MANAGE),
  editor: [P.PROJECT_READ, P.PROJECT_WRITE, P.NOVEL_READ, P.NOVEL_WRITE],
  viewer: [P.PROJECT_READ, P.NOVEL_READ],
  billing: [P.BILLING_MANAGE, P.PROJECT_READ],
}

export const PROJECT_ROLE_PERMISSIONS = {
  owner: [P.PROJECT_READ, P.PROJECT_WRITE, P.PROJECT_DELETE, P.NOVEL_READ, P.NOVEL_WRITE, P.NOVEL_DELETE],
  editor: [P.PROJECT_READ, P.PROJECT_WRITE, P.NOVEL_READ, P.NOVEL_WRITE],
  commenter: [P.PROJECT_READ, P.NOVEL_READ],
  viewer: [P.PROJECT_READ, P.NOVEL_READ],
}

export function permissionsForRoles(roles = []) {
  const set = new Set()
  for (const role of roles) {
    for (const permission of ORG_ROLE_PERMISSIONS[role] || []) set.add(permission)
    for (const permission of PROJECT_ROLE_PERMISSIONS[role] || []) set.add(permission)
  }
  return set
}
