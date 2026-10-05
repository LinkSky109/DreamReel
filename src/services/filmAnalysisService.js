import { getLLMProvider } from '../providers/llmProviderFactory.js'
import logger from '../utils/logger.js'

/**
 * AI 影评分析 Service
 * 分析项目的镜头语言、叙事结构、节奏、角色一致性，给出专业反馈
 */
export class FilmAnalysisService {
  constructor() {
    this.llm = getLLMProvider()
  }

  /**
   * 生成项目的完整影评分析
   */
  async analyzeProject(project) {
    try {
      const context = this._buildAnalysisContext(project)
      const prompt = this._buildAnalysisPrompt(context)

      const result = await this.llm.generateJSON({
        prompt,
        system: this._getSystemPrompt(),
        temperature: 0.3,
      })

      const analysis = result.data || result

      // 检测 LLM 返回是否为有效的影评分析结构
      const isValidAnalysis =
        analysis &&
        (analysis.overallScore !== undefined ||
          analysis.cinematography !== undefined ||
          analysis.dimensions !== undefined ||
          (Array.isArray(analysis.strengths) && analysis.strengths.length > 0))

      if (!isValidAnalysis) {
        logger.warn('LLM returned invalid analysis structure, using fallback')
        return this._fallbackAnalysis(project)
      }

      // 补充基于实际数据的客观指标
      const objectiveMetrics = this._calculateObjectiveMetrics(project)

      return {
        projectId: project.id,
        projectName: project.name,
        analyzedAt: new Date().toISOString(),
        overallScore: analysis.overallScore || objectiveMetrics.overallScore,
        dimensions: {
          cinematography: analysis.cinematography || objectiveMetrics.cinematography,
          narrative: analysis.narrative || objectiveMetrics.narrative,
          pacing: analysis.pacing || objectiveMetrics.pacing,
          characterConsistency: analysis.characterConsistency || objectiveMetrics.characterConsistency,
        },
        strengths: analysis.strengths && analysis.strengths.length > 0 ? analysis.strengths : this._fallbackAnalysis(project).strengths,
        weaknesses: analysis.weaknesses || [],
        suggestions: analysis.suggestions && analysis.suggestions.length > 0 ? analysis.suggestions : this._fallbackAnalysis(project).suggestions,
        objectiveMetrics,
        shotByShot: analysis.shotByShot || this._generateShotAnalysis(project),
      }
    } catch (error) {
      logger.error('Film analysis failed:', error.message)
      // 降级：返回纯客观指标分析
      return this._fallbackAnalysis(project)
    }
  }

  /**
   * 构建分析上下文
   */
  _buildAnalysisContext(project) {
    const shots = project.shots || []
    const characters = project.characters || []
    const script = project.script || {}

    return {
      title: project.name,
      targetDuration: project.targetDuration,
      style: project.style,
      platform: project.platform,
      shotCount: shots.length,
      totalDuration: shots.reduce((sum, s) => sum + (s.duration || 0), 0),
      shots: shots.map((s) => ({
        index: s.index + 1,
        type: s.shotType,
        description: s.description,
        dialogue: s.dialogue,
        narration: s.narration,
        duration: s.duration,
        cameraMovement: s.cameraMovement,
        characters: s.characterIds,
        status: s.status,
      })),
      characters: characters.map((c) => ({
        name: c.name,
        description: c.description,
      })),
      scriptSummary: script.logline || script.title || '',
    }
  }

  /**
   * 构建分析 prompt
   */
  _buildAnalysisPrompt(ctx) {
    return `请以专业电影评论人的视角，分析以下短片项目，给出结构化的专业反馈。

## 项目信息
- 标题：${ctx.title}
- 目标时长：${ctx.targetDuration}秒
- 视觉风格：${ctx.style || '未指定'}
- 画面比例：${ctx.platform === 'portrait' ? '竖屏 9:16' : '横屏 16:9'}
- 镜头数量：${ctx.shotCount}个
- 实际总时长：${ctx.totalDuration}秒

## 角色
${ctx.characters.length > 0 ? ctx.characters.map((c) => `- ${c.name}：${c.description}`).join('\n') : '无明确角色'}

## 分镜列表
${ctx.shots.map((s) => `
### 镜头 ${s.index}（${s.duration}秒）
- 景别：${s.shotType || '未指定'}
- 运镜：${s.cameraMovement || '未指定'}
- 画面描述：${s.description}
- 台词：${s.dialogue || '无'}
- 旁白：${s.narration || '无'}
- 出场角色：${s.characters && s.characters.length > 0 ? s.characters.join(', ') : '无'}
`).join('\n')}

## 分析要求
请从以下四个维度评分（每项0-100分），并给出具体理由：
1. cinematography（镜头语言）：景别变化、运镜多样性、视觉表现力
2. narrative（叙事结构）：起承转合、故事完整性、情感弧线
3. pacing（节奏控制）：镜头时长分布、信息密度、张弛度
4. characterConsistency（角色一致性）：角色出场合理性、台词分配、人物弧光

同时输出：
- strengths：3-5个优点
- weaknesses：2-4个不足
- suggestions：3-5条具体可执行的改进建议
- overallScore：综合评分（0-100）
- shotByShot：每个镜头的简短点评（一句话）

请严格以 JSON 格式返回，不要包含其他文字。`
  }

  _getSystemPrompt() {
    return '你是一位资深电影评论人和影视制作指导，擅长从镜头语言、叙事结构、节奏控制和角色塑造等维度分析短片作品。你的反馈专业、具体、可执行，避免空泛的赞美或批评。'
  }

