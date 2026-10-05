import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { Character } from '../models/character.js'
import { v4 as uuidv4 } from 'uuid'
import logger from '../utils/logger.js'

const SYSTEM_PROMPT = `你是一位专业的电影编剧和分镜师。根据用户的一句话想法，生成完整的分镜脚本。

输出必须是严格的 JSON 格式，包含以下字段：
{
  "synopsis": "故事梗概，100字以内",
  "characters": [
    {
      "name": "角色名称",
      "description": "外貌描述（年龄、体型、发型、服装、显著特征），用于AI视频生成的角色锁定",
      "personality": "性格关键词"
    }
  ],
  "shots": [
    {
      "index": 0,
      "shotType": "close-up | medium | wide | extreme-wide",
      "description": "画面描述，具体到场景、动作、光影，适合作为AI视频生成的prompt",
      "dialogue": "角色台词，无则为空字符串",
      "narration": "旁白文本，无则为空字符串",
      "duration": 5,
      "cameraMovement": "static | slow_push_in | pull_back | pan_left | pan_right | handheld"
    }
  ]
}

规则：
- 分镜数量根据目标时长计算，每镜约5秒
- 角色外貌描述要足够具体，便于AI保持一致性
- 画面描述要视觉化，避免抽象概念
- 台词和旁白不要同时出现在同一镜头（除非必要）
- 整体叙事要有起承转合`

export class ScriptService {
  constructor() {
    this.llmProvider = getLLMProvider()
  }

  /**
   * 从一句话生成完整分镜脚本
   */
  async generateScript({ idea, targetDuration = 60, style = '', platform = 'landscape' }) {
    try {
      if (!idea || idea.trim().length === 0) {
        throw new Error('Idea is required')
      }

      const shotCount = Math.ceil(targetDuration / 5)
      const platformHint = platform === 'portrait' ? '竖屏9:16构图' : '横屏16:9电影构图'
      const styleHint = style ? `，风格：${style}` : ''

      const userPrompt = `核心想法：${idea}
目标时长：${targetDuration}秒（约${shotCount}个镜头）
画面比例：${platformHint}${styleHint}

请生成完整分镜脚本。`

      logger.info(`Generating script for: ${idea.slice(0, 50)}...`)
      const result = await this.llmProvider.generateJSON({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        options: { temperature: 0.8, maxTokens: 3000 },
      })

      const script = this.validateAndNormalize(result.data, shotCount)
      logger.info(`Script generated: ${script.shots.length} shots, ${script.characters.length} characters`)
      return script
    } catch (error) {
      logger.error('Script generation failed:', error.message)
      throw new Error(`剧本生成失败：${error.message}`)
    }
  }

  /**
   * 基于反馈修改剧本
   */
  async reviseScript({ script, feedback }) {
    try {
      const userPrompt = `当前剧本：
${JSON.stringify(script, null, 2)}

用户修改意见：${feedback}

请根据修改意见生成更新后的剧本，保持 JSON 格式不变。`

      const result = await this.llmProvider.generateJSON({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        options: { temperature: 0.7 },
      })

      return this.validateAndNormalize(result.data, script.shots?.length || 8)
    } catch (error) {
      logger.error('Script revision failed:', error.message)
      throw new Error(`剧本修改失败：${error.message}`)
    }
  }

