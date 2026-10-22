import { z } from 'zod'

/** 视频域写接口契约（/api/video）。 */

const projectId = z.string().trim().min(1).max(128)
const shotId = z.string().trim().min(1).max(128)
const optionalText = (max = 5000) => z.string().max(max).optional()
const styleId = z.string().trim().max(64).optional()

const duration = z.coerce.number().positive().max(60).optional()
const resolution = z.string().trim().max(32).optional()
const aspectRatio = z.string().trim().max(16).optional()

export const videoGenerateSchema = z.object({
  projectId,
  shotId: shotId.optional(),
  prompt: z.string().trim().min(1, 'prompt 不能为空').max(5000),
  referenceImages: z.array(z.string().max(2048)).max(20).optional(),
  duration,
  resolution,
  aspectRatio,
  styleId,
})

export const videoRegenerateSchema = z.object({
  projectId,
  shotId,
  newPrompt: optionalText(),
  styleId,
})

export const videoCandidatesSchema = z.object({
  projectId,
  shotId,
  count: z.coerce.number().int().min(1).max(5).optional(),
  styleId,
})

export const shotLockSchema = z.object({
  projectId,
  locked: z.boolean().optional(),
})

export const shotUpdateSchema = z.object({
  projectId,
  description: optionalText(),
  duration: z.coerce.number().positive().max(60).optional(),
  dialogue: optionalText(),
  narration: optionalText(),
  sceneId: z.string().max(128).optional(),
  characterActions: z.array(z.unknown()).optional(),
})

export const shotVersionSchema = z.object({
  projectId,
})

export const continuityQuerySchema = z.object({
  projectId,
})
