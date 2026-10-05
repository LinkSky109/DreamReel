import { describe, it, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { videoService } from '../src/services/videoService.js'
import { ProjectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { Character } from '../src/models/character.js'

describe('R26 造型 prompt 注入视频生成', () => {
  let originalProvider
  let originalPoll
  const captured = {}

  beforeEach(() => {
    captured.prompt = undefined
    originalProvider = videoService.provider
    originalPoll = videoService.pollTaskStatus
    // Stub provider：捕获发给 provider 的最终 prompt，不真实生成视频
    videoService.provider = {
      name: 'stub',
      supportsReferenceImages: () => true,
      generateVideo: async (params) => {
        captured.prompt = params.prompt
        return { taskId: 'stub-task' }
      },
    }
    // 同步收尾，避免轮询
    videoService.pollTaskStatus = async (taskId) => {
      const task = videoService.activeTasks.get(taskId)
      if (task) {
        task.resolve({ videoUrl: 'mock://done.mp4', status: 'completed', consistencyScore: 0.8 })
        videoService.activeTasks.delete(taskId)
      }
    }
  })

  afterEach(() => {
    videoService.provider = originalProvider
    videoService.pollTaskStatus = originalPoll
    videoService.activeTasks.clear()
  })

  it('镜头关联角色有造型信息时，发给 provider 的 prompt 含造型片段', async () => {
    const character = new Character({
      id: 'c1',
      name: '阿琳',
      description: '年轻女性主角',
      wardrobe: '米色风衣+白衬衫',
      makeup: '素颜感淡眉裸色唇',
      styling: '通勤干练',
    })
    const project = {
      id: 'p1',
      characters: [character],
      shots: [{ id: 's1', characterIds: ['c1'] }],
    }

    await videoService.generateShot({
      projectId: 'p1',
      shotId: 's1',
      prompt: '阿琳走在清晨的街道上',
      project,
    })

    assert.ok(captured.prompt, '应捕获到 provider 收到的 prompt')
    assert.ok(captured.prompt.includes('角色造型'), 'prompt 应包含角色造型段落')
    assert.ok(captured.prompt.includes('米色风衣'), 'prompt 应包含服装信息')
    assert.ok(captured.prompt.includes('素颜感'), 'prompt 应包含妆容信息')
    assert.ok(captured.prompt.includes('通勤干练'), 'prompt 应包含整体造型风格')
    assert.ok(captured.prompt.includes('阿琳走在清晨的街道上'), 'prompt 应保留原始描述')
  })

  it('镜头关联角色无造型信息时，prompt 不增加造型内容且不报错', async () => {
    const character = new Character({
      id: 'c1',
      name: '阿琳',
      description: '年轻女性主角',
      // 无 wardrobe/makeup/styling
    })
    const project = {
      id: 'p1',
      characters: [character],
      shots: [{ id: 's1', characterIds: ['c1'] }],
    }

    await videoService.generateShot({
      projectId: 'p1',
      shotId: 's1',
      prompt: '阿琳走在清晨的街道上',
      project,
    })

    assert.ok(captured.prompt)
    assert.ok(!captured.prompt.includes('角色造型'), '无造型时不应注入造型段落')
    assert.ok(captured.prompt.includes('阿琳走在清晨的街道上'), '应保持原行为')
  })

  it('兼容普通 JSON 对象角色（无 buildStylingPrompt 方法）时仍能拼造型片段', async () => {
    const project = {
      id: 'p1',
      characters: [
        {
          id: 'c2',
          name: '路人甲',
          description: '群演',
          wardrobe: '黑色夹克',
          makeup: '',
          styling: '',
          isLocked: true,
        },
      ],
      shots: [{ id: 's1', characterIds: ['c2'] }],
    }

    await videoService.generateShot({
      projectId: 'p1',
      shotId: 's1',
      prompt: '街道全景',
      project,
    })

    assert.ok(captured.prompt.includes('角色造型'))
    assert.ok(captured.prompt.includes('黑色夹克'))
  })

  it('镜头无 characterIds 时不注入造型', async () => {
    const project = {
      id: 'p1',
      characters: [
        { id: 'c1', name: '阿琳', description: '主角', wardrobe: '米色风衣', isLocked: true },
      ],
      shots: [{ id: 's1', characterIds: [] }],
    }

    await videoService.generateShot({
      projectId: 'p1',
      shotId: 's1',
      prompt: '空镜街道',
      project,
    })

    assert.ok(captured.prompt)
    assert.ok(!captured.prompt.includes('角色造型'))
  })
})

describe('R26 hydrateProject 造型字段持久化', () => {
  let testProjectId
  let testCharId

  after(async () => {
    // 清理测试项目
    if (testProjectId) {
      try {
        await storageService.deleteProject(testProjectId)
        storageService._flush()
      } catch {
        // ignore
      }
    }
  })

  it('服务重启（重新 hydrate）后角色造型字段不丢失', async () => {
    const svc = new ProjectService()
    const project = await svc.createProject({ name: '造型持久化测试', userId: 'r26-test' })
    testProjectId = project.id

    const character = new Character({
      name: '阿琳',
      description: '主角',
      wardrobe: '米色风衣+白衬衫',
      makeup: '素颜感',
      styling: '通勤干练',
    })
    testCharId = character.id

    await svc.updateProject(project.id, { characters: [character.toJSON()] })
    // 等待防抖落盘并立即 flush
    await new Promise((r) => setTimeout(r, 200))
    storageService._flush()

    // 模拟服务重启：用全新实例重新从存储 hydrate
    const restarted = new ProjectService()
    const restored = restarted.projects.get(project.id)
    assert.ok(restored, '重启后项目应被加载')

    const restoredChar = restored.characters.find((c) => c.id === testCharId)
    assert.ok(restoredChar, '重启后角色应被还原')
    assert.equal(restoredChar.wardrobe, '米色风衣+白衬衫')
    assert.equal(restoredChar.makeup, '素颜感')
    assert.equal(restoredChar.styling, '通勤干练')
    // 还原后应为 Character 实例，可调用 buildStylingPrompt
    assert.equal(typeof restoredChar.buildStylingPrompt, 'function')
    assert.ok(restoredChar.buildStylingPrompt().includes('服装:米色风衣+白衬衫'))
  })
})
