import config from '../config/index.js'
import logger from '../utils/logger.js'
import { createPostgresNovelChildRepository } from '../repositories/novelChildRepository.js'
import { getChunkText } from './novelProjectService.js'
import { novelReadService } from './novelReadService.js'

/**
 * 小说子集合只读服务（Phase 3c-2）。
 *
 * PostgreSQL 是唯一读源；不存在 legacy/shadow 回退。
 */
export function createNovelChildReadService({
  getRepo,
  getProjectAsync = async () => null,
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
  getRepo: getRepoLazy,
  orgId: config.novels.orgId,
})
