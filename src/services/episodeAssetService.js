import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getImageProvider } from '../providers/imageProviderFactory.js'
import { getTTSProvider } from '../providers/ttsProviderFactory.js'
import { getVideoProvider } from '../providers/videoProviderFactory.js'
import { getEpisode, updateEpisode } from './novelEpisodeStore.js'
import { writeNovelFile, assertEditable } from './novelProjectService.js'
import { generateEpisodeScript } from './episodeScriptService.js'
import { ensureVoiceMap, voiceFor } from './voiceService.js'
import { resourceIdFor } from './voiceLibraryService.js'
import { buildAppearanceDirective } from './characterGrowthService.js'
import { getNovelProjectAsync, listCharactersAsync } from './novelAsyncReadService.js'

const execFileAsync = promisify(execFile)
const TMP_DIR = path.join(path.resolve(config.storage.path), 'temp')

/**
 * 单集资产生成（Sprint 22 / S22-1）：图 / 音 / 视频。
 *
 * 落盘位置（统一规划，均在已服务的媒体根下按 novels/<novelId>/ 归类）：
 *   images/novels/<novelId>/<eid>_frame.png      关键帧图
 *   videos/novels/<novelId>/<eid>.mp4            单集视频片段（真实模型产物会下载到此）
 *   audio/voices/novels/<novelId>/<eid>.<ext>    旁白音
 * 对应 URL：/storage/images|videos|audio/voices/novels/<novelId>/...
 *
 * 视频 provider 默认 config.video.provider（mock）；配置 VIDEO_PROVIDER=seedance 走火山方舟 Doubao-Seedance。
 */

const STORAGE_ROOT = path.resolve(config.storage.path)
const MEDIA = {
  images: path.join(STORAGE_ROOT, 'images', 'novels'),
  videos: path.join(STORAGE_ROOT, 'videos', 'novels'),
  voices: path.join(STORAGE_ROOT, 'audio', 'voices', 'novels'),
}

function urlToAbs(url) {
  return path.resolve(STORAGE_ROOT, url.replace(/^\/storage\//, ''))
}

/** 确保落盘文件是可拼接的 mp4：若源是 webm/mkv 等，用 ffmpeg 转成 h264/aac mp4 */
async function ensureMp4(dest) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=format_name', '-of', 'default=nw=1:nk=1', dest],
      { timeout: 15000 }
    )
    const fmt = String(stdout).trim().toLowerCase()
    if (/mp4|mov/.test(fmt)) return
    const tmp = `${dest}.src`
    fs.renameSync(dest, tmp)
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', tmp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', dest],
      { timeout: 180000 }
    )
    fs.unlinkSync(tmp)
    logger.info(`视频转码为 mp4：${path.basename(dest)}（源 ${fmt}）`)
  } catch (e) {
    logger.warn(`视频转 mp4 失败（保留原文件）：${e.message}`)
  }
}

async function pollTask(provider, taskId, { timeoutMs = 120000, intervalMs = 2000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const st = await provider.getTaskStatus(taskId)
    if (['completed', 'failed', 'cancelled'].includes(st.status)) return st
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { status: 'timeout' }
}

async function buildVideoPrompt(project, episode, novelId = null) {
  const styleName = project.style && project.style.name ? project.style.name : ''
  const visual = project.style && project.style.visual ? project.style.visual : ''
  const shots = (episode.screenplay?.shots || []).slice(0, 4).map((s) => s.description).filter(Boolean).join('；')
  // 角色形象按剧情时间点：优先使用本集角色状态，避免终态装备出现在早期集
  let appearance = ''
  if (novelId) {
    const episodeNo = Number(episode.episodeNo ?? (episode.chapterIndex ?? 0) + 1)
    const shotText = (episode.screenplay?.shots || []).map((s) => String(s.description || '')).join(' ')
    const names = (await listCharactersAsync(novelId))
      .filter((c) => c.name && shotText.includes(c.name))
      .map((c) => c.name)
    appearance = await buildAppearanceDirective(novelId, episodeNo, names.length ? names : null)
  }
  return [styleName, visual, episode.title, shots, appearance].filter(Boolean).join('。').slice(0, 800)
}

const NON_NAME_PREFIX = new Set(['注意', '比如', '例如', '因为', '所以', '但是', '不过', '其实', '总之', '于是', '然后', '如果', '只要', '只有', '除了', '关于', '对于', '此时', '突然', '忽然', '接着', '随后', '原来', '终于'])

/**
 * 清洗「要念出来的台词」：去掉不该被朗读的部分。
 *  - 开头标签：旁白：/独白：/画外音：/字幕：/内心：…（这些是**标注**，不是台词）
 *  - 说话人标签：血瞳：/丽儿：（2–4 个汉字的角色名，排除常见连接词）
 *  - 纯占位：如 （无）（沉默）（音效）
 *  - 音效/舞台提示括号：如 （音效：风声）（转场）
 */
export function cleanSpoken(text) {
  let t = String(text || '').trim()
  // 去掉可能的多层开头标签（旁白/独白…）
  for (let i = 0; i < 3; i += 1) {
    const before = t
    t = t.replace(/^\s*(旁白|独白|画外音|画外|内心|心声|字幕|音效|环境音|配乐|OS|V\.?O\.?)\s*[：:]\s*/i, '')
    if (t === before) break
  }
  // 说话人标签（角色名）：2–4 个汉字 + 冒号，排除常见连接词
  t = t.replace(/^\s*([\u4e00-\u9fa5]{2,4})\s*[：:]\s*/, (m, name) => (NON_NAME_PREFIX.has(name) ? m : ''))
  // 去掉音效/镜头/转场等提示括号
  t = t.replace(/[（(【\[]\s*(音效|环境音|配乐|BGM|镜头|转场|字幕|画外音)[^）)】\]]*[）)】\]]/gi, '')
  // 纯占位整行（如「（无）」「（沉默）」）
  if (/^[（(【\[]\s*(无|沉默|静默|略|空镜|画面)[^）)】\]]*[）)】\]]\s*$/.test(t)) return ''
  return t.trim()
}

