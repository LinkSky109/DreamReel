import { BaseLLMProvider } from './baseLLMProvider.js'

/**
 * Mock LLM Provider — 返回预设的结构化剧本
 */
export class MockLLMProvider extends BaseLLMProvider {
  constructor(config) {
    super(config)
    this.name = 'mock'
  }

  async generate(params) {
    // 模拟延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    const userPrompt = params.userPrompt || ''

    // 简单的 mock 剧本生成
    const mockScript = {
      synopsis: `基于「${userPrompt.slice(0, 50)}」展开的一段叙事短片，讲述主角在特殊情境下的经历与成长。`,
      characters: [
        { name: '主角', description: '年轻，神情坚定，穿着简约外套', personality: '勇敢、内敛' },
        { name: '配角', description: '温和面容，戴眼镜', personality: '智慧、引导者' },
      ],
      shots: [
        {
          index: 0,
          shotType: 'wide',
          description: '远景展示环境氛围，主角独自站在场景中央',
          dialogue: '',
          narration: '一切开始于一个寻常的瞬间。',
          duration: 5,
          cameraMovement: 'slow_push_in',
        },
        {
          index: 1,
          shotType: 'medium',
          description: '中景，主角抬头望向远方，表情从迷茫转为坚定',
          dialogue: '',
          narration: '他知道，必须做出选择。',
          duration: 5,
          cameraMovement: 'static',
        },
        {
          index: 2,
          shotType: 'close-up',
          description: '特写主角的眼睛，倒映出前方的光',
          dialogue: '「我准备好了。」',
          narration: '',
          duration: 5,
          cameraMovement: 'static',
        },
        {
          index: 3,
          shotType: 'wide',
          description: '远景，主角迈步向前，身影逐渐融入光线中',
          dialogue: '',
          narration: '故事，才刚刚开始。',
          duration: 5,
          cameraMovement: 'pull_back',
        },
      ],
    }

    return {
      content: JSON.stringify(mockScript, null, 2),
      usage: { promptTokens: 100, completionTokens: 300, totalTokens: 400 },
    }
  }
}

export default MockLLMProvider
