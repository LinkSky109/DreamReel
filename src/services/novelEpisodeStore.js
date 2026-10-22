import config from '../config/index.js'
import { storageService } from './storageService.js'
import { getEpisodeText as getEpisodeTextJson } from './novelProjectService.js'
import { getNovelWriteRepositories } from '../repositories/unitOfWork.js'

/**
 * 集/季异步存储门面。
 *
 * - NOVEL_WRITE_MODE=postgres：读写 PostgreSQL（单一事实源）
 * - legacy/dual：保持现有 JSON 行为（测试与回滚）
 *
 * Phase 3a 只覆盖 seasons/episodes；项目/角色/世界观仍走 JSON。
 */

export function isPgWriteMode() {
  return config.novels.writeMode === 'postgres'
}

function orgId() {
  return config.novels.orgId
}

export async function getEpisode(novelId, episodeId) {
  if (!isPgWriteMode()) return storageService.getEpisode(episodeId)
  const repos = getNovelWriteRepositories()
  return repos.episodes.findById(episodeId, { orgId: orgId() })
}

export async function listEpisodes(novelId, seasonId = null) {
  if (!isPgWriteMode()) {
    return storageService
      .listEpisodes(novelId, seasonId)
      .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
  }
  const repos = getNovelWriteRepositories()
  return repos.episodes.list(novelId, { orgId: orgId(), seasonId })
}

export async function listSeasons(novelId) {
  if (!isPgWriteMode()) {
    return storageService.listSeasons(novelId).sort((a, b) => (a.seasonNo ?? 0) - (b.seasonNo ?? 0))
  }
  const repos = getNovelWriteRepositories()
  return repos.seasons.list(novelId, { orgId: orgId() })
}

export async function getSeason(novelId, seasonId) {
  if (!isPgWriteMode()) {
    const season = storageService.getSeason(seasonId)
    return season && season.novelId === novelId ? season : null
  }
  const seasons = await listSeasons(novelId)
  return seasons.find((s) => s.id === seasonId) || null
}

/**
 * 更新一集。
 * - JSON 模式：就地合并后写 JSON
 * - PG 模式：列字段 + 其余进 payload（assets 等）
 */
export async function updateEpisode(novelId, episode, patch = {}) {
  if (!isPgWriteMode()) {
    Object.assign(episode, patch)
    return storageService.updateEpisode(episode)
  }
  const merged = { ...episode, ...patch }
  const repos = getNovelWriteRepositories()
  return repos.episodes.update(
    merged.id,
    { ...merged, payload: merged },
    { orgId: orgId() }
  )
}

/** 读一集正文：PG 模式从 novel_sources 切片，否则回退旧读取器 */
export async function getEpisodeText(novelId, episode) {
  if (!isPgWriteMode()) return getEpisodeTextJson(novelId, episode)
  if (!episode) return ''
  const repos = getNovelWriteRepositories()
  const source = await repos.sources.get(novelId, { orgId: orgId() })
  if (source?.cleanedText && episode.startOffset !== null && episode.startOffset !== undefined) {
    return source.cleanedText.slice(episode.startOffset, episode.endOffset)
  }
  return getEpisodeTextJson(novelId, episode)
}

/** 供需要“按逻辑键/集号”定位的旧代码使用 */
export async function findEpisodeByNo(novelId, episodeNo, seasonId = null) {
  const episodes = await listEpisodes(novelId, seasonId)
  return episodes.find((e) => Number(e.episodeNo) === Number(episodeNo)) || null
}
