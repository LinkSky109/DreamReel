/**
 * 分季「设定图子集」：一季真正用得到的设定图（而不是全书 573 张）。
 *
 * 子集来源（并集）：
 *   (a) 本季各集分镜里**已引用**的参考图；
 *   (b) 本季**章节正文里出现过的角色/世界观实体**对应的设定图（按 sourceId 关联）。
 * 这样每季只关心自己相关的设定图，出图/参考图匹配都在子集内进行，流程更聚焦。
 */
import { storageService } from './storageService.js'
import { listChunks } from './novelChunkService.js'
import { listCharacters } from './characterExtractionService.js'
import { listEntities } from './worldbuildingService.js'
import { clampInt } from '../utils/coerce.js'
import { runPool } from '../utils/pool.js'
import { generateAssetImage } from './novelAssetService.js'

export function seasonAssetSubset(novelId, seasonId) {
  const season = storageService.getSeason(seasonId)
  if (!season || season.novelId !== novelId) throw new Error(`season not found: ${seasonId}`)
  const eps = storageService.listEpisodes(novelId, seasonId)

  // (a) 分镜里已引用的图
  const refUrls = new Set()
  for (const e of eps) {
    for (const s of e.screenplay?.shots || []) for (const u of s.referenceImages || []) refUrls.add(u)
  }

  // (b) 本季章节正文里出现过的角色/实体 → 名称（按名称关联，避免 id 因重抽而失效）
  const start = season.chapterStart ?? 0
  const end = season.chapterEnd ?? Number.MAX_SAFE_INTEGER
  const chunks = listChunks(novelId).filter((c) => c.index >= start && c.index < end)
  const text = chunks.map((c) => c.text || '').join('\n')
  const mentionedNames = new Set()
  if (text) {
    for (const c of listCharacters(novelId)) {
      if (c.name && c.name.length >= 2 && text.includes(c.name)) mentionedNames.add(c.name)
      for (const al of c.aliases || []) if (al && al.length >= 2 && text.includes(al)) mentionedNames.add(c.name)
    }
    for (const e of listEntities(novelId)) {
      if (e.name && e.name.length >= 2 && text.includes(e.name)) mentionedNames.add(e.name)
      for (const al of e.aliases || []) if (al && al.length >= 2 && text.includes(al)) mentionedNames.add(e.name)
    }
  }

  const assets = storageService.listNovelAssetImages(novelId)
  const subset = assets.filter((a) => (a.imageUrl && refUrls.has(a.imageUrl)) || (a.name && mentionedNames.has(a.name)))
  const items = subset.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    imageUrl: a.imageUrl,
    source: a.source,
    sourceId: a.sourceId,
  }))
  return {
    seasonId,
    seasonTitle: season.title,
    chapters: `${start}-${end}`,
    episodes: eps.length,
    totalAssets: assets.length,
    subsetCount: subset.length,
    withImages: subset.filter((a) => a.imageUrl).length,
    remaining: subset.filter((a) => !a.imageUrl).length,
    assets: items,
  }
}

/** 只为本季「涉及的」设定图批量出图（分批、限并发、可续跑） */
export async function bulkGenerateSeasonAssets(novelId, seasonId, opts = {}) {
  const limit = clampInt(opts.limit, 3, 1, 12)
  const concurrency = clampInt(opts.concurrency, 2, 1, 4)
  const sub = seasonAssetSubset(novelId, seasonId)
  const todo = sub.assets.filter((a) => !a.imageUrl).map((a) => a.id).slice(0, limit)
  let ok = 0
  let failed = 0
  await runPool(
    todo,
    async (aid) => {
      try {
        const r = await generateAssetImage(novelId, aid, { userId: opts.userId })
        if (r && r.imageUrl) ok++
        else failed++
      } catch {
        failed++
      }
    },
    concurrency
  )
  const after = seasonAssetSubset(novelId, seasonId)
  return {
    processed: todo.length,
    ok,
    failed,
    subsetCount: after.subsetCount,
    withImages: after.withImages,
    remaining: after.remaining,
  }
}

export default { seasonAssetSubset, bulkGenerateSeasonAssets }
