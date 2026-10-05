/**
 * 图片生成 Provider 基类
 * 所有文生图模型（OpenAI Images / 本地 Mock 等）需实现此接口。
 */
export class BaseImageProvider {
  constructor(config) {
    this.config = config
    this.name = 'base'
  }

  /**
   * 生成图片
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.size - 例如 1024x576
   * @param {number} params.width
   * @param {number} params.height
   * @param {string} params.aspectRatio
   * @param {string} params.style
   * @param {string} params.outputPath - 本地输出路径（PNG）
   * @returns {Promise<{filePath: string, url: string, width: number, height: number, textRendered: boolean}>}
   */
  async generateImage(_params) {
    throw new Error('generateImage not implemented')
  }

  /**
   * 当前 provider 是否具备真实文生图能力（Mock 为本地占位渲染）
   */
  isRealGeneration() {
    return false
  }
}

export default BaseImageProvider
