import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { getNovelProject, novelDir } from './novelProjectService.js'
import { generateEpisodeScript } from './episodeScriptService.js'
import { ASSET_CATEGORY_LABELS } from '../models/NovelAssetImage.js'
import { isGenericName } from '../utils/nameFilters.js'

/**
 * 分镜级「外部生成」交接（Sprint 29）
 * 契约见 ai/docs/external-video-handoff-spec.md：
 * - 导出：storage/novels/<novelId>/handoff/<episodeId>/
 *     manifest.json + storyboard.md + refs/ + prompt.txt + TOOL_GUIDE.md
 * - 回传：storage/videos/novels/<novelId>/shots/<episodeId>/shotNN.mp4
 * - 导入：扫描回传目录，写回 shot.videoUrl
 */

const GUIDE_SRC = path.resolve(process.cwd(), 'ai/docs/external-video-handoff-spec.md')

function urlToAbs(url) {
  if (!url || !url.startsWith('/storage/')) return null
  return path.join(config.storage.path, url.replace(/^\/storage\//, ''))
}

export function shotUploadDir(novelId, episodeId) {
  return path.join(config.storage.path, 'videos', 'novels', novelId, 'shots', episodeId)
}

export function handoffDir(novelId, episodeId) {
  return path.join(novelDir(novelId), 'handoff', episodeId)
}

function sanitize(name) {
  return String(name || 'asset').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
}

function getEpisodeOrThrow(novelId, episodeId) {
  const ep = storageService.getEpisode(episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return ep
}

function buildShotPrompt(project, shot) {
  const style = project.style || {}
  const styleText = [style.name, style.visual, style.description].filter((x) => typeof x === 'string' && x).join('，')
  return [shot.description, styleText ? `风格：${styleText}` : ''].filter(Boolean).join('，').slice(0, 900)
}

function buildStoryboard(project, episode, shots) {
  const lines = [
    `# 分镜表 · ${project.title || ''} · 第 ${episode.episodeNo} 集 ${episode.title || ''}`,
    ``,
    `目标时长 ${episode.targetSeconds || 90}s ｜ 比例 16:9 ｜ ${shots.length} 个分镜`,
    ``,
    `| 分镜 | 时长(s) | 提示词 | 台词 | 参考图 | 输出文件 |`,
    `|---|---|---|---|---|---|`,
  ]
  for (const s of shots) {
    const refs = s.referenceImages.map((r) => `${r.file}`).join('<br>') || '-'
    lines.push(`| ${s.index} | ${s.duration} | ${(s.prompt || '').replace(/\|/g, '／')} | ${(s.dialogue || '').replace(/\|/g, '／') || '-'} | ${refs} | ${s.outputFile} |`)
  }
  return lines.join('\n') + '\n'
}

function copyToolGuide(dir) {
  try {
    if (fs.existsSync(GUIDE_SRC)) fs.copyFileSync(GUIDE_SRC, path.join(dir, 'TOOL_GUIDE.md'))
  } catch (error) {
    logger.warn(`复制 TOOL_GUIDE 失败：${error.message}`)
  }
}

/**
 * 导出分镜清单（给外部工具）。返回 { dir, shotCount, refCount, withRefs }
 */
export async function exportShotHandoff(novelId, episodeId, opts = {}) {
  const project = getNovelProject(novelId)
  let episode = getEpisodeOrThrow(novelId, episodeId)
  if (!episode.screenplay) {
    episode = await generateEpisodeScript(novelId, episodeId, { provider: opts.scriptProvider })
  }

  const dir = handoffDir(novelId, episodeId)
  const refsDir = path.join(dir, 'refs')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(refsDir, { recursive: true })

  const byUrl = new Map(storageService.listNovelAssetImages(novelId).filter((a) => a.imageUrl).map((a) => [a.imageUrl, a]))
  const used = new Map()

  const shots = (episode.screenplay.shots || []).map((s) => {
    const nn = String(s.index).padStart(2, '0')
    const referenceImages = []
    for (const url of s.referenceImages || []) {
      const a = byUrl.get(url)
      if (!a) continue
      const srcAbs = urlToAbs(a.imageUrl)
      if (!srcAbs || !fs.existsSync(srcAbs)) continue
      const ext = path.extname(srcAbs) || '.png'
      const base = `shot${nn}_${ASSET_CATEGORY_LABELS[a.category] || a.category}_${sanitize(a.name)}`
      let fname = `${base}${ext}`
      if (used.has(fname)) {
        const n = used.get(fname) + 1
        used.set(fname, n)
        fname = `${base}_${n}${ext}`
      } else {
        used.set(fname, 1)
      }
      fs.copyFileSync(srcAbs, path.join(refsDir, fname))
      referenceImages.push({ role: a.category, name: a.name, file: `refs/${fname}`, url })
    }
    return {
      index: s.index,
      duration: s.duration,
      prompt: buildShotPrompt(project, s),
      dialogue: s.dialogue || '',
      narration: s.narration || '',
      shotType: s.shotType || '',
      cameraMovement: s.cameraMovement || '',
      referenceImages,
      outputFile: `shot${nn}.mp4`,
    }
  })

  const manifest = {
    schemaVersion: 1,
    novelId,
    novelTitle: project.title || '',
    episodeId,
    episodeNo: episode.episodeNo,
    episodeTitle: episode.title || '',
    targetSeconds: episode.targetSeconds || 90,
    ratio: '16:9',
    resolution: opts.resolution || '1080p',
    style: project.style || {},
    shots,
    generatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(dir, 'storyboard.md'), buildStoryboard(project, episode, shots))
  fs.writeFileSync(
    path.join(dir, 'prompt.txt'),
    [`【小说剧场·分镜生成】`, `${project.title || ''} · 第 ${episode.episodeNo} 集 ${episode.title || ''}`, `分镜数 ${shots.length}，详见 manifest.json / storyboard.md`].join('\n')
  )
  copyToolGuide(dir)

  return {
    dir,
    episodeId,
    shotCount: shots.length,
    refCount: shots.reduce((n, s) => n + s.referenceImages.length, 0),
    withRefs: shots.filter((s) => s.referenceImages.length).length,
  }
}

/**
 * 导入回传视频（扫描回传目录 → 写回 shot.videoUrl）。返回 { imported, missing }
 */
export function importShotVideos(novelId, episodeId, opts = {}) {
  const episode = getEpisodeOrThrow(novelId, episodeId)
  const shots = episode.screenplay?.shots || []
  const dir = opts.dir || shotUploadDir(novelId, episodeId)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const imported = []
  const missing = []
  for (const s of shots) {
    const nn = String(s.index).padStart(2, '0')
    const exact = `shot${nn}.mp4`
    let hit = files.includes(exact) ? exact : null
    if (!hit) {
      // 宽容匹配：文件名含 shot0*NN
      hit = files.find((f) => /\.mp4$/i.test(f) && new RegExp(`shot0*${s.index}(\\D|$)`, 'i').test(f)) || null
    }
    if (hit) {
      s.videoUrl = `/storage/videos/novels/${novelId}/shots/${episodeId}/${hit}`
      imported.push({ index: s.index, file: hit })
    } else {
      missing.push(s.index)
    }
  }
  if (imported.length) {
    episode.status = 'shot-videos'
    storageService.updateEpisode(episode)
  }
  return { dir, imported, missing, total: shots.length }
}

/**
 * 按分镜文本自动匹配设定图（名称出现在 shot 文案中即挂上）
 */
/**
 * 按分镜文本自动匹配设定图（参考图）。
 * 改进点：
 *  - 命名词表 = 设定图名称 + 其来源角色/实体的别名（同一事物的不同称呼也能匹配到）
 *  - 命中按“名称长度”排序（越长越具体，优先），每个分镜最多 maxPerShot 张，避免一屏塞满
 *  - 只增不删：手动配过的参考图保留
 */
export function autoAttachReferences(novelId, episodeId, opts = {}) {
  const episode = getEpisodeOrThrow(novelId, episodeId)
  const shots = episode.screenplay?.shots || []
  const maxPerShot = Number(opts.maxPerShot) > 0 ? Number(opts.maxPerShot) : 6
  const assets = storageService.listNovelAssetImages(novelId).filter((a) => a.imageUrl && a.name && !isGenericName(a.name))

  // 来源 id → 别名表（角色/世界观实体都收）
  const aliasById = new Map()
  for (const c of storageService.listNovelCharacters(novelId)) aliasById.set(c.id, [c.name, ...(c.aliases || [])])
  for (const e of storageService.listWorldEntities(novelId)) aliasById.set(e.id, [e.name, ...(e.aliases || [])])

  const keywords = assets.map((a) => ({
    url: a.imageUrl,
    names: [...new Set([a.name, ...(aliasById.get(a.sourceId) || [])])].filter((n) => n && n.length >= 2),
  }))

  let shotsTouched = 0
  let refsAdded = 0
  for (const s of shots) {
    const text = `${s.description || ''} ${s.dialogue || ''}`
    const refs = new Set(s.referenceImages || [])
    const before = refs.size
    const hits = []
    for (const k of keywords) {
      if (refs.has(k.url)) continue
      const hit = k.names.find((n) => text.includes(n))
      if (hit) hits.push({ url: k.url, len: hit.length })
    }
    hits.sort((a, b) => b.len - a.len)
    for (const h of hits.slice(0, Math.max(0, maxPerShot - refs.size))) {
      refs.add(h.url)
      refsAdded++
    }
    if (refs.size !== before) shotsTouched++
    s.referenceImages = [...refs]
  }

  // 兜底：仍无参考图的分镜，继承本集"主导参考图"（多半是同一场景/氛围），
  // 让图生视频 100% 有视觉锚点。opts.fallback === false 可关闭。
  if (opts.fallback !== false) {
    const counts = new Map()
    for (const s of shots) for (const u of s.referenceImages || []) counts.set(u, (counts.get(u) || 0) + 1)
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (dominant) {
      for (const s of shots) {
        if (!(s.referenceImages || []).length) {
          s.referenceImages = [dominant]
          refsAdded++
          shotsTouched++
        }
      }
    }
  }

  storageService.updateEpisode(episode)
  storageService._flush() // 批量操作后立即落盘（save 为 debounce，避免调用方退出丢数据）
  return { episodeId, shots: shots.length, shotsTouched, refsAdded, maxPerShot }
}

/** 手动设置某分镜的参考图 */
export function setShotReferences(novelId, episodeId, index, referenceImages = []) {
  const episode = getEpisodeOrThrow(novelId, episodeId)
  const shot = (episode.screenplay?.shots || []).find((s) => s.index === Number(index))
  if (!shot) throw new Error(`shot not found: ${index}`)
  shot.referenceImages = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : []
  storageService.updateEpisode(episode)
  return shot
}

/** 分镜列表（含参考图与是否已有回传视频） */
export function listShots(novelId, episodeId) {
  const episode = getEpisodeOrThrow(novelId, episodeId)
  const dir = shotUploadDir(novelId, episodeId)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return (episode.screenplay?.shots || []).map((s) => {
    const nn = String(s.index).padStart(2, '0')
    const hit = files.find((f) => f === `shot${nn}.mp4`) || null
    return {
      index: s.index,
      description: s.description || '',
      dialogue: s.dialogue || '',
      duration: s.duration,
      referenceImages: s.referenceImages || [],
      videoUrl: hit ? `/storage/videos/novels/${novelId}/shots/${episodeId}/${hit}` : s.videoUrl || null,
    }
  })
}
