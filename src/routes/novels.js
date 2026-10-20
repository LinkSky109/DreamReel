import express, { Router } from 'express'
import { storageService } from '../services/storageService.js'
import { novelReadService } from '../services/novelReadService.js'
import { novelChildReadService } from '../services/novelChildReadService.js'
import {
  createNovelProject,
  getNovelProject,
  updateNovelProject,
  deleteNovelProject,
} from '../services/novelProjectService.js'
import { ingestNovel, listChunks } from '../services/novelChunkService.js'
import { extractCharacters, listCharacters } from '../services/characterExtractionService.js'
import { selectCharacterSet, listCharacterSets } from '../services/characterExtractionService.js'
import { advanceStage } from '../services/novelProjectService.js'
import { ensureCards, applyEdits, reviewStats } from '../services/characterCardService.js'
import { generateStyle } from '../services/novelStyleService.js'
import {
  addState,
  listStates,
  upsertState,
  buildTimeline,
  generateEpisodeStates,
  getCharacterStateAt,
} from '../services/characterGrowthService.js'
import {
  planSeries,
  checkConsistency,
  seriesEstimate,
} from '../services/seriesPlannerService.js'
import { generateEpisodeScript, getEpisodeScript } from '../services/episodeScriptService.js'
import { generateEpisodeAssets, getEpisodeAssets } from '../services/episodeAssetService.js'
import { composeEpisode } from '../services/episodeComposeService.js'
import { buildManifest, syncToQuark, syncToWebdav, syncNovel, getLedger, getSyncState, resolveScope, SYNC_SCOPES } from '../services/novelSyncService.js'
import { exportHandoff, importHandoffResult, listHandoff } from '../services/episodeHandoffService.js'
import { extractWorld, listEntities, listRelations, summarize } from '../services/worldbuildingService.js'
import { selectWorldSet, listWorldSets } from '../services/worldbuildingService.js'
import { CARD_SCHEMA, CARD_GROUPS } from '../models/NovelCharacter.js'
import { WORLD_TYPES, WORLD_TYPE_LABELS, WORLD_ATTRIBUTES } from '../models/WorldEntity.js'
import { optionalClampInt } from '../utils/coerce.js'
import { generateId } from '../utils/idGenerator.js'
import { projectService } from '../services/projectService.js'
import { tryAcquire, release } from '../utils/asyncLock.js'
import { getJobs } from '../services/extractionStatus.js'
import { extractAll } from '../services/combinedExtractionService.js'
import { bulkGenerate } from '../services/bulkEpisodeService.js'
import { seasonAssetSubset, bulkGenerateSeasonAssets } from '../services/seasonAssetService.js'
import { listVoiceAssignments, setVoice, resetVoices } from '../services/voiceService.js'
import { makeSpeakerId, registerVoiceAsset, deleteVoiceAsset, listVoiceAssets, resourceIdFor } from '../services/voiceLibraryService.js'
import { cloneVoice, designVoice } from '../services/volcVoiceApi.js'
import { getTTSProvider } from '../providers/ttsProviderFactory.js'
import { resolveLLMPreference, getLLMProviderByPref, getAvailableProviders as getAvailableLLMProviders } from '../providers/llmProviderFactory.js'
import { listAssets, createAsset, updateAsset, deleteAsset, generateAssetImage, suggestAssets, assetStats, assetStatsFromRows, bulkGenerateImages, normalizeAssets } from '../services/novelAssetService.js'
import { beginRun, cancelRun, isCancelled, finishRun, getRunStatus } from '../services/bulkControl.js'
import { validateBody } from '../middleware/validate.js'
import { bulkGenerateAssetsSchema } from '../contracts/assets.js'
import { exportShotHandoff, importShotVideos, autoAttachReferences, setShotReferences, listShots } from '../services/shotHandoffService.js'

/**
 * 小说 → 剧集 路由（Sprint 19），挂载 /api/novels
 * 统一信封 { success, data } / { success, error }。
 */

const router = Router()

