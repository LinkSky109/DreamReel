import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import ffmpeg from '../utils/ffmpeg.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { getNovelProject, assertEditable } from './novelProjectService.js'

/**
 * 单集成片（Sprint 23 / S23-1）
 * 把单集素材（视频片段 + 旁白音）合成为目标时长（默认 90s）的成片 mp4。
 * - 片段不足目标时长：循环扩展（-stream_loop -1 + -t）
 * - 有旁白：混音；无旁白：加静音轨
 * 输出到 storage/exports/novels/<novelId>/<episodeId>.mp4
 */

const EXPORTS_ROOT = path.join(config.storage.path, 'exports', 'novels')
const TEMP_DIR = path.join(config.storage.path, 'temp')

function urlToAbs(url) {
  return path.join(config.storage.path, url.replace(/^\/storage\//, ''))
}

export async function composeEpisode(novelId, episodeId, opts = {}) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'compose')
  const ep = storageService.getEpisode(episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  const assets = ep.assets || {}
  if (!assets.video || !assets.video.videoUrl) {
    throw new Error('缺少视频素材，请先生成 assets（POST /episodes/:eid/assets）')
  }

  const target = opts.seconds || ep.targetSeconds || 90
  fs.mkdirSync(path.join(EXPORTS_ROOT, novelId), { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const outPath = path.join(EXPORTS_ROOT, novelId, `${episodeId}.mp4`)
  const extended = path.join(TEMP_DIR, `${episodeId}_ext.mp4`)
  const clipAbs = urlToAbs(assets.video.videoUrl)

  // 1) 循环扩展（或裁剪）到目标时长
  await ffmpeg.run([
    '-y',
    '-stream_loop', '-1',
    '-i', clipAbs,
    '-t', String(target),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-an',
    extended,
  ])

  // 2) 音轨：旁白（补齐到目标）或静音
  const audioUrl = assets.audio && (assets.audio.url || assets.audio.audioUrl)
  const audioAbs = audioUrl ? urlToAbs(audioUrl) : null
  const tmpAudio = path.join(TEMP_DIR, `${episodeId}_aud.m4a`)
  if (audioAbs && fs.existsSync(audioAbs)) {
    await ffmpeg.adjustVolumeAndPad(audioAbs, tmpAudio, 1.0, target)
  } else {
    await ffmpeg.generateSilence(tmpAudio, target)
  }
  await ffmpeg.mergeAudio(extended, tmpAudio, outPath)

  const duration = await ffmpeg.getDuration(outPath)
  const hasVideo = await ffmpeg.hasVideoStream(outPath)

  ep.composition = {
    outputPath: outPath,
    url: `/storage/exports/novels/${novelId}/${episodeId}.mp4`,
    duration,
    hasVideo,
    targetSeconds: target,
  }
  ep.status = 'composed'
  storageService.updateEpisode(ep)
  logger.info(`单集成片完成：${episodeId} → ${outPath}（${duration}s）`)
  return ep.composition
}
