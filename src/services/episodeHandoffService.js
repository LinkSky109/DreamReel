import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getEpisode, updateEpisode } from './novelEpisodeStore.js'
import { novelDir } from './novelProjectService.js'
import { generateEpisodeScript } from './episodeScriptService.js'
import { getNovelProjectAsync, listCharactersAsync } from './novelAsyncReadService.js'

/**
 * 单集"外部生成"交接（Sprint 24 / 视频 plan 受限时的替代流程）
 *
 * 导出（export）：把该集的 提示词 + 规格 + 参考图 放到
 *   storage/novels/<novelId>/handoff/<episodeId>/
 *   ├─ prompt.txt       生成提示词
 *   ├─ spec.json        规格（时长/比例/分辨率/建议模型/回传路径/分镜表）
 *   └─ refs/            keyframe.png + characters.txt
 *
 * 回传（import）：把外部平台产出的 mp4 放回
 *   storage/videos/novels/<novelId>/<episodeId>.mp4
 * 然后调用 import 写入 episode.assets.video（后续 compose 直接可用）。
 */

function handoffRoot(novelId) {
  return path.join(novelDir(novelId), 'handoff')
}

function buildPrompt(project, episode) {
  const style = project.style || {}
  const shots = (episode.screenplay?.shots || [])
    .map((s) => `#${s.index}（${s.duration}s）画面：${s.description || ''}${s.dialogue ? '｜台词：' + s.dialogue : ''}`)
    .join('\n')
  return [
    `【小说剧场·单集生成提示】`,
    `作品：${project.title || ''}${project.author ? ' / ' + project.author : ''}`,
    `集：${episode.title || episode.id}（第 ${episode.episodeNo} 集）`,
    `风格：${style.name || ''}｜画面：${style.visual || ''}｜叙事：${style.narration || ''}｜配乐：${style.music || ''}`,
    `目标时长：${episode.targetSeconds || 90} 秒（成片）｜比例 16:9｜分辨率 1080p`,
    ``,
    `分镜：`,
    shots || '（无分镜，按原文情节自拟）',
    ``,
    `要求：保持角色与风格一致；参考 refs/ 下的图片与角色描述。`,
  ].join('\n')
}

export async function exportHandoff(novelId, episodeId, opts = {}) {
  const project = await getNovelProjectAsync(novelId)
  let episode = await getEpisode(novelId, episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  if (!episode.screenplay) {
    episode = await generateEpisodeScript(novelId, episodeId, {})
  }

  const dir = path.join(handoffRoot(novelId), episodeId)
  fs.mkdirSync(path.join(dir, 'refs'), { recursive: true })

  const prompt = buildPrompt(project, episode)
  fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt)

  const returnTo = `storage/videos/novels/${novelId}/${episodeId}.mp4`
  const spec = {
    episodeId,
    title: episode.title,
    episodeNo: episode.episodeNo,
    duration: episode.targetSeconds || 90,
    ratio: '16:9',
    resolution: '1080p',
    modelHint: opts.modelHint || 'doubao-seedance-2.5',
    shots: (episode.screenplay?.shots || []).map((s) => ({
      index: s.index,
      description: s.description,
      dialogue: s.dialogue,
      duration: s.duration,
    })),
    returnTo,
    note: `将生成结果 mp4 放回 ${returnTo}，再调用 handoff import 写回单集资产`,
  }
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2))

  // 参考图：该集关键帧（若已生成）
  const keyframe = path.join(config.storage.path, 'images', 'novels', novelId, `${episodeId}_frame.png`)
  if (fs.existsSync(keyframe)) {
    fs.copyFileSync(keyframe, path.join(dir, 'refs', 'keyframe.png'))
  }
  // 参考文本：角色（名字/别名/描述）
  const chars = await listCharactersAsync(novelId)
  if (chars.length) {
    const text = chars
      .map((c) => `${c.name}${c.aliases && c.aliases.length ? '（' + c.aliases.join('/') + '）' : ''}：${c.description || ''}`)
      .join('\n')
    fs.writeFileSync(path.join(dir, 'refs', 'characters.txt'), text)
  }

  episode.handoff = {
    dir: path.relative(config.storage.path, dir),
    status: 'exported',
    at: new Date().toISOString(),
  }
  await updateEpisode(novelId, episode)
  logger.info(`单集交接导出：${episodeId} → ${dir}`)

  return { dir, promptFile: path.join(dir, 'prompt.txt'), spec, refs: fs.readdirSync(path.join(dir, 'refs')) }
}

export async function importHandoffResult(novelId, episodeId, sourceFile) {
  const episode = await getEpisode(novelId, episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  if (!sourceFile || !fs.existsSync(sourceFile)) throw new Error(`source file not found: ${sourceFile}`)

  const dest = path.join(config.storage.path, 'videos', 'novels', novelId, `${episodeId}.mp4`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(sourceFile, dest)

  episode.assets = {
    ...(episode.assets || {}),
    video: {
      provider: 'external',
      status: 'completed',
      filePath: dest,
      videoUrl: `/storage/videos/novels/${novelId}/${episodeId}.mp4`,
    },
  }
  episode.handoff = { ...(episode.handoff || {}), status: 'imported', importedAt: new Date().toISOString() }
  await updateEpisode(novelId, episode)
  logger.info(`单集交接回传：${sourceFile} → ${dest}`)
  return episode.assets.video
}

export async function listHandoff(novelId) {
  await getNovelProjectAsync(novelId)
  const dir = handoffRoot(novelId)
  if (!fs.existsSync(dir)) return []
  const ids = fs
    .readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
  return Promise.all(
    ids.map(async (episodeId) => {
      const ep = await getEpisode(novelId, episodeId)
      return {
        episodeId,
        status: ep?.handoff?.status || 'unknown',
        dir: path.relative(config.storage.path, path.join(dir, episodeId)),
      }
    })
  )
}
