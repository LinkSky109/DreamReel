import dotenv from 'dotenv'

dotenv.config()

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  video: {
    provider: process.env.VIDEO_PROVIDER || 'mock',
    runwayApiKey: process.env.RUNWAY_API_KEY || '',
    pikaApiKey: process.env.PIKA_API_KEY || '',
    // R20: 国产模型矩阵（对标 LibTV）
    seedanceApiKey: process.env.SEEDANCE_API_KEY || '',
    seedanceBaseUrl: process.env.SEEDANCE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    seedanceModel: process.env.SEEDANCE_MODEL || 'seedance-2.5',
    minimaxApiKey: process.env.MINIMAX_API_KEY || '',
    minimaxGroupId: process.env.MINIMAX_GROUP_ID || '',
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1',
    minimaxModel: process.env.MINIMAX_MODEL || 'video-01',
    wanApiKey: process.env.WAN_API_KEY || '',
    wanBaseUrl: process.env.WAN_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
    wanModel: process.env.WAN_MODEL || 'wanx2.1-t2v-plus',
    maxConcurrent: parseInt(process.env.VIDEO_MAX_CONCURRENT, 10) || 3,
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'mock',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL || '',
    // OpenCode（开发阶段 LLM 来源）：本地 OpenCode 2.x 服务
    opencodeModel: process.env.OPENCODE_MODEL || 'opencode/deepseek-v4.1-flash-free',
    opencodeBaseUrl: process.env.OPENCODE_BASE_URL || '',
    opencodePassword: process.env.OPENCODE_PASSWORD || '',
    // DeepSeek 官方 API（OpenAI 兼容）：https://api-docs.deepseek.com/zh-cn/
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    // 单次 LLM 调用超时（毫秒）。角色/世界观抽取为一次性长任务（确认后不改），
    // 默认放宽到 10 分钟。
    timeout: parseInt(process.env.LLM_TIMEOUT_MS || '', 10) || 600000,
  },

  tts: {
    provider: process.env.TTS_PROVIDER || 'mock',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4Tlv',
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1',
    // 火山引擎豆包语音 TTS（大模型语音合成 2.0）
    volcTtsApiKey: process.env.VOLC_TTS_API_KEY || '',
    volcTtsBaseUrl: process.env.VOLC_TTS_BASE_URL || 'https://openspeech.bytedance.com',
    volcTtsResourceId: process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0',
    volcTtsSpeaker: process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts',
    volcTtsFormat: process.env.VOLC_TTS_FORMAT || 'mp3',
  },

  image: {
    provider: process.env.IMAGE_PROVIDER || 'mock',
    apiKey: process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_IMAGE_BASE_URL || '',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    // 显式 size 覆盖（如火山方舟 Agent Plan 用 "2K"/"1K"；为空则按 aspectRatio 映射像素尺寸）
    size: process.env.OPENAI_IMAGE_SIZE || '',
  },

  character: {
    consistencyThreshold: parseFloat(process.env.CHARACTER_CONSISTENCY_THRESHOLD) || 0.65,
  },

  storage: {
    path: process.env.STORAGE_PATH || './storage',
  },

  quota: {
    free: {
      videoGenerationsPerDay: 5,
      imageGenerationsPerDay: 10,
      maxDurationSeconds: 5,
      maxResolution: '720p',
      maxCharacters: 3,
      dubbingMinutesPerMonth: 10,
    },
  },

  subscription: {
    plans: {
      free: {
        id: 'free',
        name: '免费版',
        price: 0,
        priceMonthly: 0,
        priceYearly: 0,
        features: {
          videoGenerationsPerDay: 5,
          imageGenerationsPerDay: 10,
          maxDurationSeconds: 5,
          maxResolution: '720p',
          maxCharacters: 3,
          dubbingMinutesPerMonth: 10,
          maxProjects: 3,
          exportWatermark: true,
          priorityQueue: false,
          collaboration: false,
        },
      },
      basic: {
        id: 'basic',
        name: '基础版',
        price: 29,
        priceMonthly: 29,
        priceYearly: 290,
        features: {
          videoGenerationsPerDay: 50,
          imageGenerationsPerDay: 50,
          maxDurationSeconds: 10,
          maxResolution: '1080p',
          maxCharacters: 5,
          dubbingMinutesPerMonth: 60,
          maxProjects: 20,
          exportWatermark: false,
          priorityQueue: false,
          collaboration: true,
        },
      },
      pro: {
        id: 'pro',
        name: '专业版',
        price: 99,
        priceMonthly: 99,
        priceYearly: 990,
        features: {
          videoGenerationsPerDay: 200,
          imageGenerationsPerDay: 200,
          maxDurationSeconds: 15,
          maxResolution: '4k',
          maxCharacters: 10,
          dubbingMinutesPerMonth: 300,
          maxProjects: 100,
          exportWatermark: false,
          priorityQueue: true,
          collaboration: true,
        },
      },
      enterprise: {
        id: 'enterprise',
        name: '企业版',
        price: 499,
        priceMonthly: 499,
        priceYearly: 4990,
        features: {
          videoGenerationsPerDay: 1000,
          imageGenerationsPerDay: 1000,
          maxDurationSeconds: 30,
          maxResolution: '4k',
          maxCharacters: 50,
          dubbingMinutesPerMonth: 2000,
          maxProjects: -1, // 无限
          exportWatermark: false,
          priorityQueue: true,
          collaboration: true,
        },
      },
    },
  },
}

export default config
export { config }