  /**
   * R22: 剧本改编 — 基于已有小说/IP 文本扩写为分镜脚本（对标 LibTV「剧本原创与改编」）
   * @param {Object} params
   * @param {string} params.sourceText - 原文片段（小说/剧本/IP 梗概）
   * @param {'short_drama'|'comic'|'ad'|'anime'} params.adaptationType - 改编方向
   * @param {number} params.targetDuration
   * @param {string} params.style
   * @param {'landscape'|'portrait'} params.platform
   * @param {string} params.focus - 保留/突出的情节或人物
   */
  async adaptScript({ sourceText, adaptationType = 'short_drama', targetDuration = 60, style = '', platform = 'portrait', focus = '' }) {
    if (!sourceText || sourceText.trim().length < 10) {
      throw new Error('sourceText is required and must be at least 10 characters')
    }

    const TYPE_HINTS = {
      short_drama: '短剧节奏：强冲突、每镜有钩子、台词短促有力',
      comic: '漫剧：夸张表情、漫画式分镜、动作线清晰',
      ad: '商业广告：产品特写、情绪曲线、品牌露出',
      anime: '动漫：动势镜头、风格化背景、运镜华丽',
    }

    const shotCount = Math.ceil(targetDuration / 5)
    const platformHint = platform === 'portrait' ? '竖屏9:16构图' : '横屏16:9电影构图'
    const styleHint = style ? `，风格：${style}` : ''
    const focusHint = focus ? `，重点改编：${focus}` : ''

    const systemPrompt = `${SYSTEM_PROMPT}

【改编模式】
你现在是一位专业的改编编剧。给定一段已有文本（小说/剧本/IP 梗概），请将其改编为适合 AI 视频生成的分镜脚本。
改编方向：${TYPE_HINTS[adaptationType] || TYPE_HINTS.short_drama}
改编原则：
- 保留原文核心人物关系与关键情节，但视觉化重写为镜头语言
- 不要逐字念白原文，要把叙事转化为画面、动作、台词
- 人物外貌描述要基于原文描写并具体化
- 与原创模式输出完全相同的 JSON 结构`

    const userPrompt = `【原文】
${sourceText.slice(0, 4000)}

【改编要求】
目标时长：${targetDuration}秒（约${shotCount}个镜头）
画面比例：${platformHint}${styleHint}${focusHint}
请输出改编后的完整分镜脚本 JSON。`

    logger.info(`Adapting script: source=${sourceText.length} chars, type=${adaptationType}`)

    const result = await this.llmProvider.generateJSON({
      systemPrompt,
      userPrompt,
      options: { temperature: 0.7, maxTokens: 3000 },
    })

    const script = this.validateAndNormalize(result.data, shotCount)
    script.sourceType = 'adaptation'
    script.adaptationType = adaptationType
    script.sourceDigest = sourceText.slice(0, 200)
    logger.info(`Adapted script: ${script.shots.length} shots, ${script.characters.length} characters`)
    return script
  }

  /**
   * 从剧本角色创建 Character 模型实例
   */
  createCharactersFromScript(scriptCharacters, projectId) {
    return scriptCharacters.map((c) => {
      return new Character({
        name: c.name,
        description: c.description,
        projectId,
      })
    })
  }

  /**
   * 校验和规范化 LLM 输出
   */
  validateAndNormalize(data, expectedShotCount) {
    const script = {
      synopsis: data.synopsis || '',
      characters: Array.isArray(data.characters) ? data.characters : [],
      shots: Array.isArray(data.shots) ? data.shots : [],
    }

    // 规范化每个分镜（补充唯一 id）
    script.shots = script.shots.map((shot, index) => ({
      id: shot.id || uuidv4(),
      index: shot.index ?? index,
      shotType: shot.shotType || 'medium',
      description: shot.description || '',
      dialogue: shot.dialogue || '',
      narration: shot.narration || '',
      duration: shot.duration || 5,
      cameraMovement: shot.cameraMovement || 'static',
      characterIds: shot.characterIds || [],
      sceneId: shot.sceneId || null,
      videoUrl: null,
      status: 'pending',
      locked: false,
      versions: [],
      characterActions: shot.characterActions || {},
    }))

    // 规范化角色
    script.characters = script.characters.map((c, index) => ({
      id: c.id || uuidv4(),
      name: c.name || `角色${index + 1}`,
      description: c.description || '',
      personality: c.personality || '',
    }))

    return script
  }
}

export const scriptService = new ScriptService()
export default scriptService
