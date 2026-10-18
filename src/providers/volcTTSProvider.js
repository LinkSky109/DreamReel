import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { BaseTTSProvider } from './baseTTSProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const execFileAsync = promisify(execFile)
const STORAGE_DIR = path.resolve(config.storage.path)
const VOICES_DIR = path.join(STORAGE_DIR, 'audio', 'voices')

/**
 * 火山引擎「豆包语音」TTS（大模型语音合成 2.0）
 *
 * 官方规格（openspeech.bytedance.com）：
 *   POST /api/v3/tts/unidirectional
 *   Headers: X-Api-Key / X-Api-Resource-Id: seed-tts-2.0 / X-Api-Request-Id
 *   Body: {"req_params":{"text","speaker","audio_params":{"format":"mp3"}}}
 *   响应：NDJSON 流，每行 {"code":0,"data":"<base64 音频块>"}；末行 {"code":20000000,"message":"OK"}
 *
 * 鉴权用「语音技术控制台」的 API Key（X-Api-Key），与方舟 ARK API Key 相互独立。
 */
export class VolcTTSProvider extends BaseTTSProvider {
  constructor(cfg = {}) {
    super(cfg)
    this.name = 'volc'
    this.apiKey = cfg.volcTtsApiKey || process.env.VOLC_TTS_API_KEY || ''
    this.baseUrl = cfg.volcTtsBaseUrl || process.env.VOLC_TTS_BASE_URL || 'https://openspeech.bytedance.com'
    this.resourceId = cfg.volcTtsResourceId || process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0'
    this.speaker = cfg.volcTtsSpeaker || process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'
    this.format = cfg.volcTtsFormat || process.env.VOLC_TTS_FORMAT || 'mp3'
    this.timeout = cfg.timeout || parseInt(process.env.LLM_TIMEOUT_MS || '', 10) || 60000
  }

  async synthesize({ text, voice } = {}) {
    if (!this.apiKey) throw new Error('VOLC_TTS_API_KEY 未配置（语音技术控制台的 API Key）')
    if (!text) throw new Error('TTS 文本为空')

    const body = {
      req_params: {
        text,
        speaker: voice || this.speaker,
        audio_params: { format: this.format },
      },
    }
    const res = await fetch(`${this.baseUrl}/api/v3/tts/unidirectional`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'X-Api-Resource-Id': this.resourceId,
        'X-Api-Request-Id': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`volc tts http ${res.status}: ${t.slice(0, 200)}`)
    }

    // NDJSON：逐行解析，拼接 base64 音频块
    const raw = await res.text()
    const chunks = []
    for (const line of raw.split('\n')) {
      const s = line.trim()
      if (!s) continue
      let j
      try {
        j = JSON.parse(s)
      } catch {
        continue
      }
      if (j.data) chunks.push(Buffer.from(j.data, 'base64'))
      else if (typeof j.code === 'number' && j.code >= 40000000) throw new Error(`volc tts error ${j.code}: ${j.message || ''}`)
    }
    if (!chunks.length) throw new Error(`volc tts 未返回音频数据：${raw.slice(0, 200)}`)

    const buf = Buffer.concat(chunks)
    if (!fs.existsSync(VOICES_DIR)) fs.mkdirSync(VOICES_DIR, { recursive: true })
    const fileName = `volc_${Date.now()}_${randomUUID().slice(0, 8)}.${this.format}`
    const filePath = path.join(VOICES_DIR, fileName)
    fs.writeFileSync(filePath, buf)

    // 时长：优先 ffprobe，失败则按 ~4.5 字/秒估算
    let duration = Math.max(1, Math.round((text.length / 4.5) * 10) / 10)
    try {
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath], { timeout: 10000 })
      const d = parseFloat(String(stdout).trim())
      if (Number.isFinite(d) && d > 0) duration = Math.round(d * 10) / 10
    } catch {
      /* 保留估算 */
    }

    logger.info(`volc tts: ${text.length} 字 → ${fileName}（${duration}s）`)
    return { audioUrl: `/storage/audio/voices/${fileName}`, duration, provider: this.name }
  }

  async getVoices() {
    return [
      { id: 'zh_female_vv_uranus_bigtts', name: 'Vv（女·2.0）', language: 'zh', gender: 'female' },
      { id: 'zh_male_yangguangqingnian_mars_bigtts', name: '阳光青年（男·2.0）', language: 'zh', gender: 'male' },
    ]
  }
}

export default VolcTTSProvider
