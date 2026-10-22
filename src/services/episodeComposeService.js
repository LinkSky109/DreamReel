import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import ffmpeg from '../utils/ffmpeg.js'
import logger from '../utils/logger.js'
import { getEpisode, updateEpisode } from './novelEpisodeStore.js'
import { assertEditable } from './novelProjectService.js'
import { getNovelProjectAsync } from './novelAsyncReadService.js'

/**
 * 单集成片（Sprint 23 / S23-1）
 * 把单集素材（视频片段 + 旁白音）合成为目标时长（默认 90s）的成片 mp4。
 * - 片段不足目标时长：循环扩展（-stream_loop -1 + -t）
 * - 有旁白：混音；无旁白：加静音轨
 * 输出到 storage/exports/novels/<novelId>/<episodeId>.mp4
 */

const STORAGE_ROOT = path.resolve(config.storage.path)
const EXPORTS_ROOT = path.join(STORAGE_ROOT, 'exports', 'novels')
const TEMP_DIR = path.join(STORAGE_ROOT, 'temp')

function urlToAbs(url) {
  return path.join(STORAGE_ROOT, url.replace(/^\/storage\//, ''))
}

const SHOT_W = 1920
const SHOT_H = 1080

function shotDir(novelId, episodeId) {
  return path.join(STORAGE_ROOT, 'videos', 'novels', novelId, 'shots', episodeId)
}

/** 收集该集已回传的分镜片段（顺序=分镜序号） */
function collectShotClips(novelId, episodeId, shots) {
  const dir = shotDir(novelId, episodeId)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const clips = []
  for (const s of shots) {
    const nn = String(s.index).padStart(2, '0')
    const hit =
      files.find((f) => f === `shot${nn}.mp4`) ||
      files.find((f) => /\.mp4$/i.test(f) && new RegExp(`shot0*${s.index}(\\D|$)`, 'i').test(f))
    const abs = hit ? path.join(dir, hit) : s.videoUrl ? urlToAbs(s.videoUrl) : null
    if (abs && fs.existsSync(abs)) clips.push({ path: abs, duration: Number(s.duration) || 5 })
  }
  return clips
}

/** 规整每段到统一规格并按分镜顺序拼接 */
async function stitchShotClips(episodeId, clips) {
  const norm = []
  for (let i = 0; i < clips.length; i += 1) {
    const out = path.join(TEMP_DIR, `${episodeId}_seg${i + 1}.mp4`)
    await ffmpeg.run([
      '-y',
      '-stream_loop', '-1',
      '-i', clips[i].path,
      '-t', String(clips[i].duration),
      '-vf', `scale=${SHOT_W}:${SHOT_H}:force_original_aspect_ratio=decrease,pad=${SHOT_W}:${SHOT_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-an',
      out,
    ])
    norm.push(out)
  }
  const stitched = path.join(TEMP_DIR, `${episodeId}_stitched.mp4`)
  if (norm.length === 1) {
    fs.copyFileSync(norm[0], stitched)
  } else {
    await ffmpeg.concatVideos(norm, stitched)
  }
  return stitched
}

export async function composeEpisode(novelId, episodeId, opts = {}) {
  const project = await getNovelProjectAsync(novelId)
  assertEditable(project, 'compose')
  const ep = await getEpisode(novelId, episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  const assets = ep.assets || {}

  const target = opts.seconds || ep.targetSeconds || 90
  fs.mkdirSync(path.join(EXPORTS_ROOT, novelId), { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const outPath = path.join(EXPORTS_ROOT, novelId, `${episodeId}.mp4`)
  const extended = path.join(TEMP_DIR, `${episodeId}_ext.mp4`)

  // 1) 视频轨：优先用「分镜回传」逐段拼接；否则回退到单段循环
  const shotClips = collectShotClips(novelId, episodeId, ep.screenplay?.shots || [])
  if (shotClips.length) {
    const stitched = await stitchShotClips(episodeId, shotClips)
    const stitchedDur = await ffmpeg.getDuration(stitched).catch(() => 0)
    if (stitchedDur && stitchedDur + 0.5 < target) {
      // 拼接总时长不足 → 循环补齐到目标时长
      await ffmpeg.run(['-y', '-stream_loop', '-1', '-i', stitched, '-t', String(target), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', extended])
    } else {
      fs.copyFileSync(stitched, extended)
    }
    logger.info(`单集成片：按 ${shotClips.length} 段分镜拼接（target=${target}s）`)
  } else {
    if (!assets.video || !assets.video.videoUrl) {
      throw new Error('缺少视频素材：既无分镜回传片段（videos/novels/<id>/shots/<eid>/shotNN.mp4），也无 assets.video')
    }
    const clipAbs = urlToAbs(assets.video.videoUrl)
    await ffmpeg.run(['-y', '-stream_loop', '-1', '-i', clipAbs, '-t', String(target), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', extended])
  }

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
  await updateEpisode(novelId, ep)
  logger.info(`单集成片完成：${episodeId} → ${outPath}（${duration}s）`)
  return ep.composition
}
