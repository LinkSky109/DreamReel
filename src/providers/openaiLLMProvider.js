import { BaseLLMProvider } from './baseLLMProvider.js'
import { parseJsonLoose } from '../utils/jsonParse.js'
import logger from '../utils/logger.js'

/**
 * OpenAI 兼容 LLM Provider
 * 支持 OpenAI、Azure OpenAI、以及任何 OpenAI 兼容 API（如 vLLM、Ollama 等）
 */
export class OpenAILLMProvider extends BaseLLMProvider {
  constructor(config) {
    super(config)
    // DeepSeek 官方 API 与 OpenAI 协议兼容，复用本 Provider，仅名称/默认端点不同
    this.name = config.provider === 'deepseek' ? 'deepseek' : 'openai'
    this.apiKey = config.apiKey
    this.model = config.model || (this.name === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini')
    this.baseUrl = config.baseUrl || (this.name === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1')
    this.maxRetries = config.maxRetries || 2
    this.timeout = config.timeout || parseInt(process.env.LLM_TIMEOUT_MS || '', 10) || 600000
  }

  async generate(params) {
    try {
      if (!this.apiKey) {
        throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.')
      }

      const messages = []
      if (params.systemPrompt) {
        messages.push({ role: 'system', content: params.systemPrompt })
      }
      messages.push({ role: 'user', content: params.userPrompt })

      const body = {
        model: this.model,
        messages,
        temperature: params.options?.temperature ?? 0.7,
        max_tokens: params.options?.maxTokens ?? 2000,
      }

      // 可选参数
      if (params.options?.topP !== undefined) {
        body.top_p = params.options.topP
      }
      if (params.options?.frequencyPenalty !== undefined) {
        body.frequency_penalty = params.options.frequencyPenalty
      }

      logger.info(`OpenAI generate: model=${this.model}, maxTokens=${body.max_tokens}`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`OpenAI API error ${response.status}: ${errorText}`)
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''

      logger.info(`OpenAI generate completed: ${content.length} chars, usage=${JSON.stringify(data.usage)}`)

      return {
        content,
        usage: data.usage,
        model: data.model,
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('OpenAI request timeout')
        throw new Error('OpenAI request timeout')
      }
      logger.error('OpenAI generate failed:', error.message)
      throw error
    }
  }

  /**
   * 生成 JSON 格式响应（带重试和解析）
   */
  async generateJSON(params) {
    const result = await this.generate({
      ...params,
      options: {
        ...params.options,
        temperature: params.options?.temperature ?? 0.3, // JSON 生成用较低温度
      },
    })

    try {
      const data = parseJsonLoose(result.content)
      return { data, raw: result.content, usage: result.usage }
    } catch (parseError) {
      logger.error('Failed to parse OpenAI JSON response:', parseError.message)
      throw new Error(`Failed to parse JSON response: ${parseError.message}`)
    }
  }
}

export default OpenAILLMProvider
