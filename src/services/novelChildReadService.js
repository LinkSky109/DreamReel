import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { createPostgresNovelChildRepository } from '../repositories/novelChildRepository.js'
import { stableStringify } from '../utils/stableJson.js'
import { listChunks } from './novelChunkService.js'
import { listCharacters } from './characterExtractionService.js'
import { listEntities } from './worldbuildingService.js'
import { listSeasons, listEpisodes } from './seriesPlannerService.js'
import { listAssets } from './novelAssetService.js'

/**
 * 小说子集合只读切换（chunks / characters / entities）。
 * legacy：JSON；shadow：返回 JSON 并比对 PG；postgres：返回 PG。
 */
export function createNovelChildReadService({
  legacy,
  getRepo,
  mode = 'legacy',
  orgId = 'default',
  log = logger,
} = {}) {
  function selectionIds(novelId) {
    const project = storageService.getNovelProject(novelId)
    const characterSet = project?.selectedCharacterSet
      ? storageService.getCharacterSet(project.selectedCharacterSet)
      : null
    const worldSet = project?.selectedWorldSet ? storageService.getWorldSet(project.selectedWorldSet) : null
    return {
      characters: characterSet ? new Set(characterSet.characterIds || []) : null,
      entities: worldSet ? new Set(worldSet.entityIds || []) : null,
    }
  }

  function normalizePg(kind, novelId, rows, opts = {}) {
    if (kind === 'chunks') return [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (kind === 'seasons') return [...rows].sort((a, b) => (a.seasonNo ?? 0) - (b.seasonNo ?? 0))
    if (kind === 'episodes') {
      const filtered = opts.seasonId ? rows.filter((row) => row.seasonId === opts.seasonId) : rows
      return [...filtered].sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
    }
    if (kind === 'assets') {
      const filtered = opts.category ? rows.filter((row) => row.category === opts.category) : rows
      // 先按源顺序，再按 createdAt 降序稳定排序，和旧接口一致
      return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }
    const selected = selectionIds(novelId)
    if (kind === 'characters' && selected.characters) {
      return rows.filter((row) => selected.characters.has(row.id))
    }
    if (kind === 'entities') {
      const filtered = selected.entities ? rows.filter((row) => selected.entities.has(row.id)) : rows
      return [...filtered].sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    }
    return rows
  }

  function compare(kind, novelId, legacyRows, pgRows, requestId) {
    const legacyMap = new Map(legacyRows.map((d) => [d.id, d]))
    const pgMap = new Map(pgRows.map((d) => [d.id, d]))
    const missing = [...legacyMap.keys()].filter((id) => !pgMap.has(id))
    const extra = [...pgMap.keys()].filter((id) => !legacyMap.has(id))
    const changed = [...legacyMap.keys()]
      .filter((id) => pgMap.has(id) && stableStringify(legacyMap.get(id)) !== stableStringify(pgMap.get(id)))
      .slice(0, 10)
    if (missing.length || extra.length || changed.length) {
      log.warn('[novel-child-shadow] mismatch', {
        requestId,
        kind,
        novelId,
        missing: missing.slice(0, 10),
        extra: extra.slice(0, 10),
        changed,
        counts: { legacy: legacyRows.length, postgres: pgRows.length },
      })
    }
  }

  return {
    mode,

    async list(kind, novelId, { requestId, seasonId, category } = {}) {
      const legacyRows = legacy.list(kind, novelId, { seasonId, category })
      if (mode === 'legacy') return legacyRows
      let pgRows
      try {
        const repo = await getRepo()
        pgRows = await repo.list(kind, novelId, { orgId })
      } catch (error) {
        log.warn('[novel-child-read] postgres 读取失败，回退 legacy', {
          requestId,
          kind,
          novelId,
          message: error.message,
        })
        return legacyRows
      }
      const normalizedPg = normalizePg(kind, novelId, pgRows, { seasonId, category })
      if (mode === 'shadow') {
        compare(kind, novelId, legacyRows, normalizedPg, requestId)
        return legacyRows
      }
      return normalizedPg
    },
  }
}

let repoPromise = null

function getRepoLazy() {
  if (!repoPromise) {
    repoPromise = import('../db/client.js').then(({ getDb }) => createPostgresNovelChildRepository(getDb()))
  }
  return repoPromise
}

export const novelChildReadService = createNovelChildReadService({
  legacy: {
    list: (kind, novelId, opts = {}) => {
      if (kind === 'chunks') return listChunks(novelId)
      if (kind === 'characters') return listCharacters(novelId)
      if (kind === 'entities') return listEntities(novelId)
      if (kind === 'seasons') return listSeasons(novelId)
      if (kind === 'episodes') return listEpisodes(novelId, opts.seasonId)
      if (kind === 'assets') return listAssets(novelId, { category: opts.category })
      throw new Error(`未知子集合：${kind}`)
    },
  },
  getRepo: getRepoLazy,
  mode: config.novels.repoMode,
  orgId: config.novels.orgId,
})
