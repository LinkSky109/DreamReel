import { BaseImageProvider } from './baseImageProvider.js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDER_SCRIPT = path.resolve(__dirname, '../../scripts/render_image_asset.py')

/**
 * Mock 图片 Provider
 * 优先用 Python + Pillow 渲染带文字的 PNG；
 * Pillow / 字体不可用时，用 ffmpeg color filter 产出纯色 PNG 兜底。
 * 产出的是真实文件，不是远程占位 URL。
 */
export class MockImageProvider extends BaseImageProvider {
  constructor(config) {
    super(config)
    this.name = 'mock'
  }

  async generateImage(params) {
    const { prompt, width, height, aspectRatio, style, outputPath } = params
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const payload = JSON.stringify({ prompt, width, height, aspectRatio, style, outputPath })
    try {
      const { stdout } = await execFileAsync('python3', [RENDER_SCRIPT, payload], {
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      })
      const parsed = JSON.parse(stdout.trim())
      if (!fs.existsSync(outputPath)) {
        throw new Error('Pillow renderer did not write output file')
      }
      return {
        filePath: outputPath,
        width,
        height,
        size: `${width}x${height}`,
        textRendered: parsed.textRendered === true,
      }
    } catch (error) {
      await this._renderFallbackPng(outputPath, width, height, style)
      return {
        filePath: outputPath,
        width,
        height,
        size: `${width}x${height}`,
        textRendered: false,
        warning: `Pillow renderer unavailable: ${error.message}`,
      }
    }
  }

  isRealGeneration() {
    return false
  }

  async _renderFallbackPng(outputPath, width, height, style) {
    const color = STYLE_COLORS[style] || STYLE_COLORS.cinematic
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=${width}x${height}`,
        '-frames:v',
        '1',
        outputPath,
      ],
      { timeout: 20000 }
    )
  }
}

const STYLE_COLORS = {
  cinematic: '0x1b2430',
  realistic: '0x3a4a5a',
  anime: '0xf0a6c8',
  watercolor: '0xa7c7e7',
  minimal: '0x222222',
}

export default MockImageProvider
