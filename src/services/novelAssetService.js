import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { getImageProviderForProject } from '../providers/imageProviderFactory.js'
import { NovelAssetImage, ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '../models/NovelAssetImage.js'
import { getNovelProject, writeNovelFile } from './novelProjectService.js'
import { listCharacters } from './characterExtractionService.js'
import { listEntities } from './worldbuildingService.js'
import { clampInt } from '../utils/coerce.js'
import { runPool } from '../utils/pool.js'

/**
 * 设定图集（Sprint 28）
 * 一部小说的成套设定图（角色/衣物/装备/建筑/场景/道具…），复用图片 provider 生成，
 * 供后续「图生视频」作为参考/首帧复用。
 */

const IMAGES_ROOT = path.join(config.storage.path, 'images', 'novels')

/** 世界观实体类型 → 设定图类别 */
const ENTITY_CATEGORY = {
  item: 'equipment',
  location: 'scene',
  race: 'character',
  culture: 'clothing',
  prophecy: 'prop',
  faction: 'architecture',
  power: 'other',
  world: 'scene',
  civilization: 'architecture',
}

const CATEGORY_HINT = {
  character: '角色设定图，全身，正面三视图，干净背景',
  clothing: '服装设定图，平铺/立绘，面料与纹样清晰',
  equipment: '装备设定图，多角度展示，金属与材质细节',
  architecture: '建筑设计图，外观透视，结构清晰',
  scene: '场景概念图，氛围光影，环境全景',
  prop: '道具设定图，单品特写，干净背景',
  other: '概念设定图，干净背景',
}

function assertNovel(novelId) {
  return getNovelProject(novelId)
}

function assetPrompt(project, { category, name, prompt }) {
  const styleName = project?.style?.name || ''
  const visual = project?.style?.visual || project?.style?.description || ''
  const parts = [styleName, visual, CATEGORY_HINT[category] || CATEGORY_HINT.other, name, prompt].filter(Boolean)
  return parts.join('，').slice(0, 900)
}

export function listAssets(novelId, { category } = {}) {
  assertNovel(novelId)
  const list = storageService.listNovelAssetImages(novelId)
  const filtered = category ? list.filter((a) => a.category === category) : list
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function assetStats(novelId) {
  const list = storageService.listNovelAssetImages(novelId)
  const byCategory = {}
  for (const c of ASSET_CATEGORIES) byCategory[c] = 0
  for (const a of list) byCategory[a.category] = (byCategory[a.category] || 0) + 1
  return {
    total: list.length,
    generated: list.filter((a) => a.status === 'generated').length,
    failed: list.filter((a) => a.status === 'failed').length,
    byCategory,
    byCategoryLabel: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [ASSET_CATEGORY_LABELS[k] || k, v])),
  }
}

function persistIndex(novelId) {
  try {
    writeNovelFile(novelId, 'art/assets.json', JSON.stringify(listAssets(novelId), null, 2))
  } catch (error) {
    logger.warn(`写设定图索引失败：${error.message}`)
  }
}

export function createAsset(novelId, data = {}) {
  assertNovel(novelId)
  const asset = new NovelAssetImage({
    novelId,
    category: data.category,
    name: data.name,
    prompt: data.prompt,
    source: data.source,
    sourceId: data.sourceId,
  })
  if (!asset.name) throw new Error('name is required')
  const saved = storageService.createNovelAssetImage(asset)
  persistIndex(novelId)
  return saved
}

export function updateAsset(novelId, assetId, patch = {}) {
  const asset = storageService.getNovelAssetImage(assetId)
  if (!asset || asset.novelId !== novelId) throw new Error(`asset not found: ${assetId}`)
  for (const key of ['category', 'name', 'prompt']) {
    if (patch[key] !== undefined) asset[key] = patch[key]
  }
  if (patch.category !== undefined && !ASSET_CATEGORIES.includes(patch.category)) asset.category = 'other'
  asset.updatedAt = new Date().toISOString()
  const saved = storageService.updateNovelAssetImage(asset)
  persistIndex(novelId)
  return saved
}

export function deleteAsset(novelId, assetId) {
  const asset = storageService.getNovelAssetImage(assetId)
  if (!asset || asset.novelId !== novelId) throw new Error(`asset not found: ${assetId}`)
  if (asset.filePath && fs.existsSync(asset.filePath)) {
    try { fs.rmSync(asset.filePath, { force: true }) } catch { /* ignore */ }
  }
  storageService.deleteNovelAssetImage(assetId)
  persistIndex(novelId)
  return { id: assetId, deleted: true }
}

