import { BaseTTSProvider } from './baseTTSProvider.js'

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
    const estimatedDuration = Math.max(1, (charCount / 4) * (params.speed || 1))

    return {
      audioUrl: `https://mock-tts.example.com/audio/${Date.now()}.mp3`,
      duration: estimatedDuration,
    }
  }

  async getVoices() {
    return PRESET_VOICES
  }
}

export { PRESET_VOICES }
export default MockTTSProvider
