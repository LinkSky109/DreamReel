import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RENDER_SCRIPT = path.resolve(__dirname, '../../scripts/render_title_card.py')

/**
 * 片头标题卡渲染封装
 * 调用 scripts/render_title_card.py（Pillow）把 title/subtitle 真实绘制进 PNG。
 * 失败时抛错，由调用方决定回退策略（不得假装文字已上屏）。
 */
export const titleCard = {
  /**
   * 渲染标题卡 PNG
   * @param {Object} params
   * @param {string} params.templateId
   * @param {string} params.title
   * @param {string} [params.subtitle]
   * @param {number} [params.width]
   * @param {number} [params.height]
   * @param {string} params.outputPath - PNG 输出路径
   * @returns {Promise<Object>} { ok, outputPath }
   */
  async render({ templateId, title, subtitle = '', width = 1280, height = 720, outputPath }) {
    const payload = JSON.stringify({
      templateId,
      title,
      subtitle,
      width,
      height,
      outputPath,
    })
    try {
      const { stdout } = await execFileAsync('python3', [RENDER_SCRIPT, payload], {
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
      })
      const result = JSON.parse(stdout.trim().split('\n').pop())
      if (!result.ok) {
        throw new Error(result.error || 'render_title_card failed')
      }
      return result
    } catch (error) {
      const detail = error.stderr ? error.stderr.trim() : error.message
      throw new Error(`Title card render failed: ${detail}`)
    }
  },
}

export default titleCard
