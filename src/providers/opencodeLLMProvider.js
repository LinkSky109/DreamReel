import { generateText } from 'ai'
import { createOpencode, opencode as defaultOpencode } from 'ai-sdk-provider-opencode-sdk'
import { BaseLLMProvider } from './baseLLMProvider.js'
import logger from '../utils/logger.js'

/**
 * OpenCode LLM Provider（Sprint 20 / S20-1）
 *
 * 通过 Vercel AI SDK + `ai-sdk-provider-opencode-sdk` 调用本机 OpenCode 2.x 服务。
 * - 多供应商 key 切换口子：provider/model 由配置决定；后续可替换为官方 provider
 *   （OpenAI/Anthropic/…）或 OpenAI 兼容 provider。
 * - 认证：baseUrl + password（Basic `opencode:<password>`）或本地服务发现（service.json）。
 *
 * 注意：OpenCode v2 无服务端结构化输出，JSON 需 prompt 约束 + 客户端校验
 * （BaseLLMProvider.generateJSON 会解析 JSON；失败向上抛）。
 */
export class OpencodeLLMProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config)
    this.name = 'opencode'
    // 模型解析优先级：显式解析出的 opencode 模型（含 "/"，来自用户/项目偏好）
    //   > OPENCODE_MODEL 配置 > 默认。
    // 注意：全局 LLM_MODEL（如 gpt-4o-mini）不含 "/"，不应覆盖 opencode 模型。
    const resolved = typeof config.model === 'string' && config.model.includes('/') ? config.model : ''
    this.model =
      resolved || config.opencodeModel || process.env.OPENCODE_MODEL || 'opencode/big-pickle'
    this.baseUrl = config.opencodeBaseUrl || process.env.OPENCODE_BASE_URL || ''
    this.password = config.opencodePassword || process.env.OPENCODE_PASSWORD || ''
    this.timeout = config.timeout || 120000
    this._provider = null
  }

  _getProvider() {
    if (this._provider) return this._provider
    if (this.baseUrl) {
      const headers = {}
      if (this.password) {
        headers.Authorization =
          'Basic ' + Buffer.from(`opencode:${this.password}`).toString('base64')
      }
      this._provider = createOpencode({ baseUrl: this.baseUrl, clientOptions: { headers } })
      logger.info(`OpenCode provider: baseUrl=${this.baseUrl}`)
    } else {
      // 零配置：使用本地已注册的 OpenCode 2.x 服务（service.json 服务发现）
      this._provider = defaultOpencode
      logger.info('OpenCode provider: 使用本地服务发现')
    }
    return this._provider
  }

  async generate(params = {}) {
    const provider = this._getProvider()
    // 每次调用用新会话（无状态、避免会话复用变慢/串话）
    const model = provider(this.model, { createNewSession: true })
    // OpenCode 不支持 temperature / maxTokens（服务端管理），不传以避免告警
    const result = await generateText({
      model,
      system: params.systemPrompt,
      prompt: params.userPrompt,
      abortSignal: AbortSignal.timeout(this.timeout),
    })
    return { content: result.text, usage: result.usage }
  }
}

export default OpencodeLLMProvider
