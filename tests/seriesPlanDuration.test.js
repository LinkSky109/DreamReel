import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import {
  createNovelProject,
  deleteNovelProject,
  novelDir,
  readCleanedText,
  getEpisodeText,
} from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import { listChunksAsync } from '../src/services/novelAsyncReadService.js'
import { planSeries } from '../src/services/seriesPlannerService.js'
import { getEpisode, listEpisodes, listSeasons } from '../src/services/novelEpisodeStore.js'
import { getNovelWriteRepositories } from '../src/repositories/unitOfWork.js'
import { planEpisodesInRange } from '../src/services/episodePlanService.js'
import { assembleSeasons } from '../src/services/seasonPlanService.js'
import { getOrGenerateOutline } from '../src/services/episodeOutlineService.js'
import './helpers/pg-teardown.js'

const SENT = '他抬头望向荒原尽头，风沙里传来低沉的轰鸣声，像有什么东西正在苏醒。'

function buildNovel(chapterCount, baseChars) {
  let raw = ''
  const bounds = []
  for (let ch = 0; ch < chapterCount; ch += 1) {
    const title = `第${ch + 1}章 测试章节`
    const start = raw.length
    raw += `${title}\n`
    let body = ''
    while (body.length < baseChars) body += SENT
    raw += `${body}\n`
    bounds.push({ index: ch, chapterTitle: title, startOffset: start, endOffset: start + title.length + 1 + body.length })
  }
  return { raw, bounds }
}

