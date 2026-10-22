import { z } from 'zod'

/**
 * 小说域写接口契约（/api/novels）。
 *
 * 约定：
 * - 请求体/查询参数在这里集中定义，路由用 validateBody / validateQuery 接入；
 * - 数值字段使用 `z.coerce.*`，兼容 query string 与表单里的数字字符串；
 * - 布尔字段接受 JSON 布尔与 'true'/'false'/'1'/'0'，避免 `z.coerce.boolean()`
 *   把字符串 'false' 误判为 true；
 * - 未知字段默认被 zod 剥离，但路由会与原始 req.body 合并后再交给 service，
 *   因此不会破坏现有调用方附带的额外字段。
 */

const providerName = z.string().trim().min(1).max(64)
const modelName = z.string().trim().min(1).max(128)
const boolToken = z.union([
  z.boolean(),
  z.literal(0),
  z.literal(1),
  z.enum(['0', '1', 'true', 'false']),
])
const boolish = boolToken.transform((value) => value === true || value === 1 || value === '1' || value === 'true')

const NOVEL_STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose']

/** 分季分集规划：POST /api/novels/:id/series/plan */
export const seriesPlanSchema = z.object({
  episodeSeconds: z.coerce.number().positive().max(3600).optional(),
  episodesPerSeason: z.coerce.number().int().positive().max(1000).optional(),
  charsPerSecond: z.coerce.number().positive().max(20).optional(),
  tolerance: z.coerce.number().min(0).max(120).optional(),
  maxChapters: z.coerce.number().int().positive().max(100000).optional(),
  useLLM: boolish.optional(),
  provider: providerName.optional(),
  model: modelName.optional(),
  force: boolish.optional(),
  forceSeasons: boolish.optional(),
  advanceTo: z.enum(NOVEL_STAGES).optional(),
})

/** 分集大纲读取：GET /api/novels/:id/episodes/:eid/outline */
export const episodeOutlineQuerySchema = z.object({
  force: boolish.optional(),
  useLLM: boolish.optional(),
  provider: providerName.optional(),
  model: modelName.optional(),
})

/** 分集大纲生成/重算：POST|PUT /api/novels/:id/episodes/:eid/outline */
export const episodeOutlineBodySchema = episodeOutlineQuerySchema

/** 单集成片：POST /api/novels/:id/episodes/:eid/compose */
export const episodeComposeSchema = z.object({
  seconds: z.coerce.number().positive().max(3600).optional(),
})

/** 单集剧本：POST /api/novels/:id/episodes/:eid/script */
export const episodeScriptSchema = z.object({
  provider: providerName.optional(),
  outlineProvider: providerName.optional(),
  stateProvider: providerName.optional(),
})

/** 单集资产（图/音/视频）：POST /api/novels/:id/episodes/:eid/assets */
export const episodeAssetsSchema = z.object({
  image: boolish.optional(),
  audio: boolish.optional(),
  video: boolish.optional(),
  voice: z.string().trim().min(1).max(128).optional(),
  duration: z.coerce.number().positive().max(3600).optional(),
  resolution: z.string().trim().min(1).max(32).optional(),
  aspectRatio: z.string().trim().min(1).max(16).optional(),
  videoTimeoutMs: z.coerce.number().int().positive().max(3600000).optional(),
  scriptProvider: providerName.optional(),
})

/** 按季批量生成：POST /api/novels/:id/seasons/:sid/bulk */
export const seasonBulkSchema = z.object({
  task: z.enum(['script', 'assets']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  concurrency: z.coerce.number().int().min(1).max(8).optional(),
  onlyMissing: boolish.optional(),
})

/** 按季批量出设定图：POST /api/novels/:id/seasons/:sid/assets/bulk-generate */
export const seasonAssetsBulkSchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).optional(),
  concurrency: z.coerce.number().int().min(1).max(4).optional(),
})
