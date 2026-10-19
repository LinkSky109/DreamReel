import { randomUUID } from 'crypto'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * 火山豆包语音「声音复刻 / 音色设计」HTTP 客户端。
 *
 * 与 TTS 合成不同，这两个接口需要**语音技术控制台 API Key**（X-Api-Key），
 * 不能用 Agent Plan key；未配置时调用会返回 401 Invalid X-Api-Key，这里转为可操作错误。
 *
 * - 声音复刻：POST /api/v3/tts/voice_clone   （上传音频样本 → 注册自定义音色）
 * - 音色设计：POST /api/v3/tts/voice_design  （文本/图片提示 → 生成音色与试听）
 *
 * 计费提醒（官方文档）：后付费音色在**首次合成**时转正并收取音色槽位费；
 * 仅复刻不合成，7 天后自动清理。设计接口的 speaker_id 需在控制台购买。
 */

export class VoiceApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message)
    this.name = 'VoiceApiError'
    this.status = status
    this.code = code
  }
}

function cfgOf(overrides = {}) {
  const c = config.volcVoice || {}
  return {
    apiKey: overrides.apiKey || c.apiKey || '',
    baseUrl: (overrides.baseUrl || c.baseUrl || 'https://openspeech.bytedance.com').replace(/\/+$/, ''),
    clonePath: overrides.clonePath || c.clonePath || '/api/v3/tts/voice_clone',
    designPath: overrides.designPath || c.designPath || '/api/v3/tts/voice_design',
    timeoutMs: overrides.timeoutMs || c.timeoutMs || 120000,
    fetchImpl: overrides.fetchImpl || fetch,
  }
}

function assertKey(apiKey) {
  if (!apiKey) {
    throw new VoiceApiError(
      '未配置语音技术控制台 API Key：请设置 VOLC_VOICE_API_KEY（声音复刻/音色设计不能用 Agent Plan key）'
    )
  }
}

const ALLOWED_FORMATS = new Set(['wav', 'mp3', 'ogg', 'm4a', 'aac', 'pcm'])
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024
export const MAX_DESIGN_TEXT = 300
export const MAX_DESIGN_PROMPT = 200

async function post(cfg, path, body) {
  const res = await cfg.fetchImpl(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': cfg.apiKey,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 保留原文 */
  }
  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || text.slice(0, 200)
    if (res.status === 401) {
      throw new VoiceApiError(`语音技术控制台鉴权失败（401）：${msg}（确认 VOLC_VOICE_API_KEY 有效且有声音复刻/音色设计权限）`, { status: 401 })
    }
    throw new VoiceApiError(`火山语音接口失败（HTTP ${res.status}）：${msg}`, { status: res.status, code: json && json.code })
  }
  return json || {}
}

/** 校验自定义音色代号：8–256 字符，字母开头，仅允许字母/数字/-/_，且不与官方前缀冲突 */
export function validateSpeakerName(name) {
  const s = String(name || '')
  if (!/^[A-Za-z][A-Za-z0-9_-]{7,255}$/.test(s)) {
    return '音色代号需 8–256 位、以字母开头，仅含字母/数字/-/_'
  }
  if (/^(S_|ICL_|MIX_|DiT_|BV|[a-z]{2}_)/i.test(s)) return '音色代号不能使用官方保留前缀'
  return null
}

/**
 * 声音复刻：上传音频样本，注册自定义音色（后付费 custom_speaker_id）。
 * @returns {Promise<{speakerId:string,status:number,demoAudio?:string,availableTrainingTimes?:number}>}
 */
export async function cloneVoice({ speakerId, audioBase64, format = 'mp3', language = 0, text = '', demoText = '', apiKey, baseUrl, fetchImpl } = {}) {
  const cfg = cfgOf({ apiKey, baseUrl, fetchImpl })
  assertKey(cfg.apiKey)
  const nameErr = validateSpeakerName(speakerId)
  if (nameErr && speakerId !== 'custom_speaker_id') {
    // 预付费 S_xxx 或后付费自定义名都允许；仅当传自定义名时校验
    if (!String(speakerId || '').startsWith('S_')) throw new VoiceApiError(nameErr)
  }
  if (!audioBase64) throw new VoiceApiError('缺少音频样本')
  const bytes = Buffer.byteLength(audioBase64, 'base64')
  if (bytes > MAX_SAMPLE_BYTES) throw new VoiceApiError(`音频样本超限：${bytes} 字节 > ${MAX_SAMPLE_BYTES}`)
  if (!ALLOWED_FORMATS.has(String(format).toLowerCase())) throw new VoiceApiError(`不支持的音频格式：${format}`)

  const body = {
    speaker_id: speakerId,
    audio: { data: audioBase64, format: String(format).toLowerCase() },
    language: Number(language) || 0,
  }
  if (text) body.text = String(text).slice(0, 300)
  if (demoText) body.extra_params = { demo_text: String(demoText).slice(0, 300) }

  const data = await post(cfg, cfg.clonePath, body)
  const status = data.status
  if (status !== 2 && status !== 4) {
    throw new VoiceApiError(`声音复刻未成功（status=${status}）：${data.message || '请检查音频样本质量与文本一致性'}`)
  }
  const demo = Array.isArray(data.speaker_status) ? data.speaker_status.map((s) => s.demo_audio).filter(Boolean) : []
  logger.info(`声音复刻成功 speaker=${data.speaker_id || speakerId}`)
  return {
    speakerId: data.speaker_id || speakerId,
    status,
    demoAudio: demo[0] || null,
    availableTrainingTimes: data.available_training_times,
  }
}

/**
 * 音色设计：按文本（或图片）提示生成音色与试听音频。
 * 注意：speaker_id 需在控制台购买（预付费槽位）。
 * @returns {Promise<{speakerId:string,demoAudio?:string}>}
 */
export async function designVoice({ speakerId, text, textPrompt, imageBase64 = '', language = 0, apiKey, baseUrl, fetchImpl } = {}) {
  const cfg = cfgOf({ apiKey, baseUrl, fetchImpl })
  assertKey(cfg.apiKey)
  if (!speakerId) throw new VoiceApiError('音色设计需要已购买的 speaker_id（控制台购买）')
  if (!text) throw new VoiceApiError('音色设计需要试听文本 text')
  const prompt = {}
  if (textPrompt) prompt.text_prompt = String(textPrompt).slice(0, MAX_DESIGN_PROMPT)
  if (imageBase64) prompt.image_prompt = { image_bytes: imageBase64 }
  if (!prompt.text_prompt && !prompt.image_prompt) throw new VoiceApiError('音色设计需要 text_prompt 或 image_prompt 至少其一')

  const data = await post(cfg, cfg.designPath, {
    speaker_id: speakerId,
    text: String(text).slice(0, MAX_DESIGN_TEXT),
    prompt,
    language: Number(language) || 0,
  })
  logger.info(`音色设计完成 speaker=${speakerId}`)
  // 设计接口返回结构随版本可能不同，容错尽量取出试听地址
  const demo = data.demo_audio || data.audio || (Array.isArray(data.speaker_status) ? data.speaker_status[0] && data.speaker_status[0].demo_audio : null)
  return { speakerId: data.speaker_id || speakerId, demoAudio: demo || null, raw: data }
}

export default { cloneVoice, designVoice, validateSpeakerName, VoiceApiError, MAX_SAMPLE_BYTES }
