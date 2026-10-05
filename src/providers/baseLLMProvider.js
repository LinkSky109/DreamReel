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
  async generate(params) {
    throw new Error('generate not implemented')
  }

  /**
   * 生成结构化 JSON（自动重试解析）
   */
  async generateJSON(params) {
    const result = await this.generate(params)
    try {
      // 优先匹配代码块中的 JSON，其次匹配裸 JSON 对象
      const codeBlockMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = codeBlockMatch
        ? codeBlockMatch[1]
        : result.content.trim()
      return { data: JSON.parse(jsonStr), raw: result.content }
    } catch (error) {
      throw new Error(`Failed to parse LLM response as JSON: ${error.message}`)
    }
  }
}

export default BaseLLMProvider
