import { storageService } from './storageService.js'
import { Season } from '../models/Season.js'
import { Episode } from '../models/Episode.js'
import { getNovelProject, updateNovelProject, writeNovelFile, readNovelFile } from './novelProjectService.js'
import { listChunks } from './novelChunkService.js'

/**
 * 分季分集规划（Sprint 21 / S21-1、S21-2）
 * 规则：1 章 ≥ 1 集；每集目标 85–95s；每季 ≥ 200 集；以季为单元。
 * 纯规则驱动（确定性、无 LLM），可对整本小说秒级规划。
 */

const DEFAULT_EPISODE_SECONDS = 90
const DEFAULT_EPISODES_PER_SEASON = 200
const DEFAULT_CHARS_PER_SECOND = 5

export function estimateSeconds(text, charsPerSecond = DEFAULT_CHARS_PER_SECOND) {
  return Math.max(DEFAULT_EPISODE_SECONDS, Math.round((text ? text.length : 0) / charsPerSecond))
}

function splitChapterIntoEpisodes(text, charsPerSecond, episodeSeconds) {
  const est = estimateSeconds(text, charsPerSecond)
  const n = Math.max(1, Math.ceil(est / episodeSeconds))
  if (n === 1) return [text]
  const size = Math.ceil(text.length / n)
  const parts = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts.length ? parts : [text]
}

/**
 * 规划整本：章节 → 集 → 季
 * @param {string} novelId
 * @param {object} opts { episodeSeconds=90, episodesPerSeason=200, charsPerSecond=5, maxChapters? }
 */
export function planSeries(novelId, opts = {}) {
  const episodeSeconds = opts.episodeSeconds || DEFAULT_EPISODE_SECONDS
  const episodesPerSeason = opts.episodesPerSeason || DEFAULT_EPISODES_PER_SEASON
  const charsPerSecond = opts.charsPerSecond || DEFAULT_CHARS_PER_SECOND
  const maxChapters = opts.maxChapters && opts.maxChapters > 0 ? opts.maxChapters : Infinity

  const project = getNovelProject(novelId)
  const chapters = listChunks(novelId).slice(0, maxChapters)
  if (!chapters.length) throw new Error('尚未摄取正文，请先 ingest')

  // 清理旧季/集
  if (storageService.data.seriesSeasons) {
    for (const s of storageService.listSeasons(novelId)) delete storageService.data.seriesSeasons[s.id]
  }
  if (storageService.data.seriesEpisodes) {
    for (const e of storageService.listEpisodes(novelId)) delete storageService.data.seriesEpisodes[e.id]
  }

  // 生成集（1 章 ≥ 1 集）
  const planned = []
  let episodeNo = 1
  for (const ch of chapters) {
    const parts = splitChapterIntoEpisodes(ch.text, charsPerSecond, episodeSeconds)
    parts.forEach((text, k) => {
      planned.push({
        chapterIndex: ch.index,
        chapterTitle: ch.chapterTitle,
        part: k + 1,
        parts: parts.length,
        text,
        episodeNo: episodeNo++,
      })
    })
  }

  // 分季：每季 ≥ episodesPerSeason（均衡分配）
  const totalEpisodes = planned.length
  const seasonCount = Math.max(1, Math.floor(totalEpisodes / episodesPerSeason))
  const base = Math.floor(totalEpisodes / seasonCount)
  const remainder = totalEpisodes % seasonCount

  const seasons = []
  let cursor = 0
  for (let i = 0; i < seasonCount; i++) {
    const size = base + (i < remainder ? 1 : 0)
    const slice = planned.slice(cursor, cursor + size)
    cursor += size

    const season = storageService.createSeason(
      new Season({
        novelId,
        seasonNo: i + 1,
        title: `第${i + 1}季`,
        synopsis: `${slice[0].chapterTitle} … ${slice[slice.length - 1].chapterTitle}`,
        episodeCount: slice.length,
        chapterStart: slice[0].chapterIndex,
        chapterEnd: slice[slice.length - 1].chapterIndex,
      })
    )
    seasons.push(season)

    for (const p of slice) {
      const ep = storageService.createEpisode(
        new Episode({
          novelId,
          seasonId: season.id,
          episodeNo: p.episodeNo,
          chapterIndex: p.chapterIndex,
          chapterTitle: p.chapterTitle,
          title: p.parts > 1 ? `${p.chapterTitle}（${p.part}/${p.parts}）` : p.chapterTitle,
          targetSeconds: episodeSeconds,
        })
      )
      const rel = `episodes/${ep.id}.txt`
      writeNovelFile(novelId, rel, p.text)
      ep.sourceFile = rel
      storageService.updateEpisode(ep)
    }
  }

  updateNovelProject(novelId, {
    counts: { ...project.counts, seasons: seasons.length, episodes: totalEpisodes },
  })

  return { seasons: seasons.length, episodes: totalEpisodes, episodesPerSeason, episodeSeconds }
}

export function listSeasons(novelId) {
  return storageService.listSeasons(novelId).sort((a, b) => a.seasonNo - b.seasonNo)
}

export function listEpisodes(novelId, seasonId) {
  return storageService
    .listEpisodes(novelId, seasonId)
    .sort((a, b) => a.episodeNo - b.episodeNo)
}

export function getEpisode(id) {
  return storageService.getEpisode(id)
}

/**
 * 基础一致性校验：集内出现的「全书角色名」覆盖情况
 */
export function checkConsistency(novelId) {
  const names = storageService.listNovelCharacters(novelId).map((c) => c.name).filter(Boolean)
  const episodes = storageService.listEpisodes(novelId)
  let withKnown = 0
  const emptyEpisodes = []
  for (const ep of episodes) {
    const text = readNovelFile(novelId, ep.sourceFile)?.toString('utf-8') || ''
    const hit = names.some((n) => text.includes(n))
    if (hit) withKnown++
    else emptyEpisodes.push(ep.id)
  }
  return {
    characters: names.length,
    episodes: episodes.length,
    episodesWithKnownCharacter: withKnown,
    episodesWithoutKnownCharacter: emptyEpisodes.length,
  }
}
