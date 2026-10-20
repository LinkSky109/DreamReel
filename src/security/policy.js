import { permissionsForRoles } from './roles.js'

export function authContextFromUser(user) {
  if (!user) return null
  const roles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : []
  return {
    userId: user.id || user.userId,
    orgId: user.orgId || 'default',
    roles,
    scopes: Array.isArray(user.scopes) ? user.scopes : [],
    permissions: permissionsForRoles(roles),
  }
}

export function can(auth, permission) {
  if (!auth) return false
  if (auth.permissions?.has(permission)) return true
  return Array.isArray(auth.scopes) && auth.scopes.includes(permission)
}

export default { authContextFromUser, can }
