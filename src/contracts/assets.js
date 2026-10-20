import { z } from 'zod'

/** 设定图集批量出图请求体 */
export const bulkGenerateAssetsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
  concurrency: z.coerce.number().int().min(1).max(6).optional(),
  categories: z.array(z.string().min(1).max(64)).max(20).optional(),
  reset: z.boolean().optional(),
  onlyMissing: z.boolean().optional(),
})

export const bulkCancelAssetsSchema = z.object({}).optional()
