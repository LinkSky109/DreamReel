import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { projectService } from './projectService.js'
import logger from '../utils/logger.js'

/**
 * AI 创作助手服务
 * 提供上下文感知的 AI 对话，辅助剧本创作、镜头设计、配音优化等
 */

const SYSTEM_PROMPT_TEMPLATE = `你是 DreamReel AI 创作助手，一位专业的电影编剧和导演。
你的任务是帮助用户创作高质量的短片和视频内容。

当前项目信息：
- 项目名称：{projectName}
- 项目描述：{projectDescription}

{scriptInfo}
{charactersInfo}
{shotsInfo}

请根据以上项目上下文，用专业、有创意的方式回答用户的问题。
回答要具体、可执行，避免空泛的建议。
如果用户要求修改剧本或镜头，请给出具体的修改方案。
用中文回答。`

const QUICK_ACTIONS = [
  {
    id: 'improve_script',
    label: '✨ 改进剧本',
    prompt: '请分析当前剧本，给出具体的改进建议，包括剧情结构、角色发展、对话质量等方面。',
  },
  {
    id: 'shot_ideas',
    label: '🎬 镜头创意',
    prompt: '根据当前剧本和角色，为接下来的镜头设计提供创意建议，包括镜头语言、画面构图、转场方式等。',
  },
  {
    id: 'character_deep',
    label: '👤 角色深化',
    prompt: '请分析当前角色设定，给出深化角色的建议，包括背景故事、性格特点、角色弧光等。',
  },
  {
    id: 'dubbing_tips',
    label: '🎙️ 配音建议',
    prompt: '根据当前剧本和角色，给出配音和旁白的建议，包括语气、语速、情感表达、背景音乐风格等。',
  },
  {
    id: 'style_advice',
    label: '🎨 风格建议',
    prompt: '根据当前项目内容，推荐适合的视觉风格和导演风格，包括色调、光影、镜头运动等，并说明理由。',
  },
  {
    id: 'story_holes',
    label: '🔍 故事漏洞',
    prompt: '请仔细检查当前剧本，找出可能存在的故事漏洞、逻辑矛盾、角色行为不合理之处，并给出修复建议。',
  },
]

export class AIAssistantService {
  constructor() {
    this.conversations = new Map() // projectId -> [{role, content, timestamp}]
    this.maxHistoryPerProject = 50
  }

  /**
   * 获取快捷操作列表
   */
  getQuickActions() {
    return QUICK_ACTIONS
  }

  /**
   * 获取项目对话历史
   */
  getConversation(projectId) {
    return this.conversations.get(projectId) || []
  }

  /**
   * 清空项目对话
   */
  clearConversation(projectId) {
    this.conversations.delete(projectId)
    logger.info(`AI conversation cleared for project ${projectId}`)
    return { success: true }
  }

  /**
   * 构建系统提示词（包含项目上下文）
   */
  async buildSystemPrompt(projectId) {
    try {
      const project = await projectService.getProject(projectId)
      if (!project) {
        return SYSTEM_PROMPT_TEMPLATE
          .replace('{projectName}', '未知项目')
          .replace('{projectDescription}', '')
          .replace('{scriptInfo}', '')
          .replace('{charactersInfo}', '')
          .replace('{shotsInfo}', '')
      }

      // 剧本信息
      let scriptInfo = ''
      if (project.script && project.script.scenes && project.script.scenes.length > 0) {
        const scenesSummary = project.script.scenes
          .slice(0, 5)
          .map((s, i) => `场景${i + 1}: ${s.description || s.title || '未命名'}`)
          .join('\n')
        scriptInfo = `\n剧本信息：\n- 场景数：${project.script.scenes.length}\n${scenesSummary}\n`
        if (project.script.scenes.length > 5) {
          scriptInfo += `...（还有 ${project.script.scenes.length - 5} 个场景）\n`
        }
      }

      // 角色信息
      let charactersInfo = ''
      if (project.characters && project.characters.length > 0) {
        const charsSummary = project.characters
          .map((c) => `${c.name}: ${c.description || '暂无描述'}${c.isLocked ? '（已锁定）' : ''}`)
          .join('\n')
        charactersInfo = `\n角色信息：\n${charsSummary}\n`
      }

      // 镜头信息
      let shotsInfo = ''
      if (project.shots && project.shots.length > 0) {
        const completed = project.shots.filter((s) => s.status === 'completed').length
        const pending = project.shots.filter((s) => s.status === 'pending').length
        shotsInfo = `\n镜头信息：\n- 总镜头数：${project.shots.length}\n- 已完成：${completed}\n- 待生成：${pending}\n`
      }

      return SYSTEM_PROMPT_TEMPLATE
        .replace('{projectName}', project.name || '未命名项目')
        .replace('{projectDescription}', project.description || '暂无描述')
        .replace('{scriptInfo}', scriptInfo)
        .replace('{charactersInfo}', charactersInfo)
        .replace('{shotsInfo}', shotsInfo)
    } catch (error) {
      logger.warn(`Failed to build system prompt: ${error.message}`)
      return '你是 DreamReel AI 创作助手，帮助用户创作视频内容。用中文回答。'
    }
  }

  /**
   * 发送消息并获取 AI 回复
   */
  async sendMessage(projectId, userMessage, { userId = 'default' } = {}) {
    try {
      if (!userMessage || !userMessage.trim()) {
        throw new Error('消息内容不能为空')
      }

      const message = userMessage.trim()

      // 记录用户消息
      if (!this.conversations.has(projectId)) {
        this.conversations.set(projectId, [])
      }
      const conversation = this.conversations.get(projectId)
      conversation.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        userId,
      })

      // 构建系统提示词
      const systemPrompt = await this.buildSystemPrompt(projectId)

      // 构建对话历史（最近 10 轮）
      const recentHistory = conversation.slice(-20)
      const historyText = recentHistory
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
        .join('\n\n')

      const fullPrompt = `${historyText}\n\n用户: ${message}\n\n助手:`

      // 调用 LLM
      const llm = getLLMProvider()
      const result = await llm.generate({
        systemPrompt,
        userPrompt: fullPrompt,
        options: {
          temperature: 0.7,
          maxTokens: 2000,
        },
      })

      const aiResponse = result.content || '抱歉，我暂时无法回答这个问题。'

      // 记录 AI 回复
      conversation.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
      })

      // 限制历史长度
      if (conversation.length > this.maxHistoryPerProject) {
        conversation.splice(0, conversation.length - this.maxHistoryPerProject)
      }

      logger.info(`AI assistant responded for project ${projectId}`)

      return {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.error(`AI assistant error: ${error.message}`)
      throw new Error(`AI 助手出错: ${error.message}`)
    }
  }

  /**
   * 执行快捷操作
   */
  async runQuickAction(projectId, actionId, { userId = 'default' } = {}) {
    const action = QUICK_ACTIONS.find((a) => a.id === actionId)
    if (!action) {
      throw new Error(`未知的快捷操作: ${actionId}`)
    }
    return this.sendMessage(projectId, action.prompt, { userId })
  }
}

export const aiAssistantService = new AIAssistantService()
export default aiAssistantService
