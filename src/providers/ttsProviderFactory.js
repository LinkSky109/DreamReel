import { BaseTTSProvider } from './baseTTSProvider.js'
import { MockTTSProvider } from './mockTTSProvider.js'
import { ElevenLabsTTSProvider } from './elevenLabsTTSProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const PROVIDER_MAP = {
  mock: MockTTSProvider,
  elevenlabs: ElevenLabsTTSProvider,
}

let activeProvider = null

export function getTTSProvider() {
  if (activeProvider) return activeProvider

  const providerName = config.tts.provider
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    logger.warn(`Unknown TTS provider: ${providerName}, falling back to mock`)
    activeProvider = new MockTTSProvider(config.tts)
  } else {
    activeProvider = new ProviderClass(config.tts)
  }

  logger.info(`TTS provider initialized: ${activeProvider.name}`)
  return activeProvider
}

export function resetTTSProvider() {
  activeProvider = null
}

export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

export default getTTSProvider
