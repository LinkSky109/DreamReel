import { BaseTTSProvider } from './baseTTSProvider.js'
import logger from '../utils/logger.js'
import fs from 'fs'
import path from 'path'
import config from '../config/index.js'

const STORAGE_DIR = path.resolve(config.storage.path)
const VOICES_DIR = path.join(STORAGE_DIR, 'audio', 'voices')

// 确保目录存在
if (!fs.existsSync(VOICES_DIR)) {
  fs.mkdirSync(VOICES_DIR, { recursive: true })
}

/**
 * ElevenLabs TTS Provider
 * 文档：https://docs.elevenlabs.io/
 * 支持多种高质量语音合成
 */
export class ElevenLabsTTSProvider extends BaseTTSProvider {
  constructor(config) {
    super(config)
    this.name = 'elevenlabs'
    this.apiKey = config.elevenLabsApiKey
    this.baseUrl = 'https://api.elevenlabs.io/v1'
    this.defaultVoiceId = config.defaultVoiceId || '21m00Tcm4Tlv' // Rachel
    this.modelId = config.modelId || 'eleven_monolingual_v1'
  }

  getAvailableVoices() {
    return [
      { id: '21m00Tcm4Tlv', name: 'Rachel', gender: 'female', language: 'en' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', language: 'en' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', language: 'en' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', language: 'en' },
      { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', language: 'en' },
      { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', language: 'en' },
    ]
  }

  async synthesize(params) {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured. Set ELEVENLABS_API_KEY environment variable.')
      }

      const voiceId = params.voiceId || this.defaultVoiceId
      const body = {
        text: params.text,
        model_id: this.modelId,
        voice_settings: {
          stability: params.stability ?? 0.5,
          similarity_boost: params.similarityBoost ?? 0.75,
        },
      }

      logger.info(`ElevenLabs synthesize: voice=${voiceId}, textLength=${params.text.length}`)

      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`ElevenLabs API error ${response.status}: ${errorText}`)
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`)
      }

      const audioBuffer = await response.arrayBuffer()
      logger.info(`ElevenLabs synthesize completed: ${audioBuffer.byteLength} bytes`)

      // 保存音频文件到 storage，返回统一格式的 URL
      const fileName = `elevenlabs_${voiceId}_${Date.now()}.mp3`
      const filePath = path.join(VOICES_DIR, fileName)
      fs.writeFileSync(filePath, Buffer.from(audioBuffer))
      const audioUrl = `/storage/audio/voices/${fileName}`

      return {
        audioUrl,
        duration: this.estimateDuration(params.text),
        placeholder: false,
        provider: 'elevenlabs',
      }
    } catch (error) {
      logger.error('ElevenLabs synthesize failed:', error.message)
      throw error
    }
  }

  /**
   * 估算音频时长（粗略估算：约 150 字/分钟）
   */
  estimateDuration(text) {
    const words = text.split(/\s+/).length
    return Math.max(1, Math.round(words / 2.5)) // 约 2.5 字/秒
  }
}

export default ElevenLabsTTSProvider