/**
 * 生成设定图（调用图片 provider）。opts: { userId, aspectRatio, provider }
 */
export async function generateAssetImage(novelId, assetId, opts = {}) {
  const project = assertNovel(novelId)
  const asset = storageService.getNovelAssetImage(assetId)
  if (!asset || asset.novelId !== novelId) throw new Error(`asset not found: ${assetId}`)

  const outDir = path.join(IMAGES_ROOT, novelId, 'assets')
  fs.mkdirSync(outDir, { recursive: true })
  const outputPath = path.join(outDir, `${assetId}.png`)

  const provider = opts.provider || getImageProviderForProject(null, opts.userId ?? null)
  const prompt = assetPrompt(project, asset)
  try {
    await provider.generateImage({
      prompt,
      outputPath,
      aspectRatio: opts.aspectRatio || '16:9',
    })
    asset.status = 'generated'
    asset.imageUrl = `/storage/images/novels/${novelId}/assets/${assetId}.png`
    asset.filePath = outputPath
    asset.provider = provider.name
    asset.error = null
  } catch (error) {
    asset.status = 'failed'
    asset.error = String(error.message || error).slice(0, 300)
    logger.warn(`设定图生成失败（${asset.name}）：${asset.error}`)
  }
  asset.updatedAt = new Date().toISOString()
  const saved = storageService.updateNovelAssetImage(asset)
  persistIndex(novelId)
  return saved
}

/**
 * 从已抽取的角色/世界观生成候选设定图（仅草稿，不含图）。
 * opts: { categories?: string[] }
 */
/**
 * 批量生成设定图（分批、并发、可续跑）。
 * 图片生成较慢（单张约 1 分钟）且走付费 provider，故必须分批 + 限并发，前端循环调用。
 * opts: { limit?, concurrency?, categories?, userId? }
 */
export async function bulkGenerateImages(novelId, opts = {}) {
  assertNovel(novelId)
  const limit = clampInt(opts.limit, 4, 1, 24)
  const concurrency = clampInt(opts.concurrency, 2, 1, 6)
  const cats = Array.isArray(opts.categories) && opts.categories.length ? new Set(opts.categories) : null
  const pick = (a) => !a.imageUrl && a.status !== 'generated' && (!cats || cats.has(a.category))
  const todo = storageService.listNovelAssetImages(novelId).filter(pick).slice(0, limit)
  let ok = 0
  let failed = 0
  await runPool(
    todo,
    async (a) => {
      try {
        const r = await generateAssetImage(novelId, a.id, { userId: opts.userId })
        if (r && r.imageUrl) ok++
        else failed++
      } catch {
        failed++
      }
    },
    concurrency
  )
  const all = storageService.listNovelAssetImages(novelId)
  return {
    processed: todo.length,
    ok,
    failed,
    total: all.length,
    withImages: all.filter((a) => a.imageUrl).length,
    remaining: all.filter(pick).length,
  }
}

export function suggestAssets(novelId, opts = {}) {
  assertNovel(novelId)
  const categoryFilter = Array.isArray(opts.categories) && opts.categories.length ? new Set(opts.categories) : null
  const existing = new Set(storageService.listNovelAssetImages(novelId).map((a) => a.sourceId).filter(Boolean))
  const drafts = []
  const push = (category, name, prompt, source, sourceId) => {
    if (!name || existing.has(sourceId)) return
    if (categoryFilter && !categoryFilter.has(category)) return
    drafts.push({ category, name, prompt, source, sourceId })
  }

  for (const c of listCharacters(novelId)) {
    const card = c.card || {}
    const desc = [card.appearance, card.personality, card.combatStyle, card.abilities].filter(Boolean).join('；')
    push('character', c.name, desc, 'character', c.id)
  }
  for (const e of listEntities(novelId)) {
    const category = ENTITY_CATEGORY[e.type]
    if (!category) continue
    const attrs = Object.values(e.attributes || {}).filter((v) => typeof v === 'string').slice(0, 4).join('；')
    const desc = [e.description, attrs].filter(Boolean).join('；')
    push(category, e.name, desc, 'entity', e.id)
  }

  const saved = drafts.map((d) => storageService.createNovelAssetImage(new NovelAssetImage({ novelId, ...d })))
  persistIndex(novelId)
  return saved
}
