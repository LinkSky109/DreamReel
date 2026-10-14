import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getImageProvider } from '../providers/imageProviderFactory.js'
import { getTTSProvider } from '../providers/ttsProviderFactory.js'
import { getVideoProvider } from '../providers/videoProviderFactory.js'
import { storageService } from './storageService.js'
import { getNovelProject, writeNovelFile, assertEditable } from './novelProjectService.js'
import { generateEpisodeScript } from './episodeScriptService.js'

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

const MEDIA = {
  images: path.join(config.storage.path, 'images', 'novels'),
  videos: path.join(config.storage.path, 'videos', 'novels'),
  voices: path.join(config.storage.path, 'audio', 'voices', 'novels'),
}

function urlToAbs(url) {
  return path.join(config.storage.path, url.replace(/^\/storage\//, ''))
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

function buildVideoPrompt(project, episode) {
  const styleName = project.style && project.style.name ? project.style.name : ''
  const visual = project.style && project.style.visual ? project.style.visual : ''
  const shots = (episode.screenplay?.shots || []).slice(0, 4).map((s) => s.description).filter(Boolean).join('；')
  return `${styleName}。${visual}。${episode.title}。${shots}`.slice(0, 500)
}

function buildNarration(episode) {
  return (episode.screenplay?.shots || [])
    .map((s) => s.dialogue)
    .filter(Boolean)
    .join('\n')
    .slice(0, 300)
}

export async function generateEpisodeAssets(novelId, episodeId, opts = {}) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'assets')
  let episode = storageService.getEpisode(episodeId)
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
      const prompt = buildVideoPrompt(project, episode)
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

  // 音：旁白 → audio/voices/novels/<id>/<eid>.<ext>
  if (opts.audio !== false) {
    try {
      const ttsProvider = getTTSProvider()
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
    } catch (error) {
      logger.warn(`单集音频生成失败：${error.message}`)
      assets.audio = { error: error.message }
    }
  }

  // 视频：整集代表片段 → videos/novels/<id>/<eid>.mp4（真实产物下载到此）
  if (opts.video !== false) {
    try {
      const videoProvider = opts.provider ? opts.provider : getVideoProvider()
      const prompt = buildVideoPrompt(project, episode)
      const { taskId } = await videoProvider.generateVideo({
        prompt,
        duration: opts.duration || 5,
        resolution: opts.resolution || '720p',
        aspectRatio: opts.aspectRatio || '16:9',
      })
      const status = await pollTask(videoProvider, taskId, { timeoutMs: opts.videoTimeoutMs || 120000 })
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
        if (fs.existsSync(dest)) storedUrl = `/storage/videos/novels/${novelId}/${episodeId}.mp4`
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
  storageService.updateEpisode(episode)

  writeNovelFile(novelId, `assets/${episodeId}.json`, JSON.stringify(assets, null, 2))

  return episode
}

export function getEpisodeAssets(novelId, episodeId) {
  const episode = storageService.getEpisode(episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return episode.assets || null
}