describe('分季分集：故事边界 + 85–95s', () => {
  const created = []

  // PG 软删除 + 目录清理；不再从 db.json 小说集合手工摘除记录。
  after(async () => {
    for (const id of created) {
      try {
        await deleteNovelProject(id)
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(novelDir(id), { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('planEpisodesInRange：全部落在 85–95s，偏移连续且可切片', () => {
    const { raw, bounds } = buildNovel(30, 2600)
    const result = planEpisodesInRange({
      cleanedText: raw,
      chapterBounds: bounds,
      rangeStart: 0,
      rangeEnd: raw.length,
      charsPerSecond: 4.5,
      episodeSeconds: 90,
      tolerance: 5,
    })
    assert.ok(result.episodes.length > 0)
    const inRange = result.episodes.filter((e) => e.estimatedSeconds >= 85 && e.estimatedSeconds <= 95).length
    assert.ok(inRange / result.episodes.length >= 0.99, `inRange=${inRange}/${result.episodes.length}`)
    for (const ep of result.episodes) {
      assert.ok(Math.abs(raw.slice(ep.startOffset, ep.endOffset).length / 4.5 - ep.estimatedSeconds) < 0.01)
    }
    // 覆盖连续
    for (let i = 1; i < result.episodes.length; i += 1) {
      assert.equal(result.episodes[i].startOffset, result.episodes[i - 1].endOffset)
    }
    assert.equal(result.episodes.at(-1).endOffset, raw.length)
  })

  it('planEpisodesInRange：极短源退回 1 章 ≥ 1 集', () => {
    const raw = '第1章 起点\n短文本一。\n第2章 转折\n短文本二。\n'
    const bounds = [
      { index: 0, chapterTitle: '第1章 起点', startOffset: 0, endOffset: raw.indexOf('第2章') },
      { index: 1, chapterTitle: '第2章 转折', startOffset: raw.indexOf('第2章'), endOffset: raw.length },
    ]
    const result = planEpisodesInRange({
      cleanedText: raw,
      chapterBounds: bounds,
      rangeStart: 0,
      rangeEnd: raw.length,
      episodeSeconds: 90,
    })
    assert.equal(result.shortSource, true)
    assert.equal(result.episodes.length, 2)
    assert.ok(result.episodes.every((e) => e.shortSource))
  })

  it('assembleSeasons：相邻弧合并到每季 ≥ 目标集数，且章节范围连续', () => {
    const chapters = []
    for (let i = 0; i < 60; i += 1) {
      chapters.push({
        index: i,
        chapterTitle: `第${i + 1}章`,
        startOffset: i * 2600,
        endOffset: (i + 1) * 2600,
      })
    }
    const arcs = chapters.map((c) => ({
      name: c.chapterTitle,
      chapterStart: c.index,
      chapterEnd: c.index,
      goal: '',
      acts: null,
      endingHook: '',
    }))
    const seasons = assembleSeasons({ arcs, chapters, episodeSeconds: 90, charsPerSecond: 4.5, episodesPerSeason: 10 })
    assert.ok(seasons.length > 1)
    for (let i = 0; i < seasons.length; i += 1) {
      if (i < seasons.length - 1) assert.ok(seasons[i].estimatedEpisodes >= 10, `season ${i + 1}`)
      if (i > 0) assert.equal(seasons[i].chapterStart, seasons[i - 1].chapterEnd + 1)
    }
  })

  it('planSeries：端到端偏移落盘、时长校验、旧文件不再生成', async () => {
    const { raw } = buildNovel(20, 2400)
    const project = await createNovelProject({ title: '分集时长测试' })
    created.push(project.id)
    await ingestNovel(project.id, { sourceType: 'text', text: raw })

    const chunks = await listChunksAsync(project.id)
    assert.ok(chunks.every((c) => c.startOffset !== null && c.startOffset !== undefined && c.text.length > 0))
    // PostgreSQL 只存偏移：章节正文在 novel_sources，不在 novel_chunks.content
    const stored = await getNovelWriteRepositories().chunks.list(project.id)
    assert.ok(stored.length > 0)
    assert.ok(stored.every((c) => !c.text), 'novel_chunks.content 不应持久化正文')

    const result = await planSeries(project.id, { episodesPerSeason: 200, useLLM: false })
    assert.ok(result.episodes > 0)
    assert.ok(result.provider === 'heuristic')
    assert.ok(result.buckets.inRange / result.episodes >= 0.99, JSON.stringify(result.buckets))

    const cleaned = readCleanedText(project.id)
    const episodes = await listEpisodes(project.id)
    assert.ok(seasonsAtLeast(await listSeasons(project.id), episodes.length))
    for (const ep of episodes) {
      assert.ok(ep.startOffset !== null && ep.startOffset !== undefined && ep.endOffset !== null && ep.endOffset !== undefined)
      assert.equal(getEpisodeText(project.id, ep), cleaned.slice(ep.startOffset, ep.endOffset))
      assert.ok(!ep.sourceFile, '新集不应再写 sourceFile')
      assert.ok(Math.abs(getEpisodeText(project.id, ep).length / 4.5 - ep.estimatedSeconds) < 0.01)
    }
    // 不再生成 episodes/*.txt
    assert.equal(fs.existsSync(`${novelDir(project.id)}/episodes`), false)
  })

  it('getOrGenerateOutline：mock 下启发式大纲且可复用', async () => {
    const { raw } = buildNovel(3, 2400)
    const project = await createNovelProject({ title: '大纲测试' })
    created.push(project.id)
    await ingestNovel(project.id, { sourceType: 'text', text: raw })
    await planSeries(project.id, { episodesPerSeason: 200, useLLM: false })
    const ep = (await listEpisodes(project.id))[0]
    const outline = await getOrGenerateOutline(project.id, ep.id, { useLLM: false })
    assert.equal(outline.provider, 'heuristic')
    assert.ok(outline.synopsis.length > 0)
    const stored = await getEpisode(project.id, ep.id)
    assert.equal(stored.outline.provider, 'heuristic')
    const again = await getOrGenerateOutline(project.id, ep.id, { useLLM: false })
    assert.equal(again.generatedAt, outline.generatedAt)
  })
})

function seasonsAtLeast(seasons, totalEpisodes) {
  if (!seasons.length) return totalEpisodes === 0
  return seasons.reduce((n, s) => n + (s.episodeCount || 0), 0) === totalEpisodes
}
