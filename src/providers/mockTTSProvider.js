import { BaseTTSProvider } from './baseTTSProvider.js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import config from '../config/index.js'

const execFileAsync = promisify(execFile)
const STORAGE_DIR = path.resolve(config.storage.path)
const VOICES_DIR = path.join(STORAGE_DIR, 'audio', 'voices')
const MAX_TTS_SECONDS = 120

const PRESET_VOICES = [
  { id: 'zh_male_calm', name: '沉稳男声', language: 'zh', gender: 'male' },
  { id: 'zh_female_warm', name: '温暖女声', language: 'zh', gender: 'female' },
  { id: 'en_male_professional', name: 'Professional Male', language: 'en', gender: 'male' },
  { id: 'en_female_clear', name: 'Clear Female', language: 'en', gender: 'female' },
  { id: 'ja_male_standard', name: '標準男声', language: 'ja', gender: 'male' },
]

/**
 * Mock TTS Provider
 */
export class MockTTSProvider extends BaseTTSProvider {
  constructor(config) {
    super(config)
    this.name = 'mock'
  }

  async synthesize(params) {
    await new Promise((resolve) => setTimeout(resolve, 800))

    // 估算时长：中文约 4 字/秒，英文约 3 词/秒
    const charCount = params.text.length
    const estimatedDuration = Math.min(
      MAX_TTS_SECONDS,
      Math.max(1, (charCount / 4) * (params.speed || 1))
    )
    if (!fs.existsSync(VOICES_DIR)) fs.mkdirSync(VOICES_DIR, { recursive: true })

    const fileName = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`
    const filePath = path.join(VOICES_DIR, fileName)
    const frequency = 220 + (hashText(params.text) % 8) * 40

    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi',
          '-i', `sine=frequency=${frequency}:duration=${estimatedDuration.toFixed(2)}`,
          '-af', 'volume=0.18',
          '-c:a', 'pcm_s16le',
          filePath,
        ],
        { timeout: 20000 }
      )
    } catch {
      writeSilentWav(filePath, estimatedDuration)
    }

    return {
      audioUrl: `/storage/audio/voices/${fileName}`,
      duration: estimatedDuration,
      placeholder: true,
      provider: 'mock',
    }
  }

  async getVoices() {
    return PRESET_VOICES
  }
}

function hashText(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100000
  }
  return hash
}

function writeSilentWav(filePath, durationSeconds) {
  const sampleRate = 8000
  const samples = Math.max(1, Math.floor(sampleRate * durationSeconds))
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  fs.writeFileSync(filePath, buffer)
}

export { PRESET_VOICES }
export default MockTTSProvider
