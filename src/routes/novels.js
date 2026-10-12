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

export default router
