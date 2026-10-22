import config from '../config/index.js'
import { getEpisodeText as getEpisodeTextFromFile } from './novelProjectService.js'
import { getNovelWriteRepositories } from '../repositories/unitOfWork.js'

/**
 * 集/季异步存储门面。PostgreSQL 是唯一读写源。
 */

function orgId() {
  return config.novels.orgId
}

export async function getEpisode(novelId, episodeId) {
  const repos = getNovelWriteRepositories()
  return repos.episodes.findById(episodeId, { orgId: orgId() })
}

export async function listEpisodes(novelId, seasonId = null) {
  const repos = getNovelWriteRepositories()
  return repos.episodes.list(novelId, { orgId: orgId(), seasonId })
}

export async function listSeasons(novelId) {
  const repos = getNovelWriteRepositories()
  return repos.seasons.list(novelId, { orgId: orgId() })
}

export async function getSeason(novelId, seasonId) {
  const seasons = await listSeasons(novelId)
  return seasons.find((s) => s.id === seasonId) || null
}

/**
 * 更新一集：列字段 + 其余进 payload（assets 等）。
 */
export async function updateEpisode(novelId, episode, patch = {}) {
  const merged = { ...episode, ...patch }
  const repos = getNovelWriteRepositories()
  return repos.episodes.update(
    merged.id,
    { ...merged, payload: merged },
    { orgId: orgId() }
  )
}

/** 读一集正文：优先 novel_sources 切片，其次回退本地 cleaned.txt/source 文件。 */
export async function getEpisodeText(novelId, episode) {
  if (!episode) return ''
  const repos = getNovelWriteRepositories()
  const source = await repos.sources.get(novelId, { orgId: orgId() })
  if (source?.cleanedText && episode.startOffset !== null && episode.startOffset !== undefined) {
    return source.cleanedText.slice(episode.startOffset, episode.endOffset)
  }
  return getEpisodeTextFromFile(novelId, episode)
}

/** 供需要“按逻辑键/集号”定位的旧代码使用 */
export async function findEpisodeByNo(novelId, episodeNo, seasonId = null) {
  const episodes = await listEpisodes(novelId, seasonId)
  return episodes.find((e) => Number(e.episodeNo) === Number(episodeNo)) || null
}
