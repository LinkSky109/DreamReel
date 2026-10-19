import { parseJsonLoose } from '../utils/jsonParse.js'

/**
 * LLM Provider 基类 — 用于剧本生成等文本任务
 */
export class BaseLLMProvider {
  constructor(config) {
    this.config = config
    this.name = 'base'
  }

  /**
   * 生成文本
   * @param {Object} params
   * @param {string} params.systemPrompt - 系统提示词
   * @param {string} params.userPrompt - 用户输入
   * @param {Object} params.options - 额外选项（temperature, maxTokens 等）
   * @returns {Promise<{content: string, usage?: Object}>}
   */
  async generate(_params) {
    throw new Error('generate not implemented')
  }

  /**
   * 生成结构化 JSON（宽松解析：容忍代码块/前后说明/尾逗号/单引号等）
   */
  async generateJSON(params) {
    const result = await this.generate(params)
    // 透出 usage（供指标层记录 token）；此前仅返回 { data, raw } 导致文本用量丢失
    return { data: parseJsonLoose(result.content), raw: result.content, usage: result.usage }
  }
}

export default BaseLLMProvider
