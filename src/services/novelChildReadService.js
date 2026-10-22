import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { createPostgresNovelChildRepository } from '../repositories/novelChildRepository.js'
import { getChunkText } from './novelProjectService.js'
import { novelReadService } from './novelReadService.js'
import { listChunks } from './novelChunkService.js'
import { listCharacters, listCharacterSets } from './characterExtractionService.js'
import { listEntities, listWorldSets } from './worldbuildingService.js'
import { listSeasons, listEpisodes } from './seriesPlannerService.js'
import { listAssets } from './novelAssetService.js'
import { listStates } from './characterGrowthService.js'

/**
 * 小说子集合只读服务（Phase 3c-2）。
 *
 * PostgreSQL 是唯一读源；不再有 legacy/shadow 回退。
 * 项目投影仅用于 selectedCharacterSet/selectedWorldSet 过滤；后续异步化后可移除。
 */
export function createNovelChildReadService({
  legacy,
  getRepo,
  getProject = (id) => storageService.getNovelProject(id),
  getProjectAsync = async (id) => getProject(id),
  mode = 'postgres',
  orgId = 'default',
  log = logger,
} = {}) {
  async function selectionIds(repo, novelId) {
    const project = await getProjectAsync(novelId)
    const [characterSets, worldSets] = await Promise.all([
      repo.list('characterSets', novelId, { orgId }),
      repo.list('worldSets', novelId, { orgId }),
    ])
    const characterSet = characterSets.find((s) => s.id === project?.selectedCharacterSet)
    const worldSet = worldSets.find((s) => s.id === project?.selectedWorldSet)
    return {
      characters: characterSet ? new Set(characterSet.characterIds || []) : null,
      entities: worldSet ? new Set(worldSet.entityIds || []) : null,
    }
  }

  async function normalizePg(repo, kind, novelId, rows, opts = {}) {
    if (kind === 'chunks') {
      // PG content 可能为空（正文只在 cleaned.txt）；按偏移水合，保证接口仍返回 text
      return [...rows]
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((row) => {
          if (typeof row.text === 'string' && row.text.length) return row
          const text = getChunkText(novelId, row)
          return text ? { ...row, text } : row
        })
    }
    if (kind === 'seasons') return [...rows].sort((a, b) => (a.seasonNo ?? 0) - (b.seasonNo ?? 0))
    if (kind === 'states') {
      const filtered = opts.characterId ? rows.filter((row) => row.characterId === opts.characterId) : rows
      return [...filtered].sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
    }
    if (kind === 'episodes') {
      const filtered = opts.seasonId ? rows.filter((row) => row.seasonId === opts.seasonId) : rows
      return [...filtered].sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
    }
    if (kind === 'assets') {
      const filtered = opts.category ? rows.filter((row) => row.category === opts.category) : rows
      // 先按源顺序，再按 createdAt 降序稳定排序，和旧接口一致
      return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }
    const selected = await selectionIds(repo, novelId)
    if (kind === 'characters' && selected.characters) {
      return rows.filter((row) => selected.characters.has(row.id))
    }
    if (kind === 'entities') {
      const filtered = selected.entities ? rows.filter((row) => selected.entities.has(row.id)) : rows
      return [...filtered].sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
    }
    return rows
  }

  async function listRows(kind, novelId, { requestId, seasonId, category, characterId } = {}) {
    if (mode === 'legacy') return legacy.list(kind, novelId, { seasonId, category, characterId })
    try {
      const repo = await getRepo()
      const rows = await repo.list(kind, novelId, { orgId })
      return normalizePg(repo, kind, novelId, rows, { seasonId, category, characterId })
    } catch (error) {
      log.warn('[novel-child-read] postgres 读取失败', {
        requestId,
        kind,
        novelId,
        message: error.message,
      })
      throw error
    }
  }

  async function listSets(kind, novelId, { requestId } = {}) {
    if (mode === 'legacy') return legacy.listSets(kind, novelId)
    try {
      const repo = await getRepo()
      const sets = await repo.list(kind, novelId, { orgId })
      const liveRows = await listRows(kind === 'characterSets' ? 'characters' : 'entities', novelId, { requestId })
      const live = new Set(liveRows.map((row) => row.id))
      const project = await getProjectAsync(novelId)
      const order = kind === 'characterSets' ? project?.characterSets || [] : project?.worldSets || []
      const selected = kind === 'characterSets' ? project?.selectedCharacterSet : project?.selectedWorldSet
      const byId = new Map(sets.map((set) => [set.id, set]))
      return order
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((set) => {
          const ids = set.characterIds || set.entityIds || []
          return {
            id: set.id,
            provider: set.provider,
            createdAt: set.createdAt,
            count: ids.length,
            live: ids.filter((id) => live.has(id)).length,
            selected: set.id === selected,
          }
        })
    } catch (error) {
      log.warn('[novel-set-read] postgres 读取失败', { requestId, kind, novelId, message: error.message })
      throw error
    }
  }

  return { list: listRows, listSets }
}

let repoPromise = null

function getRepoLazy() {
  if (!repoPromise) {
    repoPromise = import('../db/client.js').then(({ getDb }) => createPostgresNovelChildRepository(getDb()))
  }
  return repoPromise
}

export const novelChildReadService = createNovelChildReadService({
  getProjectAsync: (id) => novelReadService.get(id),
  legacy: {
    list: (kind, novelId, opts = {}) => {
      if (kind === 'chunks') return listChunks(novelId)
      if (kind === 'characters') return listCharacters(novelId)
      if (kind === 'entities') return listEntities(novelId)
      if (kind === 'seasons') return listSeasons(novelId)
      if (kind === 'episodes') return listEpisodes(novelId, opts.seasonId)
      if (kind === 'assets') return listAssets(novelId, { category: opts.category })
      if (kind === 'states') return listStates(novelId, opts.characterId)
      throw new Error(`未知子集合：${kind}`)
    },
    listSets: (kind, novelId) => {
      if (kind === 'characterSets') return listCharacterSets(novelId)
      if (kind === 'worldSets') return listWorldSets(novelId)
      throw new Error(`未知集合：${kind}`)
    },
  },
  getRepo: getRepoLazy,
  // legacy 仅用于测试/回滚；生产写模式为 postgres 时读强制 PG。
  mode: config.novels.writeMode === 'legacy' ? 'legacy' : 'postgres',
  orgId: config.novels.orgId,
})
