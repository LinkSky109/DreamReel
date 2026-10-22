import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { writeChild, writeChildren, deleteChild } from './novelChildStore.js'
import { getImageProviderForProject } from '../providers/imageProviderFactory.js'
import { NovelAssetImage, ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '../models/NovelAssetImage.js'
import { writeNovelFile } from './novelProjectService.js'
import { getNovelProjectAsync, listAssetsAsync } from './novelAsyncReadService.js'
import { listCharactersAsync, listEntitiesAsync } from './novelAsyncReadService.js'
import { clampInt } from '../utils/coerce.js'
import { runPool } from '../utils/pool.js'
import { isGenericName } from '../utils/nameFilters.js'
import { deriveCharacterStagesAsync } from './characterGrowthService.js'

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

function assertNovelAsync(novelId) {
  return getNovelProjectAsync(novelId)
}

function assetPrompt(project, { category, name, prompt }) {
  const styleName = project?.style?.name || ''
  const visual = project?.style?.visual || project?.style?.description || ''
  const parts = [styleName, visual, CATEGORY_HINT[category] || CATEGORY_HINT.other, name, prompt].filter(Boolean)
  return parts.join('，').slice(0, 900)
}

export function listAssets(novelId, { category } = {}) {
  const list = storageService.listNovelAssetImages(novelId)
  const filtered = category ? list.filter((a) => a.category === category) : list
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function assetStatsFromRows(list) {
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

export function assetStats(novelId) {
  return assetStatsFromRows(storageService.listNovelAssetImages(novelId))
}

export async function assetStatsAsync(novelId) {
  return assetStatsFromRows(await listAssetsAsync(novelId))
}

export async function getAssetAsync(novelId, assetId) {
  const assets = await listAssetsAsync(novelId)
  return assets.find((a) => a.id === assetId) || null
}

async function persistIndex(novelId) {
  try {
    writeNovelFile(novelId, 'art/assets.json', JSON.stringify(await listAssetsAsync(novelId), null, 2))
  } catch (error) {
    logger.warn(`写设定图索引失败：${error.message}`)
  }
}

export async function createAsset(novelId, data = {}) {
  await assertNovelAsync(novelId)
  const asset = new NovelAssetImage({
    novelId,
    category: data.category,
    name: data.name,
    prompt: data.prompt,
    source: data.source,
    sourceId: data.sourceId,
  })
  if (!asset.name) throw new Error('name is required')
  const saved = await writeChild('assets', asset)
  await persistIndex(novelId)
  return saved
}

export async function updateAsset(novelId, assetId, patch = {}) {
  const asset = await getAssetAsync(novelId, assetId)
  if (!asset || asset.novelId !== novelId) throw new Error(`asset not found: ${assetId}`)
  for (const key of ['category', 'name', 'prompt']) {
    if (patch[key] !== undefined) asset[key] = patch[key]
  }
  if (patch.category !== undefined && !ASSET_CATEGORIES.includes(patch.category)) asset.category = 'other'
  asset.updatedAt = new Date().toISOString()
  const saved = await writeChild('assets', asset)
  await persistIndex(novelId)
  return saved
}

export async function deleteAsset(novelId, assetId) {
  const asset = await getAssetAsync(novelId, assetId)
  if (!asset || asset.novelId !== novelId) throw new Error(`asset not found: ${assetId}`)
  if (asset.filePath && fs.existsSync(asset.filePath)) {
    try { fs.rmSync(asset.filePath, { force: true }) } catch { /* ignore */ }
  }
  await deleteChild('assets', assetId)
  await persistIndex(novelId)
  return { id: assetId, deleted: true }
}

/**
 * 生成设定图（调用图片 provider）。opts: { userId, aspectRatio, provider }
 */
export async function generateAssetImage(novelId, assetId, opts = {}) {
  const project = await assertNovelAsync(novelId)
  const asset = await getAssetAsync(novelId, assetId)
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
  const saved = await writeChild('assets', asset)
  await persistIndex(novelId)
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
  await assertNovelAsync(novelId)
  const limit = clampInt(opts.limit, 4, 1, 24)
  const concurrency = clampInt(opts.concurrency, 2, 1, 6)
  const cats = Array.isArray(opts.categories) && opts.categories.length ? new Set(opts.categories) : null
  const pick = (a) => !a.imageUrl && a.status !== 'generated' && (!cats || cats.has(a.category))
  const todo = (await listAssetsAsync(novelId)).filter(pick).slice(0, limit)
  let ok = 0
  let failed = 0
  let stopped = false
  const shouldStop = typeof opts.shouldStop === 'function' ? opts.shouldStop : () => false
  await runPool(
    todo,
    async (a) => {
      // 每张图开始前检查中断标志：取消后不再启动新的生成
      if (shouldStop()) {
        stopped = true
        return
      }
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
  storageService._flush() // 批量操作后立即落盘（save 为 debounce，避免调用方退出丢数据）
  const all = await listAssetsAsync(novelId)
  return {
    processed: todo.length,
    ok,
    failed,
    stopped,
    cancelled: shouldStop(),
    total: all.length,
    withImages: all.filter((a) => a.imageUrl).length,
    remaining: all.filter(pick).length,
  }
}

/**
 * 归一化设定图：把 sourceId 按名称重绑到当前角色/实体；泛名或重名加「类别·」前缀使其更具体。
 * 解决：重抽后 sourceId 全部失效、以及"人类/绝望"这类泛名导致误关联。
 */
export async function normalizeAssets(novelId) {
  const byName = new Map()
  for (const c of await listCharactersAsync(novelId)) if (c.name) byName.set(c.name, { id: c.id, source: 'character' })
  for (const e of await listEntitiesAsync(novelId)) if (e.name) byName.set(e.name, { id: e.id, source: 'entity' })

  const assets = await listAssetsAsync(novelId)
  const nameCount = {}
  for (const a of assets) nameCount[a.name] = (nameCount[a.name] || 0) + 1

  let relinked = 0
  let renamed = 0
  for (const a of assets) {
    const hit = byName.get(a.name)
    if (hit && a.sourceId !== hit.id) {
      a.sourceId = hit.id
      a.source = hit.source
      relinked++
    }
    if (isGenericName(a.name) || nameCount[a.name] > 1) {
      const label = ASSET_CATEGORY_LABELS[a.category] || a.category
      const nn = `${label}·${a.name}`
      if (nn !== a.name) {
        a.name = nn
        renamed++
      }
    }
    a.updatedAt = new Date().toISOString()
    await writeChild('assets', a)
  }
  await persistIndex(novelId)
  return { total: assets.length, relinked, renamed }
}

export async function suggestAssets(novelId, opts = {}) {
  await assertNovelAsync(novelId)
  const categoryFilter = Array.isArray(opts.categories) && opts.categories.length ? new Set(opts.categories) : null
  const existing = new Set((await listAssetsAsync(novelId)).map((a) => a.sourceId).filter(Boolean))
  const drafts = []
  const push = (category, name, prompt, source, sourceId, meta = {}) => {
    if (!name || existing.has(sourceId)) return
    if (categoryFilter && !categoryFilter.has(category)) return
    drafts.push({ category, name, prompt, source, sourceId, ...meta })
  }

  // 角色：优先按「形象时间线」拆成多个阶段（少年期 / 荒漠期 / 终局形态…），
  // 避免整个作品只有一张终态设定图。没有时间线时回退为静态角色卡。
  const withStages = opts.stages !== false
  for (const c of await listCharactersAsync(novelId)) {
    const stages = withStages ? await deriveCharacterStagesAsync(novelId, c.id, { maxStages: opts.maxStages || 8 }) : []
    if (stages.length) {
      for (const st of stages) {
        const desc = [
          st.appearance,
          st.equipment ? `装备：${st.equipment}` : '',
          st.injuries ? `伤势：${st.injuries}` : '',
          st.abilities ? `能力：${st.abilities}` : '',
        ]
          .filter(Boolean)
          .join('；')
        push('character', `${c.name}·第${st.episodeNo}集`, desc, 'character', `${c.id}:ep${st.episodeNo}`, {
          characterId: c.id,
          episodeNo: st.episodeNo,
          stageLabel: `第${st.episodeNo}集`,
        })
      }
      continue
    }
    const card = c.card || {}
    const desc = [card.appearance, card.personality, card.combatStyle, card.abilities].filter(Boolean).join('；')
    push('character', c.name, desc, 'character', c.id, { characterId: c.id })
  }
  for (const e of await listEntitiesAsync(novelId)) {
    const category = ENTITY_CATEGORY[e.type]
    if (!category) continue
    const attrs = Object.values(e.attributes || {}).filter((v) => typeof v === 'string').slice(0, 4).join('；')
    const desc = [e.description, attrs].filter(Boolean).join('；')
    push(category, e.name, desc, 'entity', e.id)
  }

  const saved = await writeChildren('assets', drafts.map((d) => new NovelAssetImage({ novelId, ...d })))
  await persistIndex(novelId)
  return saved
}