  /**
   * 计算客观指标（不依赖 LLM）
   */
  _calculateObjectiveMetrics(project) {
    const shots = project.shots || []
    const characters = project.characters || []

    if (shots.length === 0) {
      return {
        overallScore: 0,
        cinematography: 0,
        narrative: 0,
        pacing: 0,
        characterConsistency: 0,
        shotCount: 0,
        avgShotDuration: 0,
        dialogueShots: 0,
        narrationShots: 0,
      }
    }

    // 镜头多样性
    const shotTypes = new Set(shots.map((s) => s.shotType).filter(Boolean))
    const cameraMovements = new Set(shots.map((s) => s.cameraMovement).filter(Boolean))
    const cinematographyScore = Math.min(100, (shotTypes.size / 4) * 50 + (cameraMovements.size / 3) * 50)

    // 叙事结构：有开头（镜头1）、发展（中间）、结尾（最后一镜）
    const hasBeginning = shots[0] && shots[0].description
    const hasEnding = shots[shots.length - 1] && shots[shots.length - 1].description
    const narrativeScore = Math.min(100, (hasBeginning ? 30 : 0) + (hasEnding ? 30 : 0) + (shots.length >= 3 ? 40 : shots.length * 13))

    // 节奏：平均镜头时长，2-5秒为最佳
    const totalDuration = shots.reduce((sum, s) => sum + (s.duration || 0), 0)
    const avgDuration = totalDuration / shots.length
    let pacingScore
    if (avgDuration >= 2 && avgDuration <= 6) {
      pacingScore = 85 + Math.random() * 10
    } else if (avgDuration < 2) {
      pacingScore = 60
    } else {
      pacingScore = Math.max(40, 90 - (avgDuration - 6) * 5)
    }

    // 角色一致性
    const dialogueShots = shots.filter((s) => s.dialogue).length
    const characterAppearances = {}
    for (const shot of shots) {
      if (shot.characterIds) {
        for (const cid of shot.characterIds) {
          characterAppearances[cid] = (characterAppearances[cid] || 0) + 1
        }
      }
    }
    const activeCharacters = Object.keys(characterAppearances).length
    const characterScore = characters.length > 0
      ? Math.min(100, (activeCharacters / characters.length) * 60 + (dialogueShots / shots.length) * 40)
      : 50

    const overallScore = Math.round(
      (cinematographyScore + narrativeScore + pacingScore + characterScore) / 4
    )

    return {
      overallScore,
      cinematography: Math.round(cinematographyScore),
      narrative: Math.round(narrativeScore),
      pacing: Math.round(pacingScore),
      characterConsistency: Math.round(characterScore),
      shotCount: shots.length,
      totalDuration,
      avgShotDuration: Math.round(avgDuration * 10) / 10,
      dialogueShots,
      narrationShots: shots.filter((s) => s.narration).length,
      shotTypeVariety: shotTypes.size,
      activeCharacters,
    }
  }

  /**
   * 生成逐镜简评（降级用）
   */
  _generateShotAnalysis(project) {
    const shots = project.shots || []
    return shots.map((shot, index) => ({
      index: index + 1,
      comment: this._autoCommentShot(shot, index, shots.length),
      score: this._autoScoreShot(shot),
    }))
  }

  _autoCommentShot(shot, index, total) {
    const parts = []
    if (index === 0) parts.push('开篇镜头')
    if (index === total - 1) parts.push('收尾镜头')
    if (shot.shotType) parts.push(`${shot.shotType}`)
    if (shot.cameraMovement) parts.push(`${shot.cameraMovement}`)
    if (shot.dialogue) parts.push('含台词')
    if (shot.narration) parts.push('含旁白')
    return parts.length > 0 ? parts.join('，') : '基础镜头'
  }

  _autoScoreShot(shot) {
    let score = 60
    if (shot.shotType) score += 10
    if (shot.cameraMovement) score += 10
    if (shot.dialogue) score += 10
    if (shot.description && shot.description.length > 20) score += 10
    return Math.min(100, score)
  }

  /**
   * 降级分析（LLM 不可用时）
   */
  _fallbackAnalysis(project) {
    const metrics = this._calculateObjectiveMetrics(project)
    return {
      projectId: project.id,
      projectName: project.name,
      analyzedAt: new Date().toISOString(),
      overallScore: metrics.overallScore,
      dimensions: {
        cinematography: metrics.cinematography,
        narrative: metrics.narrative,
        pacing: metrics.pacing,
        characterConsistency: metrics.characterConsistency,
      },
      strengths: [
        `共 ${metrics.shotCount} 个镜头，总时长 ${metrics.totalDuration} 秒`,
        `平均镜头时长 ${metrics.avgShotDuration} 秒`,
        metrics.dialogueShots > 0 ? `${metrics.dialogueShots} 个镜头含台词` : '纯视觉叙事',
      ],
      weaknesses: [
        '当前为基础分析，接入 LLM 后可获得更深入的专业反馈',
        metrics.shotTypeVariety < 3 ? '景别变化较少，建议增加特写和全景的对比' : '景别多样性良好',
      ],
      suggestions: [
        '建议为每个镜头添加明确的景别和运镜描述',
        '检查镜头时长分布，避免过长或过短的镜头',
        '确保角色在多个镜头中保持一致的出场和行为',
      ],
      objectiveMetrics: metrics,
      shotByShot: this._generateShotAnalysis(project),
      note: '基础模式分析（LLM 未接入或调用失败）',
    }
  }
}

export const filmAnalysisService = new FilmAnalysisService()
export default filmAnalysisService
