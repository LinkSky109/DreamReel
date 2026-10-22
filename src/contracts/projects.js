import { z } from 'zod'

/**
 * 项目写接口契约。
 * 与 projectService.updateProject 的 allowedFields 对齐；未知字段被剥离，
 * 避免客户端通过 updateProject 写入未声明字段。
 */

const nullableId = z.union([z.string().trim().max(128), z.null()])
const looseObject = z.record(z.string(), z.unknown())
const shotLike = z.union([z.array(z.unknown()), looseObject])

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1, '项目名称不能为空').max(200).optional(),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().max(2048).optional(),
  status: z.enum(['draft', 'in_progress', 'completed']).optional(),
  targetDuration: z.coerce.number().int().min(1).max(3600).optional(),
  style: z.string().max(100).optional(),
  platform: z.enum(['landscape', 'portrait']).optional(),
  script: looseObject.optional(),
  shots: shotLike.optional(),
  characters: z.array(z.unknown()).optional(),
  scenes: z.array(z.unknown()).optional(),
  templateId: z.string().max(128).optional(),
  lastAnalysis: looseObject.optional(),
  tags: z.array(z.string().trim().max(24)).max(50).optional(),
  audioConfig: looseObject.optional(),
  subtitleStyle: looseObject.optional(),
  dialogueAssignments: looseObject.optional(),
  visualStyle: looseObject.optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.union([z.string(), z.null()]).optional(),
  likeCount: z.coerce.number().int().min(0).optional(),
  viewCount: z.coerce.number().int().min(0).optional(),
  galleryCategory: z.string().max(64).optional(),
  challengeId: nullableId.optional(),
  teamId: nullableId.optional(),
  studioId: nullableId.optional(),
  directorMode: looseObject.optional(),
  providerPreferences: looseObject.optional(),
})
