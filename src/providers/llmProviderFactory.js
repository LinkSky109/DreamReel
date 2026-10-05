import { BaseLLMProvider } from './baseLLMProvider.js'
import { MockLLMProvider } from './mockLLMProvider.js'
import { OpenAILLMProvider } from './openaiLLMProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const PROVIDER_MAP = {
  mock: MockLLMProvider,
  openai: OpenAILLMProvider,
}

let activeProvider = null

export function getLLMProvider() {
  if (activeProvider) return activeProvider

  const providerName = config.llm.provider
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    logger.warn(`Unknown LLM provider: ${providerName}, falling back to mock`)
    activeProvider = new MockLLMProvider(config.llm)
  } else {
    activeProvider = new ProviderClass(config.llm)
  }

  logger.info(`LLM provider initialized: ${activeProvider.name}`)
  return activeProvider
}

export function resetLLMProvider() {
  activeProvider = null
}

export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

export default getLLMProvider
