import { getLLMProvider } from '../providers/llmProviderFactory.js'
import logger from '../utils/logger.js'

/**
 * R15：AI 预告片自动生成服务
 * 自动挑选高光镜头，生成预告片节奏（短镜头 + 悬念字幕）
 */

// 预告片悬念字幕模板
const TEASER_TITLES = [
  '在一切开始之前……',
  '真相，远比想象更近',
  '这一次，无处可逃',
  '有些信号，不该被发现',
  '故事，即将揭晓',
]

export class TrailerService {
  /**
   * 生成预告片
   * @param {Object} params
   * @param {Object} params.project
   * @param {number} params.targetDuration - 目标时长（秒），默认 20
   */
  async generateTrailer({ project, targetDuration = 20 }) {
    try {
      const shots = project.shots || []
      if (shots.length === 0) {
        return { success: false, message: '项目暂无镜头，无法生成预告片' }
      }

      // 1. 挑选高光镜头（评分）
      const scored = shots.map((shot) => ({
        shot,
        score: this._scoreShot(shot),
      }))
      scored.sort((a, b) => b.score - a.score)

      // 根据目标时长决定选取数量（预告片镜头通常 1.5-3s）
      const avgShotLen = shots.reduce((s, x) => s + (x.duration || 5), 0) / shots.length
      const trailerShotLen = Math.max(1.5, Math.min(3, avgShotLen * 0.6))
      const pickCount = Math.max(2, Math.min(shots.length, Math.round(targetDuration / trailerShotLen)))

      const picked = scored.slice(0, pickCount)
      // 恢复原始叙事顺序（保证可看性）
      picked.sort((a, b) => a.shot.index - b.shot.index)

      // 2. 尝试 LLM 生成悬念字幕，失败用模板
      let teaserText = null
      try {
        const llm = getLLMProvider()
        const result = await llm.generate({
          systemPrompt: '你是好莱坞预告片文案，输出一句中文悬念字幕，不超过15字，只输出字幕本身。',
          userPrompt: `短片《${project.name}》，简介：${project.script?.synopsis || project.name}`,
          options: { temperature: 0.9, maxTokens: 80 },
        })
        teaserText = (result.content || '').replace(/["「」\n]/g, '').trim()
      } catch (e) {
        logger.debug(`LLM teaser unavailable: ${e.message}`)
      }
      if (!teaserText || !this._isValidTeaser(teaserText)) {
        teaserText = TEASER_TITLES[(project.name || '').length % TEASER_TITLES.length]
      }

      // 3. 构建预告片序列（开头悬念字幕 + 高光短镜头 + 结尾标题卡）
      const sequence = []
      sequence.push({ type: 'title-card', text: teaserText, duration: 2.5 })
      picked.forEach(({ shot }) => {
        sequence.push({
          type: 'shot',
          sourceShotIndex: shot.index,
          shotId: shot.id,
          duration: parseFloat(trailerShotLen.toFixed(1)),
          videoUrl: shot.videoUrl || null,
        })
      })
      sequence.push({ type: 'end-card', text: project.name, duration: 3 })

      const totalDuration = sequence.reduce((s, x) => s + x.duration, 0)

      const trailer = {
        success: true,
        projectId: project.id,
        targetDuration,
        pickedShotCount: picked.length,
        teaserText,
        sequence,
        totalDuration: parseFloat(totalDuration.toFixed(1)),
        pacing: 'fast',
        createdAt: new Date().toISOString(),
      }

      logger.info(`Trailer generated for project ${project.id}: ${picked.length} shots, ${totalDuration.toFixed(1)}s`)
      return trailer
    } catch (error) {
      logger.error('Trailer generation failed:', error.message)
      throw new Error(`预告片生成失败：${error.message}`)
    }
  }

  /**
   * 校验悬念字幕有效性：长度 4-20 字，不含换行/JSON/脚本符号
   */
  _isValidTeaser(text) {
    const t = (text || '').trim()
    if (t.length < 4 || t.length > 20) return false
    if (/[\n{}[\](),:]/.test(t)) return false
    if (/(synopsis|characters|shots|index)/i.test(t)) return false
    return true
  }

  /**
   * 镜头高光评分：有对话/特写/已生成/运镜丰富的镜头优先
   */
  _scoreShot(shot) {
    let score = 0
    if (shot.videoUrl) score += 2
    if (shot.dialogue) score += 2
    const type = (shot.shotType || '')
    if (type.includes('特写') || type.includes('close')) score += 2
    if (type.includes('远景') || type.includes('wide')) score += 1
    if (shot.cameraMovement) score += 1
    if (shot.narration) score += 0.5
    // 轻微随机，避免并列
    score += Math.random() * 0.3
    return score
  }
}

export const trailerService = new TrailerService()
export default trailerService
