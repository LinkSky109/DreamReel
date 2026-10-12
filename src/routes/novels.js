import { Router } from 'express'
import {
  createNovelProject,
  listNovelProjects,
  getNovelProject,
  updateNovelProject,
} from '../services/novelProjectService.js'
import { ingestNovel, listChunks } from '../services/novelChunkService.js'
import { extractCharacters, listCharacters } from '../services/characterExtractionService.js'
import { ensureCards, applyEdits, reviewStats } from '../services/characterCardService.js'
import { generateStyle } from '../services/novelStyleService.js'
import { addState, listStates } from '../services/characterGrowthService.js'
import {
  planSeries,
  listSeasons,
  listEpisodes,
  checkConsistency,
} from '../services/seriesPlannerService.js'
import { generateEpisodeScript, getEpisodeScript } from '../services/episodeScriptService.js'

/**
 * 小说 → 剧集 路由（Sprint 19），挂载 /api/novels
 * 统一信封 { success, data } / { success, error }。
 */

const router = Router()

function statusFor(error) {
  return /not found/i.test(error.message) ? 404 : 400
}

// 创建小说项目
router.post('/', (req, res) => {
  try {
    const body = req.body || {}
    if (!body.title) return res.status(400).json({ success: false, error: 'title is required' })
    const project = createNovelProject(body)
    res.status(201).json({ success: true, data: project })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 项目列表
router.get('/', (_req, res) => {
  try {
    res.json({ success: true, data: listNovelProjects() })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 项目详情（含审核统计）
router.get('/:id', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    res.json({ success: true, data: { ...project, reviewStats: reviewStats(project.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 设置全书风格（MVP：全书统一）
router.put('/:id/style', (req, res) => {
  try {
    const style = req.body && req.body.style ? req.body.style : req.body
    const project = updateNovelProject(req.params.id, {
      style: { scope: 'book', name: style.name || '', description: style.description || '' },
    })
    res.json({ success: true, data: project })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 摄取：来源 → 分章 → 切片入库
router.post('/:id/ingest', async (req, res) => {
  try {
    const { sourceType, text, url, maxChapters, force } = req.body || {}
    const result = await ingestNovel(req.params.id, { sourceType, text, url, maxChapters, force })
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 切片列表
router.get('/:id/chunks', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listChunks(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色抽取
router.post('/:id/extract', async (req, res) => {
  try {
    const { provider, maxChapters, maxChars, minFreq } = req.body || {}
    const result = await extractCharacters(req.params.id, { provider, maxChapters, maxChars, minFreq })
    ensureCards(req.params.id)
    res.json({ success: true, data: { provider: result.provider, characters: listCharacters(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色列表
router.get('/:id/characters', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listCharacters(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 修订角色（记录 reviewEdits）
router.patch('/:id/characters/:cid', (req, res) => {
  try {
    const { approve, ...patch } = req.body || {}
    const character = applyEdits(req.params.id, req.params.cid, patch, { approve })
    res.json({ success: true, data: character })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 通过角色
router.post('/:id/characters/:cid/approve', (req, res) => {
  try {
    const character = applyEdits(req.params.id, req.params.cid, {}, { approve: true })
    res.json({ success: true, data: character })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 审核统计（修订率）
router.get('/:id/review-stats', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: reviewStats(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 自动生成全书风格
router.post('/:id/style/generate', async (req, res) => {
  try {
    const project = await generateStyle(req.params.id)
    res.json({ success: true, data: project.style })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色成长状态：列表
router.get('/:id/characters/:cid/states', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listStates(req.params.id, req.params.cid) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色成长状态：追加
router.post('/:id/characters/:cid/states', (req, res) => {
  try {
    const state = addState(req.params.id, req.params.cid, req.body || {})
    res.status(201).json({ success: true, data: state })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 分季分集 + 剧本（Sprint 21） =====

// 规划：章节 → 集 → 季
router.post('/:id/series/plan', (req, res) => {
  try {
    const { episodeSeconds, episodesPerSeason, charsPerSecond, maxChapters } = req.body || {}
    const result = planSeries(req.params.id, { episodeSeconds, episodesPerSeason, charsPerSecond, maxChapters })
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 季列表
router.get('/:id/seasons', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listSeasons(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 集列表（可按 seasonId 过滤）
router.get('/:id/episodes', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listEpisodes(req.params.id, req.query.seasonId) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 生成单集剧本
router.post('/:id/episodes/:eid/script', async (req, res) => {
  try {
    const episode = await generateEpisodeScript(req.params.id, req.params.eid, req.body || {})
    res.json({ success: true, data: episode })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 读取单集剧本
router.get('/:id/episodes/:eid/script', (req, res) => {
  try {
    const screenplay = getEpisodeScript(req.params.id, req.params.eid)
    if (!screenplay) return res.status(404).json({ success: false, error: 'script not generated' })
    res.json({ success: true, data: screenplay })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 一致性校验
router.get('/:id/consistency', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: checkConsistency(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

export default router
