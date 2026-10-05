import { BaseImageProvider } from './baseImageProvider.js'
import path from 'path'
import fs from 'fs'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_JSON_BYTES = 30 * 1024 * 1024

/**
 * OpenAI Images 兼容 Provider。
 * 仅在配置 API Key 后由工厂选择；支持 b64_json 与 url 两种响应。
 */
export class OpenAIImageProvider extends BaseImageProvider {
  constructor(config) {
    super(config)
    this.name = 'openai'
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    this.model = config.model || 'gpt-image-1'
  }

  async generateImage(params) {
    const { prompt, aspectRatio, outputPath } = params
    const mapped = mapRequestedSize(aspectRatio)
    assertHttpUrl(this.baseUrl)
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        size: mapped.size,
        n: 1,
      }),
    })

    if (!response.ok) {
      const body = await readLimitedBody(response, MAX_JSON_BYTES).catch(() => Buffer.alloc(0))
      throw new Error(`OpenAI image generation failed (${response.status}): ${body.toString('utf-8').slice(0, 300)}`)
    }

    const data = JSON.parse((await readLimitedBody(response, MAX_JSON_BYTES)).toString('utf-8'))
    const item = data.data?.[0]
    if (!item) {
      throw new Error('OpenAI image response missing data[0]')
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64')
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`Generated image exceeds ${MAX_IMAGE_BYTES} bytes`)
      }
      fs.writeFileSync(outputPath, buffer)
    } else if (item.url) {
      assertSafeRemoteUrl(item.url)
      const imageResponse = await fetch(item.url)
      if (!imageResponse.ok) {
        throw new Error(`Failed to download generated image (${imageResponse.status})`)
      }
      const buffer = await readLimitedBody(imageResponse, MAX_IMAGE_BYTES)
      fs.writeFileSync(outputPath, buffer)
    } else {
      throw new Error('OpenAI image response missing b64_json/url')
    }

    return {
      filePath: outputPath,
      width: mapped.width,
      height: mapped.height,
      size: mapped.size,
      textRendered: true,
    }
  }

  isRealGeneration() {
    return true
  }
}

function assertHttpUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`Invalid image provider URL: ${value}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported image provider protocol: ${parsed.protocol}`)
  }
  return parsed
}

function assertSafeRemoteUrl(value) {
  const parsed = assertHttpUrl(value)
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '0.0.0.0'
  ) {
    throw new Error('Refusing to download a generated image from a private network address')
  }
  return parsed
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`)
    return buffer
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Response exceeds ${maxBytes} bytes`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

function mapRequestedSize(aspectRatio) {
  switch (aspectRatio) {
    case '9:16':
      return { size: '1024x1536', width: 1024, height: 1536 }
    case '1:1':
      return { size: '1024x1024', width: 1024, height: 1024 }
    case '4:3':
    case '16:9':
    default:
      return { size: '1536x1024', width: 1536, height: 1024 }
  }
}

export default OpenAIImageProvider
