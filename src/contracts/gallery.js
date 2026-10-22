import { z } from 'zod'

/** 作品广场写接口契约（/api/gallery）。 */

export const GALLERY_CATEGORY_IDS = ['short', 'ad', 'vlog', 'knowledge', 'music', 'promo']

export const galleryPublishSchema = z.object({
  category: z.enum(GALLERY_CATEGORY_IDS).optional(),
})

export const galleryRemixSchema = z.object({
  newName: z.string().trim().min(1).max(200).optional(),
})

export const galleryLikeSchema = z.object({}).strip()