function buildNarration(episode) {
  return (episode.screenplay?.shots || [])
    .map((s) => cleanSpoken(s.dialogue))
    .filter(Boolean)
    .join('\n')
    .slice(0, 600)
}

/** 从台词解析说话人（角色名 → 该角色音色；无标签/旁白 → 旁白音色） */
function parseSpeaker(dialogue) {
  const t = String(dialogue || '').trim()
  const m = t.match(/^\s*([\u4e00-\u9fa5A-Za-z]{2,6})\s*[：:]\s*(.*)$/)
  if (m) {
    const label = m[1]
    const isNarr = /^(旁白|独白|画外音|画外|内心|心声|字幕|OS|V\.?O\.?)$/i.test(label)
    if (!isNarr && !NON_NAME_PREFIX.has(label)) return label
  }
  return '旁白'
}

/**
 * 按说话人分段 → 各用其**固定音色**合成 → 拼接为一条配音轨。
 * 这样"同一角色在所有集里都是同一把声音"。返回 { audioUrl, filePath, duration, segments, voices }
 */
async function synthesizeMultiVoice(novelId, episode, ttsProvider) {
  const map = await ensureVoiceMap(novelId)
  const segs = []
  for (const s of episode.screenplay?.shots || []) {
    const text = cleanSpoken(s.dialogue)
    if (!text) continue
    const speaker = parseSpeaker(s.dialogue)
    segs.push({ speaker, text, voice: voiceFor(map, speaker) })
  }
  if (!segs.length) return null

  fs.mkdirSync(TMP_DIR, { recursive: true })
  const files = []
  const usedVoices = new Set()
  for (let i = 0; i < segs.length; i += 1) {
    const r = await ttsProvider.synthesize({
      text: segs[i].text,
      language: 'zh',
      voice: segs[i].voice,
      resourceId: resourceIdFor(segs[i].voice) || undefined,
    })
    usedVoices.add(segs[i].voice)
    const srcAbs = r.audioUrl && r.audioUrl.startsWith('/storage/') ? urlToAbs(r.audioUrl) : null
    if (srcAbs && fs.existsSync(srcAbs)) files.push(srcAbs)
  }
  if (!files.length) return null

  const outDir = path.join(MEDIA.voices, novelId)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${episode.id}.mp3`)

  if (files.length === 1) {
    fs.copyFileSync(files[0], outPath)
  } else {
    const listFile = path.join(TMP_DIR, `${episode.id}_voicelist.txt`)
    fs.writeFileSync(listFile, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath], { timeout: 120000 })
  }

  let duration = null
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', outPath], { timeout: 10000 })
    const d = parseFloat(String(stdout).trim())
    if (Number.isFinite(d) && d > 0) duration = Math.round(d * 10) / 10
  } catch {
    /* ignore */
  }
  return {
    audioUrl: `/storage/audio/voices/novels/${novelId}/${episode.id}.mp3`,
    filePath: outPath,
    duration,
    segments: segs.length,
    voices: [...usedVoices],
  }
}

export async function generateEpisodeAssets(novelId, episodeId, opts = {}) {
  const project = await getNovelProjectAsync(novelId)
  assertEditable(project, 'assets')
  let episode = await getEpisode(novelId, episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  if (!episode.screenplay) {
    episode = await generateEpisodeScript(novelId, episodeId, { provider: opts.scriptProvider })
  }

  const assets = episode.assets || {}

  // 图：首镜关键帧 → images/novels/<id>/<eid>_frame.png
  if (opts.image !== false) {
    try {
      const imgProvider = getImageProvider()
      const outputPath = path.join(MEDIA.images, novelId, `${episodeId}_frame.png`)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      const prompt = await buildVideoPrompt(project, episode, novelId)
      await imgProvider.generateImage({
        prompt,
        width: 1024,
        height: 576,
        aspectRatio: '16:9',
        outputPath,
      })
      assets.image = {
        provider: imgProvider.name,
        filePath: outputPath,
        url: `/storage/images/novels/${novelId}/${episodeId}_frame.png`,
      }
    } catch (error) {
      logger.warn(`单集图片生成失败：${error.message}`)
      assets.image = { error: error.message }
    }
  }

  // 音：按说话人分段，各用其固定音色合成后拼接 → audio/voices/novels/<id>/<eid>.mp3
  if (opts.audio !== false) {
    try {
      const ttsProvider = getTTSProvider()
      let mixed = null
      try {
        mixed = await synthesizeMultiVoice(novelId, episode, ttsProvider)
      } catch (e) {
        logger.warn(`多音色配音失败，回退整段单音色：${e.message}`)
      }
      if (mixed && mixed.audioUrl) {
        assets.audio = {
          provider: ttsProvider.name,
          filePath: mixed.filePath,
          url: mixed.audioUrl,
          duration: mixed.duration,
          segments: mixed.segments,
          voices: mixed.voices,
        }
      } else {
        const narration = buildNarration(episode) || episode.title
        const tts = await ttsProvider.synthesize({ text: narration, language: 'zh', voice: opts.voice })
        const ext = path.extname(tts.audioUrl || '.wav') || '.wav'
        const dest = path.join(MEDIA.voices, novelId, `${episodeId}${ext}`)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        const srcAbs = tts.audioUrl && tts.audioUrl.startsWith('/storage/') ? urlToAbs(tts.audioUrl) : null
        if (srcAbs && fs.existsSync(srcAbs)) fs.copyFileSync(srcAbs, dest)
        assets.audio = {
          provider: ttsProvider.name,
          filePath: fs.existsSync(dest) ? dest : null,
          url: `/storage/audio/voices/novels/${novelId}/${episodeId}${ext}`,
          duration: tts.duration,
        }
      }
    } catch (error) {
      logger.warn(`单集音频生成失败：${error.message}`)
      assets.audio = { error: error.message }
    }
  }

  // 视频：整集代表片段 → videos/novels/<id>/<eid>.mp4（真实产物下载到此）
  if (opts.video !== false) {
    try {
      const videoProvider = opts.provider ? opts.provider : getVideoProvider()
      const prompt = await buildVideoPrompt(project, episode, novelId)
      const { taskId } = await videoProvider.generateVideo({
        prompt,
        duration: opts.duration || 5,
        resolution: opts.resolution || process.env.VIDEO_RESOLUTION || '480p',
        aspectRatio: opts.aspectRatio || '16:9',
      })
      const status = await pollTask(videoProvider, taskId, { timeoutMs: opts.videoTimeoutMs || 1800000 })
      const dest = path.join(MEDIA.videos, novelId, `${episodeId}.mp4`)
      let storedUrl = null
      if (status.status === 'completed' && status.videoUrl) {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        if (/^https?:\/\//.test(status.videoUrl)) {
          const resp = await fetch(status.videoUrl)
          if (resp.ok) fs.writeFileSync(dest, Buffer.from(await resp.arrayBuffer()))
        } else if (status.videoUrl.startsWith('/storage/')) {
          const srcAbs = urlToAbs(status.videoUrl)
          if (fs.existsSync(srcAbs)) fs.copyFileSync(srcAbs, dest)
        }
        if (fs.existsSync(dest)) {
          await ensureMp4(dest) // ComfyUI 常出 webm，统一转成 mp4 以便成片拼接
          storedUrl = `/storage/videos/novels/${novelId}/${episodeId}.mp4`
        }
      }
      assets.video = {
        provider: videoProvider.name,
        taskId,
        status: status.status,
        videoUrl: storedUrl || status.videoUrl || null,
        remoteUrl: status.videoUrl || null,
        error: status.error || null,
      }
    } catch (error) {
      logger.warn(`单集视频生成失败：${error.message}`)
      assets.video = { error: error.message }
    }
  }

  episode.assets = assets
  episode.status = 'assets'
  await updateEpisode(novelId, episode)

  writeNovelFile(novelId, `assets/${episodeId}.json`, JSON.stringify(assets, null, 2))

  return episode
}

export async function getEpisodeAssets(novelId, episodeId) {
  const episode = await getEpisode(novelId, episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return episode.assets || null
}
