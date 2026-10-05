import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { aiAssistantService } from '../src/services/aiAssistantService.js'
import { projectService } from '../src/services/projectService.js'

describe('AIAssistantService', () => {
  let testProjectId

  beforeEach(async () => {
    aiAssistantService.conversations.clear()
    // 创建测试项目
    const project = await projectService.createProject({
      name: 'AI助手测试项目',
      description: '用于测试AI助手功能',
      userId: 'test-user',
    })
    testProjectId = project.id
  })

  after(async () => {
    aiAssistantService.conversations.clear()
    if (testProjectId) {
      await projectService.deleteProject(testProjectId)
    }
  })

  it('should get quick actions list', () => {
    const actions = aiAssistantService.getQuickActions()
    assert.ok(Array.isArray(actions))
    assert.ok(actions.length >= 6)
    // 验证每个操作有必要字段
    actions.forEach((a) => {
      assert.ok(a.id)
      assert.ok(a.label)
      assert.ok(a.prompt)
    })
  })

  it('should get empty conversation for new project', () => {
    const conversation = aiAssistantService.getConversation('non-existent-project')
    assert.ok(Array.isArray(conversation))
    assert.equal(conversation.length, 0)
  })

  it('should clear conversation', () => {
    aiAssistantService.conversations.set('test-project', [{ role: 'user', content: 'test' }])
    const result = aiAssistantService.clearConversation('test-project')
    assert.equal(result.success, true)
    assert.equal(aiAssistantService.getConversation('test-project').length, 0)
  })

  it('should build system prompt with project context', async () => {
    const prompt = await aiAssistantService.buildSystemPrompt(testProjectId)
    assert.ok(typeof prompt === 'string')
    assert.ok(prompt.length > 0)
    assert.ok(prompt.includes('AI 创作助手'))
    assert.ok(prompt.includes('AI助手测试项目'))
  })

  it('should build system prompt for non-existent project', async () => {
    const prompt = await aiAssistantService.buildSystemPrompt('non-existent-project')
    assert.ok(typeof prompt === 'string')
    assert.ok(prompt.length > 0)
  })

  it('should send message and get response', async () => {
    const response = await aiAssistantService.sendMessage(testProjectId, '你好，请介绍一下这个项目')
    assert.ok(response)
    assert.equal(response.role, 'assistant')
    assert.ok(typeof response.content === 'string')
    assert.ok(response.content.length > 0)
    assert.ok(response.timestamp)
  })

  it('should reject empty message', async () => {
    await assert.rejects(
      () => aiAssistantService.sendMessage(testProjectId, ''),
      /消息内容不能为空/
    )
  })

  it('should reject whitespace-only message', async () => {
    await assert.rejects(
      () => aiAssistantService.sendMessage(testProjectId, '   '),
      /消息内容不能为空/
    )
  })

  it('should store conversation history', async () => {
    await aiAssistantService.sendMessage(testProjectId, '第一个问题')
    await aiAssistantService.sendMessage(testProjectId, '第二个问题')

    const conversation = aiAssistantService.getConversation(testProjectId)
    assert.equal(conversation.length, 4) // 2 user + 2 assistant
    assert.equal(conversation[0].role, 'user')
    assert.equal(conversation[0].content, '第一个问题')
    assert.equal(conversation[1].role, 'assistant')
    assert.equal(conversation[2].role, 'user')
    assert.equal(conversation[2].content, '第二个问题')
    assert.equal(conversation[3].role, 'assistant')
  })

  it('should run quick action', async () => {
    const actions = aiAssistantService.getQuickActions()
    const firstAction = actions[0]
    const response = await aiAssistantService.runQuickAction(testProjectId, firstAction.id)
    assert.ok(response)
    assert.equal(response.role, 'assistant')
    assert.ok(response.content.length > 0)
  })

  it('should reject unknown quick action', async () => {
    await assert.rejects(
      () => aiAssistantService.runQuickAction(testProjectId, 'non-existent-action'),
      /未知的快捷操作/
    )
  })

  it('should limit conversation history to max 50 messages', async () => {
    // 发送 30 条消息（产生 60 条对话记录）
    for (let i = 0; i < 30; i++) {
      await aiAssistantService.sendMessage(testProjectId, `问题 ${i}`)
    }
    const conversation = aiAssistantService.getConversation(testProjectId)
    assert.ok(conversation.length <= 50)
  })

  it('should include userId in user messages', async () => {
    await aiAssistantService.sendMessage(testProjectId, '测试用户ID', { userId: 'user-123' })
    const conversation = aiAssistantService.getConversation(testProjectId)
    assert.equal(conversation[0].userId, 'user-123')
  })
})
