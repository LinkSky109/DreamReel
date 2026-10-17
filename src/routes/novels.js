import { Router } from 'express'
import {
  createNovelProject,
  listNovelProjects,
  getNovelProject,
  updateNovelProject,
} from '../services/novelProjectService.js'
import { ingestNovel, listChunks } from '../services/novelChunkService.js'
import { extractCharacters, listCharacters } from '../services/characterExtractionService.js'
import { selectCharacterSet, listCharacterSets } from '../services/characterExtractionService.js'
import { advanceStage } from '../services/novelProjectService.js'
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
import { generateEpisodeAssets, getEpisodeAssets } from '../services/episodeAssetService.js'
import { composeEpisode } from '../services/episodeComposeService.js'
import { buildManifest, syncToLocal, syncToQuark } from '../services/novelSyncService.js'
import { exportHandoff, importHandoffResult, listHandoff } from '../services/episodeHandoffService.js'
import { extractWorld, listEntities, listRelations, summarize } from '../services/worldbuildingService.js'
import { selectWorldSet, listWorldSets } from '../services/worldbuildingService.js'
import { CARD_SCHEMA, CARD_GROUPS } from '../models/NovelCharacter.js'
import { WORLD_TYPES, WORLD_TYPE_LABELS, WORLD_ATTRIBUTES } from '../models/WorldEntity.js'
import { optionalClampInt } from '../utils/coerce.js'
import { tryAcquire, release } from '../utils/asyncLock.js'
import { getJobs } from '../services/extractionStatus.js'
import { extractAll } from '../services/combinedExtractionService.js'
import { resolveLLMPreference, getLLMProviderByPref, getAvailableProviders as getAvailableLLMProviders } from '../providers/llmProviderFactory.js'
import { listAssets, createAsset, updateAsset, deleteAsset, generateAssetImage, suggestAssets, assetStats } from '../services/novelAssetService.js'
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

// 剧集包清单
router.get('/:id/manifest', (req, res) => {
  try {
    const files = buildManifest(req.params.id).map((f) => ({ rel: f.rel, size: f.size }))
    res.json({ success: true, data: { fileCount: files.length, files } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 存储同步（本地 / 夸克网盘）
router.post('/:id/sync', (req, res) => {
  try {
    const { backend = 'local', dryRun = false, targetDir, cookie } = req.body || {}
    if (backend === 'local') {
      if (!targetDir) return res.status(400).json({ success: false, error: 'targetDir required for local' })
      return res.json({ success: true, data: syncToLocal(req.params.id, targetDir, { dryRun }) })
    }
    if (backend === 'quark') {
      return res.json({ success: true, data: syncToQuark(req.params.id, { dryRun, cookie }) })
    }
    return res.status(400).json({ success: false, error: `unknown backend: ${backend}` })
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
    res.json({ success: true, data: autoAttachReferences(req.params.id, req.params.eid) })
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
router.get('/:id/world/entities', (req, res) => {
  try {
    getNovelProject(req.params.id)
    res.json({ success: true, data: listEntities(req.params.id, req.query.type) })
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
router.get('/:id/assets', (req, res) => {
  try {
    res.json({ success: true, data: { assets: listAssets(req.params.id, { category: req.query.category }), stats: assetStats(req.params.id) } })
  } catch (error) {
    res.status(statusFor(error)).json({ success: false, error: error.message })
  }
})

// 从角色/世界观导入候选草稿（不生成图）
router.post('/:id/assets/suggest', (req, res) => {
  try {
    const { categories } = req.body || {}
    const created = suggestAssets(req.params.id, { categories })
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