function statusFor(error) {
  if (/not found/i.test(error.message)) return 404
  if (/锁定|locked/i.test(error.message)) return 409
  return 400
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

// 项目列表（附带列表页需要的字数/审校/进度统计）
const LIST_STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose']
function withListStats(project) {
  const chunks = listChunks(project.id)
  const characters = listCharacters(project.id)
  const entities = listEntities(project.id)
  const review = reviewStats(project.id)
  const stageIndex = Math.max(0, LIST_STAGES.indexOf(project.stage))
  const progress = Math.round(((stageIndex + 1) / LIST_STAGES.length) * 100)
  const status =
    project.stage === 'compose'
      ? 'completed'
      : project.stage === 'source' && chunks.length === 0
        ? 'draft'
        : 'in-progress'
  return {
    ...project,
    stats: {
      words: chunks.reduce((sum, chunk) => sum + (chunk.text?.length || 0), 0),
      chapters: chunks.length,
      characters: characters.length,
      worldEntities: entities.length,
      approved: review.approved || 0,
      revisionRate: review.revisionRate || 0,
      progress,
      status,
    },
  }
}

router.get('/', async (req, res) => {
  try {
    const projects = await novelReadService.list({ requestId: req.id })
    res.json({ success: true, data: projects.map(withListStats) })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 删除项目（db 关联记录 + 所有落盘目录，不可恢复）
router.delete('/:id', (req, res) => {
  try {
    const data = deleteNovelProject(req.params.id)
    res.json({ success: true, data })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 项目详情（含审核统计）
router.get('/:id', async (req, res) => {
  try {
    const project = await novelReadService.get(req.params.id, { requestId: req.id })
    res.json({ success: true, data: { ...project, reviewStats: reviewStats(project.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 章节段落标记：切换某段是否作为分镜素材
router.post('/:id/marks/toggle', (req, res) => {
  try {
    const { chapter, para } = req.body || {}
    if (!Number.isInteger(chapter) || !Number.isInteger(para)) {
      return res.status(400).json({ success: false, error: 'chapter/para 必须是整数' })
    }
    const project = getNovelProject(req.params.id)
    const marks = Array.isArray(project.marks) ? project.marks : []
    const index = marks.findIndex((mark) => mark.chapter === chapter && mark.para === para)
    const next = index >= 0
      ? marks.filter((_, i) => i !== index)
      : [...marks, { chapter, para, at: new Date().toISOString() }]
    const updated = updateNovelProject(req.params.id, { marks: next })
    res.json({ success: true, data: { marks: updated.marks, marked: index < 0 } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 改编分镜板：由标记段落生成草稿
router.get('/:id/storyboard', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    res.json({ success: true, data: project.storyboard || [] })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.post('/:id/storyboard/from-marks', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    const marks = Array.isArray(project.marks) ? project.marks : []
    if (!marks.length) return res.status(400).json({ success: false, error: '还没有段落标记，请先在章节里标记分镜素材' })
    const chunks = new Map(listChunks(req.params.id).map((chunk) => [chunk.index, chunk]))
    const existing = new Set((project.storyboard || []).map((shot) => `${shot.chapter}:${shot.para}`))
    const drafts = [...(project.storyboard || [])]
    let created = 0
    for (const mark of marks) {
      const key = `${mark.chapter}:${mark.para}`
      if (existing.has(key)) continue
      const chunk = chunks.get(mark.chapter)
      if (!chunk) continue
      const paragraphs = String(chunk.text || '').split(/\n+/).filter(Boolean)
      const text = paragraphs[mark.para] || ''
      if (!text) continue
      drafts.push({
        id: generateId(),
        chapter: mark.chapter,
        para: mark.para,
        chapterTitle: chunk.chapterTitle || '',
        text,
        duration: 5,
        shotType: '中景',
        camera: '固定',
        createdAt: new Date().toISOString(),
      })
      created++
    }
    const updated = updateNovelProject(req.params.id, { storyboard: drafts })
    res.json({ success: true, data: { shots: updated.storyboard, created } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.patch('/:id/storyboard/:sid', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    const shot = (project.storyboard || []).find((item) => item.id === req.params.sid)
    if (!shot) throw new Error('storyboard shot not found')
    const { text, duration, shotType, camera } = req.body || {}
    if (text !== undefined) shot.text = String(text).slice(0, 4000)
    if (duration !== undefined) shot.duration = Math.max(1, Math.min(60, Number(duration) || 5))
    if (shotType !== undefined) shot.shotType = String(shotType).slice(0, 40)
    if (camera !== undefined) shot.camera = String(camera).slice(0, 40)
    updateNovelProject(req.params.id, { storyboard: project.storyboard })
    res.json({ success: true, data: shot })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.delete('/:id/storyboard/:sid', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    const next = (project.storyboard || []).filter((item) => item.id !== req.params.sid)
    if (next.length === project.storyboard.length) throw new Error('storyboard shot not found')
    updateNovelProject(req.params.id, { storyboard: next })
    res.json({ success: true, data: { removed: 1 } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 把分镜草稿送入项目（不传 projectId 则新建项目）
router.post('/:id/storyboard/import', async (req, res) => {
  try {
    const novel = getNovelProject(req.params.id)
    const drafts = novel.storyboard || []
    if (!drafts.length) return res.status(400).json({ success: false, error: '分镜板为空，先标记章节并生成草稿' })
    const { projectId, name } = req.body || {}
    const target = projectId
      ? await projectService.getProject(projectId)
      : await projectService.createProject({
          name: name || `《${novel.title}》· 分镜板`,
          description: `由小说《${novel.title}》的段落标记生成`,
          targetDuration: drafts.reduce((sum, shot) => sum + (shot.duration || 5), 0),
          platform: 'landscape',
          style: novel.style?.name || '',
          userId: req.user?.id,
        })
    const existing = new Set(
      (target.shots || [])
        .filter((shot) => shot.sourceNovelId === novel.id && shot.sourceStoryboardId)
        .map((shot) => shot.sourceStoryboardId)
    )
    let imported = 0
    let skipped = 0
    for (const shot of drafts) {
      if (existing.has(shot.id)) {
        skipped++
        continue
      }
      target.addShot({
        description: shot.text,
        narration: shot.text,
        duration: shot.duration || 5,
        shotType: shot.shotType,
        cameraMovement: shot.camera,
        sourceNovelId: novel.id,
        sourceStoryboardId: shot.id,
      })
      imported++
    }
    if (imported) await projectService.updateProject(target.id, { shots: target.shots })
    res.status(201).json({
      success: true,
      data: { projectId: target.id, projectName: target.name, shots: imported, skipped, total: drafts.length },
    })
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

// 切片列表（?meta=1 只返回目录信息，避免真本书一次传 10MB 正文）
router.get('/:id/chunks', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const chunks = await novelChildReadService.list('chunks', req.params.id, { requestId: req.id })
    if (req.query.meta === '1') {
      return res.json({
        success: true,
        data: chunks.map(({ id, index, chapterTitle, wordCount }) => ({ id, index, chapterTitle, wordCount })),
      })
    }
    res.json({ success: true, data: chunks })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 单章正文（阅读器按需加载）
router.get('/:id/chunks/:chunkId', (req, res) => {
  try {
    getNovelProject(req.params.id)
    const chunk = storageService.getNovelChunk(req.params.chunkId)
    if (!chunk || chunk.novelId !== req.params.id) throw new Error('chunk not found')
    res.json({ success: true, data: chunk })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色抽取
router.post('/:id/extract', async (req, res) => {
  const lockKey = `extract:characters:${req.params.id}`
  const got = tryAcquire(lockKey)
  if (!got.ok) {
    return res.status(409).json({ success: false, error: '该小说的角色抽取正在进行中，请等待完成后再试' })
  }
  try {
    const body = req.body || {}
    const result = await extractCharacters(req.params.id, {
      provider: body.provider,
      maxChapters: optionalClampInt(body.maxChapters, 1, 100000),
      chunkSize: optionalClampInt(body.chunkSize, 1, 100),
      maxChars: optionalClampInt(body.maxChars, 200, 64000),
      minFreq: optionalClampInt(body.minFreq, 1, 1000),
      concurrency: optionalClampInt(body.concurrency, 1, 128),
      userId: req.user?.id,
    })
    ensureCards(req.params.id)
    res.json({ success: true, data: { provider: result.provider, degraded: /fallback/.test(result.provider), characters: listCharacters(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  } finally {
    release(lockKey)
  }
})

// 抽取进度（角色/世界观/合并）— 前端轮询展示每个分片状态
router.get('/:id/extract/status', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: getJobs(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色 + 世界观「一次抽取」（同一分片一次调用，保证命名一致）
router.post('/:id/extract-all', async (req, res) => {
  const lockKey = `extract:both:${req.params.id}`
  const got = tryAcquire(lockKey)
  if (!got.ok) {
    return res.status(409).json({ success: false, error: '该小说的合并抽取正在进行中，请等待完成后再试' })
  }
  try {
    const body = req.body || {}
    const result = await extractAll(req.params.id, {
      provider: body.provider,
      maxChapters: optionalClampInt(body.maxChapters, 1, 100000),
      chunkSize: optionalClampInt(body.chunkSize, 1, 100),
      maxChars: optionalClampInt(body.maxChars, 200, 64000),
      minFreq: optionalClampInt(body.minFreq, 1, 1000),
      concurrency: optionalClampInt(body.concurrency, 1, 128),
      userId: req.user?.id,
    })
    ensureCards(req.params.id)
    res.json({
      success: true,
      data: {
        provider: result.provider,
        degraded: /fallback/.test(result.provider),
        characters: listCharacters(req.params.id),
        entities: listEntities(req.params.id),
        summary: summarize(req.params.id),
      },
    })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  } finally {
    release(lockKey)
  }
})

// 角色列表
router.get('/:id/characters', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const rows = await novelChildReadService.list('characters', req.params.id, { requestId: req.id })
    res.json({ success: true, data: rows })
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

// 审校状态 + 备注（角色）
router.patch('/:id/characters/:cid/review', (req, res) => {
  try {
    const { status, note } = req.body || {}
    if (status && !['pending', 'approved', 'revision'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status 必须是 pending/approved/revision' })
    }
    const character = storageService.getNovelCharacter(req.params.cid)
    if (!character || character.novelId !== req.params.id) throw new Error('character not found')
    if (status) character.status = status
    if (note !== undefined) character.note = String(note).slice(0, 2000)
    character.updatedAt = new Date().toISOString()
    storageService.updateNovelCharacter(character)
    res.json({ success: true, data: character })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 一键确认全部角色与世界观
router.post('/:id/review/confirm-all', (req, res) => {
  try {
    const now = new Date().toISOString()
    const characters = listCharacters(req.params.id)
    for (const character of characters) {
      character.status = 'approved'
      character.updatedAt = now
      storageService.updateNovelCharacter(character)
    }
    const entities = listEntities(req.params.id)
    for (const entity of entities) {
      entity.status = 'confirmed'
      storageService.updateWorldEntity(entity)
    }
    res.json({ success: true, data: { characters: characters.length, entities: entities.length } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 批量审校（角色 / 世界观）
router.post('/:id/review/bulk', (req, res) => {
  try {
    const { kind = 'characters', ids, status, note } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'ids 不能为空' })
    }
    const isCharacter = kind === 'characters'
    const allowed = isCharacter ? ['pending', 'approved', 'revision'] : ['pending', 'confirmed', 'revision']
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `status 必须是 ${allowed.join('/')}` })
    }
    let updated = 0
    for (const id of ids) {
      const item = isCharacter ? storageService.getNovelCharacter(id) : storageService.getWorldEntity(id)
      if (!item || item.novelId !== req.params.id) continue
      item.status = status
      if (note !== undefined) item.note = String(note).slice(0, 2000)
      if (isCharacter) {
        item.updatedAt = new Date().toISOString()
        storageService.updateNovelCharacter(item)
      } else {
        storageService.updateWorldEntity(item)
      }
      updated++
    }
    res.json({ success: true, data: { updated } })
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

// 形象时间线（全书，按角色分组）
router.get('/:id/timeline', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: { timeline: buildTimeline(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 手动新增/更新某角色某集形象（episodeNo 为锚点）
router.put('/:id/characters/:cid/states/:episodeNo', (req, res) => {
  try {
    const state = upsertState(req.params.id, req.params.cid, Number(req.params.episodeNo), req.body || {}, { source: 'manual' })
    res.json({ success: true, data: state })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 删除某角色某集形象
router.delete('/:id/characters/:cid/states/:episodeNo', (req, res) => {
  try {
    const n = storageService.deleteNovelCharacterStates(req.params.id, req.params.cid, Number(req.params.episodeNo))
    res.json({ success: true, data: { removed: n } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 生成/刷新某一集的角色形象状态（LLM）
router.post('/:id/episodes/:eid/states', async (req, res) => {
  try {
    const { names, provider } = req.body || {}
    const saved = await generateEpisodeStates(req.params.id, req.params.eid, { names, provider })
    res.json({ success: true, data: { count: saved.length, states: saved } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 查看某一集各角色形象（含回退：取 ≤ 该集的最近状态）
router.get('/:id/episodes/:eid/states', (req, res) => {
  try {
    getNovelProject(req.params.id)
    const ep = storageService.getEpisode(req.params.eid)
    if (!ep || ep.novelId !== req.params.id) throw new Error(`episode not found: ${req.params.eid}`)
    const episodeNo = Number(ep.episodeNo ?? (ep.chapterIndex ?? 0) + 1)
    const chars = listCharacters(req.params.id).filter((c) => c.name)
    const items = chars
      .map((c) => {
        const exact = listStates(req.params.id, c.id).find((s) => Number(s.episodeNo) === episodeNo)
        const effective = getCharacterStateAt(req.params.id, c.id, episodeNo)
        return exact || effective ? { characterId: c.id, name: c.name, exact: exact || null, effective: effective || null } : null
      })
      .filter(Boolean)
    res.json({ success: true, data: { episodeNo, items } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 分季分集 + 剧本（Sprint 21） =====

// 规划：章节 → 集 → 季
// 角色音色映射（可自定义；支持任意音色 ID，如声音复刻的 S_xxx）
router.get('/:id/voices', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listVoiceAssignments(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})
router.put('/:id/voices', (req, res) => {
  try {
    const { speaker, voice } = req.body || {}
    res.json({ success: true, data: setVoice(req.params.id, speaker, voice) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})
router.post('/:id/voices/reset', (req, res) => {
  try {
    res.json({ success: true, data: resetVoices(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 自建音色（声音复刻 / 音色设计）=====
const jsonLarge = express.json({ limit: '20mb' }) // 音频样本 base64 可能 >10MB

// 列出该作品可用的自建音色
router.get('/:id/voices/library', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: { voices: listVoiceAssets(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 声音复刻：上传音频样本 → 注册自定义音色（可选直接指派给某角色）
router.post('/:id/voices/clone', jsonLarge, async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const { name, audioBase64, format = 'mp3', text = '', language = 0, demoText = '', speakerId, assignTo, gender = '' } = req.body || {}
    if (!name) return res.status(400).json({ success: false, error: '音色名称 name 必填' })
    if (!audioBase64) return res.status(400).json({ success: false, error: '音频样本 audioBase64 必填' })
    const sid = speakerId || makeSpeakerId(req.params.id, name)
    const r = await cloneVoice({ speakerId: sid, audioBase64, format, language, text, demoText })
    const asset = registerVoiceAsset({
      novelId: req.params.id,
      name,
      type: 'clone',
      speakerId: r.speakerId,
      gender,
      language,
      status: 'ready',
      demoAudioUrl: r.demoAudio || '',
      note: text ? `参考文本：${String(text).slice(0, 40)}` : '',
    })
    const map = assignTo ? setVoice(req.params.id, assignTo, r.speakerId) : undefined
    res.status(201).json({ success: true, data: { voice: asset, map } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 音色设计：文本/图片提示 → 生成音色试听（需已购买 speaker_id）
router.post('/:id/voices/design', jsonLarge, async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const { name, speakerId, textPrompt, text, imageBase64, language = 0, assignTo, gender = '' } = req.body || {}
    if (!name) return res.status(400).json({ success: false, error: '音色名称 name 必填' })
    const r = await designVoice({ speakerId, text: text || '这是一段音色试听文本。', textPrompt, imageBase64, language })
    const asset = registerVoiceAsset({
      novelId: req.params.id,
      name,
      type: 'design',
      speakerId: r.speakerId,
      gender,
      language,
      status: 'preview',
      demoAudioUrl: r.demoAudio || '',
      note: textPrompt ? `设计描述：${String(textPrompt).slice(0, 60)}` : '',
    })
    const map = assignTo ? setVoice(req.params.id, assignTo, r.speakerId) : undefined
    res.status(201).json({ success: true, data: { voice: asset, map } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 试听：用指定音色合成一小段（预设或自建音色均可）
router.post('/:id/voices/preview', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const { voice, text } = req.body || {}
    if (!voice) return res.status(400).json({ success: false, error: 'voice 必填' })
    const provider = getTTSProvider()
    const r = await provider.synthesize({
      text: String(text || '你好，这是这段音色的试听效果。').slice(0, 60),
      language: 'zh',
      voice,
      resourceId: resourceIdFor(voice) || undefined,
    })
    res.json({ success: true, data: { audioUrl: r.audioUrl, duration: r.duration, provider: r.provider } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 删除自建音色
router.delete('/:id/voices/:voiceId', (req, res) => {
  try {
    const asset = deleteVoiceAsset(req.params.voiceId)
    res.json({ success: true, data: { removed: asset } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 分季分集时长估算（正文可支撑 vs 已规划）
router.get('/:id/series/estimate', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: seriesEstimate(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

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
router.get('/:id/seasons', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const rows = await novelChildReadService.list('seasons', req.params.id, { requestId: req.id })
    res.json({ success: true, data: rows })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 本季「设定图子集」：一季真正用得到的设定图（分镜已引用 + 本季正文出现的角色/实体）
router.get('/:id/seasons/:sid/assets', (req, res) => {
  try {
    res.json({ success: true, data: seasonAssetSubset(req.params.id, req.params.sid) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 只为本季涉及的设定图批量出图（分批、限并发、可续跑）
router.post('/:id/seasons/:sid/assets/bulk-generate', async (req, res) => {
  try {
    const body = req.body || {}
    const r = await bulkGenerateSeasonAssets(req.params.id, req.params.sid, {
      limit: optionalClampInt(body.limit, 1, 12),
      concurrency: optionalClampInt(body.concurrency, 1, 4),
      userId: req.user?.id,
    })
    res.json({ success: true, data: r })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 单集批量生成（按季、分批、可续跑）：前端循环调用直到 remaining=0
router.post('/:id/seasons/:sid/bulk', async (req, res) => {
  try {
    const body = req.body || {}
    const r = await bulkGenerate(req.params.id, req.params.sid, {
      task: body.task,
      limit: optionalClampInt(body.limit, 1, 50),
      concurrency: optionalClampInt(body.concurrency, 1, 8),
      onlyMissing: body.onlyMissing,
      userId: req.user?.id,
    })
    res.json({ success: true, data: r })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 集列表（可按 seasonId 过滤）
router.get('/:id/episodes', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    const rows = await novelChildReadService.list('episodes', req.params.id, {
      requestId: req.id,
      seasonId: req.query.seasonId,
    })
    res.json({ success: true, data: rows })
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

// ===== 单集资产生成（Sprint 22：图/音/视频） =====

// 生成单集资产
router.post('/:id/episodes/:eid/assets', async (req, res) => {
  try {
    const episode = await generateEpisodeAssets(req.params.id, req.params.eid, req.body || {})
    res.json({ success: true, data: { episodeId: episode.id, status: episode.status, assets: episode.assets } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 读取单集资产
router.get('/:id/episodes/:eid/assets', (req, res) => {
  try {
    const assets = getEpisodeAssets(req.params.id, req.params.eid)
    if (!assets) return res.status(404).json({ success: false, error: 'assets not generated' })
    res.json({ success: true, data: assets })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 成片 + 存储同步（Sprint 23） =====

// 单集成片（多素材 → 目标时长 mp4）
router.post('/:id/episodes/:eid/compose', async (req, res) => {
  try {
    const composition = await composeEpisode(req.params.id, req.params.eid, req.body || {})
    res.json({ success: true, data: composition })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 剧集包清单（?scope=deliverables|media|all）
router.get('/:id/manifest', (req, res) => {
  try {
    const scope = resolveScope(req.query.scope)
    const files = buildManifest(req.params.id, { scope: scope.key }).map((f) => ({ rel: f.rel, size: f.size }))
    res.json({ success: true, data: { fileCount: files.length, scope: scope.key, scopeLabel: scope.label, files } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 存储同步（本地 / WebDAV 网盘 / 夸克网盘）
router.post('/:id/sync', async (req, res) => {
  try {
    const {
      backend = 'local',
      dryRun = false,
      targetDir,
      cookie,
      onlyChanged = true,
      force = false,
      onConflict = 'overwrite',
      scope,
      remoteDir,
      url,
      username,
      password,
      token,
    } = req.body || {}
    if (backend === 'local') {
      if (!targetDir) return res.status(400).json({ success: false, error: 'targetDir required for local' })
      return res.json({
        success: true,
        data: await syncNovel(req.params.id, { backend: 'local', dryRun, targetDir, onlyChanged, force, scope }),
      })
    }
    if (backend === 'webdav') {
      return res.json({
        success: true,
        data: await syncToWebdav(req.params.id, { dryRun, onlyChanged, force, onConflict, scope, remoteDir, url, username, password, token }),
      })
    }
    if (backend === 'quark') {
      return res.json({
        success: true,
        data: await syncToQuark(req.params.id, { dryRun, onlyChanged, force, onConflict, scope, remoteDir, cookie }),
      })
    }
    return res.status(400).json({ success: false, error: `unknown backend: ${backend}` })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 可用同步范围
router.get('/:id/sync/scopes', (_req, res) => {
  try {
    res.json({
      success: true,
      data: Object.entries(SYNC_SCOPES).map(([key, v]) => ({ key, label: v.label, dirs: v.dirs })),
    })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 同步历史 + 增量状态（供 UI 展示上次同步）
router.get('/:id/sync/ledger', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: { entries: getLedger(req.params.id).entries, ...getSyncState(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 单集"外部生成"交接（Sprint 24：视频 plan 受限时的替代流程） =====

// 导出交接包（提示词 + 规格 + 参考图）
router.post('/:id/episodes/:eid/handoff', async (req, res) => {
  try {
    const data = await exportHandoff(req.params.id, req.params.eid, req.body || {})
    res.json({ success: true, data })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 回传外部产物（mp4）到项目视频目录
router.post('/:id/episodes/:eid/handoff/import', (req, res) => {
  try {
    const { filePath } = req.body || {}
    const data = importHandoffResult(req.params.id, req.params.eid, filePath)
    res.json({ success: true, data })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 交接列表
router.get('/:id/handoff', (req, res) => {
  try {
    res.json({ success: true, data: listHandoff(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 分镜级外部生成交接（Sprint 29，契约见 ai/docs/external-video-handoff-spec.md） =====

// 分镜列表（含参考图/是否已回传）
router.get('/:id/episodes/:eid/shots', (req, res) => {
  try {
    res.json({ success: true, data: listShots(req.params.id, req.params.eid) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 按分镜文本自动匹配设定图
router.post('/:id/episodes/:eid/shots/auto-refs', (req, res) => {
  try {
    res.json({ success: true, data: autoAttachReferences(req.params.id, req.params.eid, req.body || {}) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 手动设置某分镜参考图
router.put('/:id/episodes/:eid/shots/:index/refs', (req, res) => {
  try {
    const { referenceImages } = req.body || {}
    res.json({ success: true, data: setShotReferences(req.params.id, req.params.eid, req.params.index, referenceImages) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 导出分镜清单（manifest.json + refs/ + storyboard.md + TOOL_GUIDE.md）
router.post('/:id/episodes/:eid/handoff/shots', async (req, res) => {
  try {
    const data = await exportShotHandoff(req.params.id, req.params.eid, req.body || {})
    res.json({ success: true, data })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 导入回传视频（扫描回传目录 → 写回 shot.videoUrl）
router.post('/:id/episodes/:eid/shots/import', (req, res) => {
  try {
    const { dir } = req.body || {}
    res.json({ success: true, data: importShotVideos(req.params.id, req.params.eid, { dir }) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 世界观设定集（Sprint 25） =====

// 抽取世界观（世界规则/力量/种族/势力/事件/装备/文化…）+ 关系
router.post('/:id/world/extract', async (req, res) => {
  const lockKey = `extract:world:${req.params.id}`
  const got = tryAcquire(lockKey)
  if (!got.ok) {
    return res.status(409).json({ success: false, error: '该小说的世界观抽取正在进行中，请等待完成后再试' })
  }
  try {
    const body = req.body || {}
    const result = await extractWorld(req.params.id, {
      provider: body.provider,
      maxChapters: optionalClampInt(body.maxChapters, 1, 100000),
      chunkSize: optionalClampInt(body.chunkSize, 1, 100),
      maxChars: optionalClampInt(body.maxChars, 200, 64000),
      concurrency: optionalClampInt(body.concurrency, 1, 128),
      userId: req.user?.id,
    })
    res.json({ success: true, data: { provider: result.provider, degraded: /fallback/.test(result.provider), entities: result.entities, summary: result.summary } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  } finally {
    release(lockKey)
  }
})

// 世界观概览
router.get('/:id/world', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: summarize(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 实体列表（可按 type 过滤）
router.get('/:id/world/entities', async (req, res) => {
  try {
    getNovelProject(req.params.id)
    let rows = await novelChildReadService.list('entities', req.params.id, { requestId: req.id })
    if (req.query.type) rows = rows.filter((e) => e.type === req.query.type)
    res.json({ success: true, data: rows })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 关系列表
router.get('/:id/world/relations', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listRelations(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 该小说的模型配置（供应商/模型，抽取按 小说→用户→全局→Mock 解析） =====

router.get('/:id/model-config', (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    const pref = project.providerPreferences?.llm || null
    res.json({
      success: true,
      data: { preferences: project.providerPreferences || { llm: null }, resolved: resolveLLMPreference(pref, req.user?.id) },
    })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.put('/:id/model-config', (req, res) => {
  try {
    getNovelProject(req.params.id)
    const body = req.body || {}
    const llm = body.llm
    let next = null
    if (llm !== null && llm !== undefined) {
      const provider = String(llm.provider || '')
      if (!getAvailableLLMProviders().includes(provider)) {
        return res.status(400).json({ success: false, error: `unknown llm provider: ${provider}` })
      }
      // 只接受 provider/model；不接受 config（避免 baseUrl 覆盖 + 全局密钥外泄）
      next = { provider, model: llm.model ? String(llm.model) : null, updatedAt: new Date().toISOString() }
    }
    const providerPreferences = { ...(getNovelProject(req.params.id).providerPreferences || {}), llm: next, updatedAt: new Date().toISOString() }
    const updated = updateNovelProject(req.params.id, { providerPreferences })
    res.json({ success: true, data: { preferences: updated.providerPreferences, resolved: resolveLLMPreference(next, req.user?.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.post('/:id/model-config/test', async (req, res) => {
  try {
    const project = getNovelProject(req.params.id)
    const body = req.body || {}
    let pref = project.providerPreferences?.llm || null
    if (body.llm !== undefined) {
      if (body.llm === null) {
        pref = null
      } else {
        const provider = String(body.llm.provider || '')
        if (!getAvailableLLMProviders().includes(provider)) {
          return res.status(400).json({ success: false, error: `unknown llm provider: ${provider}` })
        }
        pref = { provider, model: body.llm.model ? String(body.llm.model) : null }
      }
    }
    const llm = getLLMProviderByPref(pref, req.user?.id)
    const startedAt = Date.now()
    let ok = true
    let error = ''
    try {
      await llm.generateJSON({
        systemPrompt: '你是 JSON 生成器，只输出 JSON。',
        userPrompt: '只输出 {"ok":true}',
        options: { temperature: 0, maxTokens: 50 },
      })
    } catch (e) {
      ok = false
      error = String((e && e.message) || e).slice(0, 300)
    }
    res.json({ success: true, data: { ok, provider: llm.name, model: llm.model || null, latencyMs: Date.now() - startedAt, error } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 设定图集（Sprint 28：角色/衣物/装备/建筑/场景/道具…，供图生视频） =====

// 列表（可按类别过滤）+ 统计
router.get('/:id/assets', async (req, res) => {
  try {
    const assets = await novelChildReadService.list('assets', req.params.id, {
      requestId: req.id,
      category: req.query.category,
    })
    res.json({ success: true, data: { assets, stats: assetStatsFromRows(assets) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 从角色/世界观导入候选草稿（不生成图）
// 设定图批量出图（分批、限并发、可续跑）：前端循环调用直到 remaining=0
// 归一化设定图：按名称重绑 sourceId 到当前角色/实体；泛名/重名加类别前缀
router.post('/:id/assets/normalize', (req, res) => {
  try {
    res.json({ success: true, data: normalizeAssets(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 停止批量出图（当前批次最多再完成并发数的少量图）
router.post('/:id/assets/bulk-cancel', (req, res) => {
  try {
    const run = cancelRun(req.params.id)
    res.json({ success: true, data: { cancelled: true, cancelledAt: run.cancelledAt } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 批量出图状态
router.get('/:id/assets/bulk-status', (req, res) => {
  try {
    res.json({ success: true, data: getRunStatus(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.post('/:id/assets/bulk-generate', validateBody(bulkGenerateAssetsSchema), async (req, res) => {
  try {
    const body = req.validated?.body || req.body || {}
    const novelId = req.params.id
    // reset=true：开始新一轮；否则若已被取消，直接拒绝，让客户端循环立即停止
    if (body.reset) beginRun(novelId)
    else if (isCancelled(novelId)) {
      return res.status(409).json({ success: false, code: 'BULK_CANCELLED', error: '已停止出图；重新开始请点击「本类批量出图」' })
    }
    const r = await bulkGenerateImages(novelId, {
      limit: optionalClampInt(body.limit, 1, 24),
      concurrency: optionalClampInt(body.concurrency, 1, 6),
      categories: Array.isArray(body.categories) ? body.categories : undefined,
      userId: req.user?.id,
      shouldStop: () => isCancelled(novelId),
    })
    finishRun(novelId, { ok: r.ok, failed: r.failed })
    res.json({ success: true, data: r })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

router.post('/:id/assets/suggest', (req, res) => {
  try {
    const { categories, stages, maxStages } = req.body || {}
    const created = suggestAssets(req.params.id, { categories, stages, maxStages })
    res.json({ success: true, data: { created: created.length, assets: listAssets(req.params.id), stats: assetStats(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 手动新增设定图
router.post('/:id/assets', (req, res) => {
  try {
    const { category, name, prompt } = req.body || {}
    const asset = createAsset(req.params.id, { category, name, prompt, source: 'manual' })
    res.status(201).json({ success: true, data: asset })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 编辑
router.patch('/:id/assets/:aid', (req, res) => {
  try {
    res.json({ success: true, data: updateAsset(req.params.id, req.params.aid, req.body || {}) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 删除
router.delete('/:id/assets/:aid', (req, res) => {
  try {
    res.json({ success: true, data: deleteAsset(req.params.id, req.params.aid) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 生成设定图（真实出图）
router.post('/:id/assets/:aid/generate', async (req, res) => {
  try {
    const { aspectRatio } = req.body || {}
    const asset = await generateAssetImage(req.params.id, req.params.aid, { userId: req.user?.id, aspectRatio })
    res.json({ success: true, data: asset })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 抽取 schema（供前端渲染角色卡/世界观类型与属性标签） =====

router.get('/:id/schema', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({
      success: true,
      data: {
        character: { fields: CARD_SCHEMA, groups: CARD_GROUPS },
        world: {
          types: WORLD_TYPES.map((t) => ({ key: t, label: WORLD_TYPE_LABELS[t] })),
          attributes: WORLD_ATTRIBUTES,
        },
      },
    })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// ===== 阶段推进 + 备选/选定（Sprint 26） =====

// 推进阶段（进入下一阶段后，之前阶段锁定）
router.post('/:id/advance', (req, res) => {
  try {
    const project = advanceStage(req.params.id, (req.body || {}).to)
    res.json({ success: true, data: { stage: project.stage } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 角色备选集合
router.get('/:id/characters/sets', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listCharacterSets(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})
router.post('/:id/characters/select', (req, res) => {
  try {
    const { setId } = req.body || {}
    if (!setId) return res.status(400).json({ success: false, error: 'setId required' })
    res.json({ success: true, data: selectCharacterSet(req.params.id, setId) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 审校状态 + 备注（世界观实体）
router.patch('/:id/world/entities/:eid/review', (req, res) => {
  try {
    const { status, note } = req.body || {}
    if (status && !['pending', 'confirmed', 'revision'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status 必须是 pending/confirmed/revision' })
    }
    const entity = storageService.getWorldEntity(req.params.eid)
    if (!entity || entity.novelId !== req.params.id) throw new Error('world entity not found')
    if (status) entity.status = status
    if (note !== undefined) entity.note = String(note).slice(0, 2000)
    storageService.updateWorldEntity(entity)
    res.json({ success: true, data: entity })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 世界观备选集合
router.get('/:id/world/sets', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listWorldSets(req.params.id) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})
router.post('/:id/world/select', (req, res) => {
  try {
    const { setId } = req.body || {}
    if (!setId) return res.status(400).json({ success: false, error: 'setId required' })
    res.json({ success: true, data: selectWorldSet(req.params.id, setId) })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

export default router
