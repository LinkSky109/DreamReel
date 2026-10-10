/**
 * 视频生成 Provider 基类
 * 所有视频生成模型（Runway、Pika、Sora 等）需实现此接口
 */
export class BaseVideoProvider {
  constructor(config) {
    this.config = config
    this.name = 'base'
  }

  /**
   * 生成视频
   * @param {Object} params
   * @param {string} params.prompt - 文本描述
   * @param {string[]} params.referenceImages - 参考图 URL 列表（用于角色/场景一致性）
   * @param {number} params.duration - 时长（秒）
   * @param {string} params.resolution - 分辨率（720p / 1080p）
   * @param {string} params.aspectRatio - 宽高比（16:9 / 9:16）
   * @returns {Promise<{taskId: string, status: string}>}
   */
  async generateVideo(_params) {
    throw new Error('generateVideo not implemented')
  }

  /**
   * 查询生成任务状态
   * @param {string} taskId
   * @returns {Promise<{status: string, videoUrl?: string, error?: string}>}
   */
  async getTaskStatus(_taskId) {
    throw new Error('getTaskStatus not implemented')
  }

  /**
   * 是否支持参考图注入（角色一致性）
   */
  supportsReferenceImages() {
    return false
  }

  /**
   * 取消生成任务
   */
  async cancelTask(_taskId) {
    throw new Error('cancelTask not implemented')
  }
}

export default BaseVideoProvider
