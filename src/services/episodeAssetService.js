import path from 'path'
import logger from '../utils/logger.js'
import { getImageProvider } from '../providers/imageProviderFactory.js'
import { getTTSProvider } from '../providers/ttsProviderFactory.js'
import { getVideoProvider } from '../providers/videoProviderFactory.js'
import { storageService } from './storageService.js'
import { getNovelProject, writeNovelFile, novelDir } from './novelProjectService.js'
import { generateEpisodeScript } from './episodeScriptService.js'

/**
 * 单集资产生成（Sprint 22 / S22-1）：图 / 音 / 视频。
 *
 * - 视频 provider 默认取 config.video.provider（mock）；配置 `VIDEO_PROVIDER=seedance`
 *   + `SEEDANCE_API_KEY` 后走**火山方舟 Doubao-Seedance-2.5**（`SEEDANCE_MODEL` 可配）。
 * - 图/TTS 走各自工厂（mock 或真实）。
 * - 结果记到 episode.assets。
 */

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
  let episode = storageService.getEpisode(episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  // 需要剧本（分镜）作为资产来源
  if (!episode.screenplay) {
    episode = await generateEpisodeScript(novelId, episodeId, { provider: opts.scriptProvider })
  }

  const assets = episode.assets || {}

  // 图：首镜关键帧
  if (opts.image !== false) {
    try {
      const imgProvider = getImageProvider()
      const outputPath = path.join(novelDir(novelId), 'assets', `${episodeId}_frame.png`)
      const prompt = buildVideoPrompt(project, episode)
      const img = await imgProvider.generateImage({
        prompt,
        width: 1024,
        height: 576,
        aspectRatio: '16:9',
        outputPath,
      })
      assets.image = { provider: imgProvider.name, url: img.url, filePath: img.filePath }
    } catch (error) {
      logger.warn(`单集图片生成失败：${error.message}`)
      assets.image = { error: error.message }
    }
  }

  // 音：旁白/台词
  if (opts.audio !== false) {
    try {
      const ttsProvider = getTTSProvider()
      const narration = buildNarration(episode) || episode.title
      const tts = await ttsProvider.synthesize({ text: narration, language: 'zh', voice: opts.voice })
      assets.audio = { provider: ttsProvider.name, audioUrl: tts.audioUrl, duration: tts.duration }
    } catch (error) {
      logger.warn(`单集音频生成失败：${error.message}`)
      assets.audio = { error: error.message }
    }
  }

  // 视频：整集代表片段（多镜拼接留待 Sprint 23）
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
      assets.video = { provider: videoProvider.name, taskId, status: status.status, videoUrl: status.videoUrl || null, error: status.error || null }
    } catch (error) {
      logger.warn(`单集视频生成失败：${error.message}`)
      assets.video = { error: error.message }
    }
  }

  episode.assets = assets
  episode.status = 'assets'
  storageService.updateEpisode(episode)

  // 落盘资产清单
  writeNovelFile(novelId, `assets/${episodeId}.json`, JSON.stringify(assets, null, 2))

  return episode
}

export function getEpisodeAssets(novelId, episodeId) {
  const episode = storageService.getEpisode(episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return episode.assets || null
}
