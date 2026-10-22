import { z } from 'zod'

/** 团队写接口契约（/api/teams）。 */

export const teamCreateSchema = z.object({
  name: z.string().trim().min(1, '团队名称不能为空').max(100),
  description: z.string().max(1000).optional(),
})

export const teamUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
})

export const teamMemberAddSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  name: z.string().trim().max(100).optional(),
  role: z.enum(['owner', 'editor', 'viewer']).optional(),
})

export const teamMemberRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
})
