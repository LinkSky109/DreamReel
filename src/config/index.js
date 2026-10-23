import path from 'path'
import dotenv from 'dotenv'
import { resolveAuthEnforce, resolveAllowAnonymous } from './authEnforce.js'

dotenv.config()

const storagePath = process.env.STORAGE_PATH || './storage'

const splitList = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // ---- 部署与架构开关（Phase 0/1）----
  // 后端是否托管前端静态文件；前后端分离部署时设为 false
  serveStatic: process.env.SERVE_STATIC !== 'false',
  // 前端独立构建产物目录（相对仓库根）
  webDist: process.env.WEB_DIST || 'web/dist',
  // CORS 白名单，逗号分隔；留空时开发环境放开，生产环境只允许同源
  corsOrigins: splitList(process.env.CORS_ORIGINS),
  // 数据驱动：json（当前）| postgres | dual
  db: {
    driver: process.env.DB_DRIVER || 'json',
    url: process.env.DATABASE_URL || '',
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },
  // legacy | session
  authMode: process.env.AUTH_MODE || 'legacy',
  auth: {
    // 强制登录：生产默认开启，开发/测试默认关闭；REQUIRE_AUTH 显式覆盖
    enforce: resolveAuthEnforce(),
    // 匿名使用 default 身份：生产默认关闭，开发/测试默认开启；ALLOW_ANONYMOUS 显式覆盖
    allowAnonymous: resolveAllowAnonymous(),
  },
  // R3-T3.5：视频长任务
  videoJobs: {
    workerEnabled: process.env.VIDEO_JOB_WORKER_ENABLED !== 'false',
    intervalMs: parseInt(process.env.VIDEO_JOB_WORKER_INTERVAL_MS, 10) || 1000,
    leaseMs: parseInt(process.env.VIDEO_JOB_LEASE_MS, 10) || 60_000,
    maxAttempts: parseInt(process.env.VIDEO_JOB_MAX_ATTEMPTS, 10) || 3,
  },
  // single | organization
  tenancyMode: process.env.TENANCY_MODE || 'single',
  // 反向代理层数；Nginx 后置为 1，直接暴露时为 false
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  // 限流：默认仅生产开启，测试/本地通过 RATE_LIMIT_ENABLED=true 显式打开
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true' || process.env.NODE_ENV === 'production',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 600,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 30,
  },
  idempotency: {
    ttlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS, 10) || 24 * 60 * 60 * 1000,
  },
  audit: {
    enabled: process.env.AUDIT_ENABLED !== 'false',
  },
  // 小说域固定使用 PostgreSQL（无 legacy/dual 写模式）
  novels: {
    orgId: process.env.DEFAULT_ORG_ID || 'default',
  },


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
    // 视频任务轮询：默认 30 分钟窗口（自托管 ComfyUI 长片可能远超旧 120s 上限）
    pollMaxMs: parseInt(process.env.VIDEO_POLL_MAX_MS, 10) || 1800000,
    pollIntervalMs: parseInt(process.env.VIDEO_POLL_INTERVAL_MS, 10) || 1000,
    // 执行级回退（仅提交阶段；提交成功后由 activeTasks 固定 provider 轮询）
    fallbackProviders: (process.env.VIDEO_FALLBACK_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // 自托管 ComfyUI（另一台机器，内网直连；默认无鉴权）
    comfyui: {
      baseUrl: process.env.COMFYUI_BASE_URL || '',
      apiToken: process.env.COMFYUI_API_TOKEN || '',
      allowedHosts: (process.env.COMFYUI_ALLOWED_HOSTS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      maxConcurrent: parseInt(process.env.COMFYUI_MAX_CONCURRENT, 10) || 1,
      pollIntervalMs: parseInt(process.env.COMFYUI_POLL_INTERVAL_MS, 10) || 3000,
      maxPollMs: parseInt(process.env.COMFYUI_MAX_POLL_MS, 10) || 1800000,
      submitTimeoutMs: parseInt(process.env.COMFYUI_SUBMIT_TIMEOUT_MS, 10) || 30000,
      downloadMaxBytes: parseInt(process.env.COMFYUI_DOWNLOAD_MAX_BYTES, 10) || 268435456,
      workflow: process.env.COMFYUI_WORKFLOW || '',
      model: process.env.COMFYUI_MODEL || 'wan22-ti2v',
      defaultWidth: parseInt(process.env.COMFYUI_WIDTH, 10) || 832,
      defaultHeight: parseInt(process.env.COMFYUI_HEIGHT, 10) || 480,
      defaultLength: parseInt(process.env.COMFYUI_LENGTH, 10) || 49,
      defaultSteps: parseInt(process.env.COMFYUI_STEPS, 10) || 20,
      defaultFps: parseInt(process.env.COMFYUI_FPS, 10) || 16,
    },
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
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    // LiteLLM 网关（统一多供应商/套餐端点）：LLM_PROVIDER=litellm 时生效
    litellmBaseUrl: process.env.LITELLM_BASE_URL || '',
    litellmApiKey: process.env.LITELLM_API_KEY || process.env.LITELLM_MASTER_KEY || '',
    litellmModel: process.env.LITELLM_MODEL || 'deepseek-flash',
    // 执行级回退：主 provider 失败时按顺序切换（逗号分隔的 provider id）
    fallbackProviders: (process.env.LLM_FALLBACK_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // 单次尝试软超时（毫秒）：防主 provider 挂起拖住回退；0 = 不启用
    attemptTimeoutMs: parseInt(process.env.LLM_ATTEMPT_TIMEOUT_MS, 10) || 0,
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
    // 执行级回退
    fallbackProviders: (process.env.TTS_FALLBACK_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    attemptTimeoutMs: parseInt(process.env.TTS_ATTEMPT_TIMEOUT_MS, 10) || 0,
  },

  // 自建音色（声音复刻 / 音色设计）——需「语音技术控制台 API Key」，与 Agent Plan key 不同
  volcVoice: {
    apiKey: process.env.VOLC_VOICE_API_KEY || process.env.VOLC_TTS_API_KEY || '',
    baseUrl: process.env.VOLC_TTS_BASE_URL || 'https://openspeech.bytedance.com',
    clonePath: process.env.VOLC_VOICE_CLONE_PATH || '/api/v3/tts/voice_clone',
    designPath: process.env.VOLC_VOICE_DESIGN_PATH || '/api/v3/tts/voice_design',
    cloneResourceId: process.env.VOLC_VOICE_CLONE_RESOURCE_ID || 'seed-icl-2.0',
    timeoutMs: parseInt(process.env.VOLC_VOICE_TIMEOUT_MS, 10) || 120000,
  },

  image: {
    provider: process.env.IMAGE_PROVIDER || 'mock',
    apiKey: process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_IMAGE_BASE_URL || '',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    // 显式 size 覆盖（如火山方舟 Agent Plan 用 "2K"/"1K"；为空则按 aspectRatio 映射像素尺寸）
    size: process.env.OPENAI_IMAGE_SIZE || '',
    // 执行级回退
    fallbackProviders: (process.env.IMAGE_FALLBACK_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    attemptTimeoutMs: parseInt(process.env.IMAGE_ATTEMPT_TIMEOUT_MS, 10) || 0,
  },

  character: {
    consistencyThreshold: parseFloat(process.env.CHARACTER_CONSISTENCY_THRESHOLD) || 0.65,
  },

  storage: {
    path: storagePath,
  },

  // 剧集包同步范围：deliverables（产物+文档，默认）/ media（仅产物）/ all（全部）
  sync: {
    scope: process.env.SYNC_SCOPE || 'deliverables',
  },

  // 网盘同步（WebDAV / NAS）：群晖 / Nextcloud / 坚果云 / 阿里云盘 WebDAV 等
  webdav: {
    url: process.env.WEBDAV_URL || '',
    username: process.env.WEBDAV_USERNAME || '',
    password: process.env.WEBDAV_PASSWORD || '',
    token: process.env.WEBDAV_TOKEN || '',
    root: process.env.WEBDAV_ROOT || 'DreamReel',
    timeoutMs: parseInt(process.env.WEBDAV_TIMEOUT_MS, 10) || 60000,
    concurrency: parseInt(process.env.WEBDAV_CONCURRENCY, 10) || 3,
    retries: parseInt(process.env.WEBDAV_RETRIES, 10) || 2,
  },

  // 夸克网盘同步（私有接口，需 cookie）。真实上传默认关闭，需显式配置 QUARK_COOKIE。
  quark: {
    cookie: process.env.QUARK_COOKIE || '',
    cookieFile: process.env.QUARK_COOKIE_FILE || path.join(storagePath, '.quark-cookie'),
    // 扫码登录接口域名（可通过环境变量指向代理/测试服务器）
    authBase: process.env.QUARK_AUTH_BASE || 'https://uop.quark.cn',
    panBase: process.env.QUARK_PAN_BASE || 'https://pan.quark.cn',
    root: process.env.QUARK_ROOT || 'DreamReel',
    apiBase: process.env.QUARK_API_BASE || 'https://drive-pc.quark.cn/1/clouddrive',
    // 上传域名基址（实测夸克返回 upload_url=http://pds.quark.cn，需前置 bucket 子域）
    ossHost: process.env.QUARK_OSS_HOST || 'pds.quark.cn',
    partSize: parseInt(process.env.QUARK_PART_SIZE, 10) || 4 * 1024 * 1024,
    concurrency: parseInt(process.env.QUARK_CONCURRENCY, 10) || 1,
    timeoutMs: parseInt(process.env.QUARK_TIMEOUT_MS, 10) || 60000,
    retries: parseInt(process.env.QUARK_RETRIES, 10) || 2,
  },

  quota: {
    free: {
      videoGenerationsPerDay: 5,
      imageGenerationsPerDay: 10,
      maxDurationSeconds: 5,
      maxResolution: '720p',
      maxCharacters: 3,
      llmCallsPerDay: 20,
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
          llmCallsPerDay: 20,
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
          llmCallsPerDay: 200,
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
          llmCallsPerDay: 1000,
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
          llmCallsPerDay: 5000,
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
