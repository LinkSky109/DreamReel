/**
 * TTS Provider 基类 — 用于配音生成
 */
export class BaseTTSProvider {
  constructor(config) {
    this.config = config
    this.name = 'base'
  }

  /**
   * 生成语音
   * @param {Object} params
   * @param {string} params.text - 文本内容
   * @param {string} params.language - 语言（zh / en / ja）
   * @param {string} params.voice - 音色 ID
   * @param {number} params.speed - 语速（0.5-2.0）
   * @returns {Promise<{audioUrl: string, duration: number}>}
   */
  async synthesize(params) {
    throw new Error('synthesize not implemented')
  }

  /**
   * 获取可用音色列表
   */
  async getVoices() {
    return []
  }
}

export default BaseTTSProvider
