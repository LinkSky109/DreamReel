import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { BGM_LIBRARY } from '../config/bgmLibrary.js'
import { SFX_LIBRARY } from '../config/sfxLibrary.js'

const execFileAsync = promisify(execFile)
const STORAGE_DIR = path.resolve(config.storage.path)
const BGM_DIR = path.join(STORAGE_DIR, 'audio', 'bgm')
const SFX_DIR = path.join(STORAGE_DIR, 'audio', 'sfx')

const EMOTION_TONES = {
  tension: [196, 233],
  warm: [261, 329],
  epic: [130, 196],
  mystery: [174, 207],
  upbeat: [329, 392],
  sad: [220, 261],
  calm: [174, 261],
  romance: [246, 311],
  default: [220, 293],
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function runFfmpeg(args, outputPath) {
  await execFileAsync('ffmpeg', ['-y', ...args, outputPath], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 })
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(`ffmpeg did not produce ${outputPath}`)
  }
}

export async function generateBgmFile(bgm, { duration = 60 } = {}) {
  ensureDir(BGM_DIR)
  const outputPath = path.join(BGM_DIR, bgm.filename)
  const tones = EMOTION_TONES[bgm.emotion] || EMOTION_TONES.default
  const fadeOutStart = Math.max(0, duration - 2)
  const filter = [
    '[0:a][1:a]amix=inputs=2:duration=longest',
    'volume=0.28',
    'afade=t=in:st=0:d=1',
    `afade=t=out:st=${fadeOutStart}:d=2`,
  ].join(',')

  await runFfmpeg(
    [
      '-f', 'lavfi', '-i', `sine=frequency=${tones[0]}:duration=${duration}`,
      '-f', 'lavfi', '-i', `sine=frequency=${tones[1]}:duration=${duration}`,
      '-filter_complex', filter,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
    ],
    outputPath
  )
  logger.info(`Procedural BGM generated: ${bgm.id} -> ${bgm.filename}`)
  return { id: bgm.id, filePath: outputPath, url: `/storage/audio/bgm/${bgm.filename}`, duration }
}

export async function generateSfxFile(sfx) {
  ensureDir(SFX_DIR)
  const outputPath = path.join(SFX_DIR, sfx.filename)
  const category = sfx.category || 'ui'
  const args = sfxArgsForCategory(category)
  await runFfmpeg(args, outputPath)
  logger.info(`Procedural SFX generated: ${sfx.id} -> ${sfx.filename}`)
  return { id: sfx.id, filePath: outputPath, url: `/storage/audio/sfx/${sfx.filename}`, category }
}

function sfxArgsForCategory(category) {
  switch (category) {
    case 'ambient':
    case 'nature':
      return [
        '-f', 'lavfi', '-i', 'anoisesrc=color=pink:duration=2',
        '-af', 'lowpass=f=1200,afade=t=in:st=0:d=0.3,afade=t=out:st=1.6:d=0.4',
        '-c:a', 'libmp3lame', '-b:a', '96k',
      ]
    case 'impact':
    case 'action':
      return [
        '-f', 'lavfi', '-i', 'sine=frequency=72:duration=0.45',
        '-af', 'afade=t=out:st=0.1:d=0.35',
        '-c:a', 'libmp3lame', '-b:a', '96k',
      ]
    case 'transition':
      return [
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.7',
        '-af', 'asetrate=44100*1.8,atempo=0.9,afade=t=out:st=0.2:d=0.5',
        '-c:a', 'libmp3lame', '-b:a', '96k',
      ]
    case 'ui':
    default:
      return [
        '-f', 'lavfi', '-i', 'sine=frequency=1200:duration=0.18',
        '-af', 'afade=t=out:st=0.05:d=0.13',
        '-c:a', 'libmp3lame', '-b:a', '96k',
      ]
  }
}

export async function seedAudioPack({ bgmIds = null, sfxIds = null, duration = 60 } = {}) {
  const bgms = bgmIds ? BGM_LIBRARY.filter((b) => bgmIds.includes(b.id)) : BGM_LIBRARY
  const sfxs = sfxIds ? SFX_LIBRARY.filter((s) => sfxIds.includes(s.id)) : SFX_LIBRARY
  const result = { bgmGenerated: 0, sfxGenerated: 0, errors: [] }

  for (const bgm of bgms) {
    try {
      await generateBgmFile(bgm, { duration })
      result.bgmGenerated += 1
    } catch (error) {
      result.errors.push({ id: bgm.id, error: error.message })
    }
  }

  for (const sfx of sfxs) {
    try {
      await generateSfxFile(sfx)
      result.sfxGenerated += 1
    } catch (error) {
      result.errors.push({ id: sfx.id, error: error.message })
    }
  }

  return result
}

export default { generateBgmFile, generateSfxFile, seedAudioPack }
