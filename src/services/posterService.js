import { getLLMProvider } from '../providers/llmProviderFactory.js'
import logger from '../utils/logger.js'

/**
 * R16：AI 海报与封面生成服务
 * 基于项目剧本、镜头自动生成海报文案与版式配置
 */

const POSTER_FORMATS = [
  { id: 'portrait', name: '竖版海报', width: 1080, height: 1920, ratio: '9:16' },
  { id: 'landscape', name: '横版封面', width: 1920, height: 1080, ratio: '16:9' },
  { id: 'square', name: '方形社媒', width: 1080, height: 1080, ratio: '1:1' },
]

const POSTER_STYLES = [
  { id: 'cinematic', name: '电影质感', accent: '#D4AF37', overlay: 'linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.85))' },
  { id: 'minimal', name: '极简留白', accent: '#111111', overlay: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.5))' },
  { id: 'bold', name: '大胆撞色', accent: '#FF3B5C', overlay: 'linear-gradient(135deg, rgba(255,59,92,0.35), rgba(20,20,40,0.8))' },
  { id: 'noir', name: '黑色电影', accent: '#C9C9C9', overlay: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.92))' },
]

export class PosterService {
  getFormats() {
    return POSTER_FORMATS
  }

  getStyles() {
    return POSTER_STYLES
  }

  /**
   * 生成海报
   * @param {Object} params
   * @param {Object} params.project - 项目对象
   * @param {string} params.format - 版式 id
   * @param {string} params.style - 风格 id
   */
  async generatePoster({ project, format = 'portrait', style = 'cinematic' }) {
    try {
      const fmt = POSTER_FORMATS.find((f) => f.id === format) || POSTER_FORMATS[0]
      const pst = POSTER_STYLES.find((s) => s.id === style) || POSTER_STYLES[0]

      const synopsis = project.script?.synopsis || project.description || project.name
      const shotDescriptions = (project.shots || []).map((s) => s.description).filter(Boolean)

      // 尝试 LLM 生成文案，失败则用模板兜底
      let copy = null
      try {
        const llm = getLLMProvider()
        const result = await llm.generateJSON({
          systemPrompt: '你是专业电影海报文案，输出 JSON。',
          userPrompt: `为短片《${project.name}》生成海报文案，简介：${synopsis}。
输出 JSON：{"tagline":"10字内主标语","subline":"20字内副标语","credits":"制作信息一行"}`,
          options: { temperature: 0.8, maxTokens: 300 },
        })
        copy = result.data
      } catch (e) {
        logger.debug(`LLM poster copy unavailable, using template: ${e.message}`)
      }

      if (!copy || !copy.tagline) {
        copy = {
          tagline: this._buildTagline(project.name),
          subline: this._truncate(synopsis, 28),
          credits: `DreamReel 出品 · ${new Date().getFullYear()}`,
        }
      }

      // 选取主视觉镜头（第一个已生成或第一个镜头）
      const heroShot = (project.shots || []).find((s) => s.videoUrl) || project.shots?.[0] || null

      const poster = {
        id: `poster-${Date.now()}`,
        projectId: project.id,
        format: fmt,
        style: { ...pst },
        title: project.name,
        tagline: copy.tagline,
        subline: copy.subline,
        credits: copy.credits,
        heroShotIndex: heroShot ? heroShot.index : null,
        heroImageUrl: heroShot?.videoUrl || null,
        layout: this._buildLayout(fmt, pst),
        createdAt: new Date().toISOString(),
      }

      logger.info(`Poster generated for project ${project.id}: ${fmt.name}/${pst.name}`)
      return poster
    } catch (error) {
      logger.error('Poster generation failed:', error.message)
      throw new Error(`海报生成失败：${error.message}`)
    }
  }

  _buildLayout(fmt, pst) {
    return {
      width: fmt.width,
      height: fmt.height,
      background: pst.overlay,
      accentColor: pst.accent,
      titlePosition: fmt.id === 'square' ? 'center' : 'bottom',
    }
  }

  _buildTagline(name) {
    const templates = ['一场无法醒来的梦', '每一帧，都是想象', '让故事被看见', '梦境，由此展开']
    const seed = (name || '').length % templates.length
    return templates[seed]
  }

  _truncate(text, n) {
    const t = (text || '').trim()
    return t.length > n ? `${t.slice(0, n)}…` : t
  }
}

export const posterService = new PosterService()
export default posterService
