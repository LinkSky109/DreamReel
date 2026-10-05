import { describe, it, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { videoService } from '../src/services/videoService.js'
import { projectService } from '../src/services/projectService.js'
import { ProjectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { directorService } from '../src/services/directorService.js'
import {
  getDirector,
  listDirectors,
  orchestrateShot,
  buildDirectorPrompt,
} from '../src/config/directorProfiles.js'

const TEST_USER = 'r29-director-test'

describe('R29 导演档案纯函数', () => {
  it('内置 5 位导演，id 固定', () => {
    const items = listDirectors()
    assert.equal(items.length, 5)
    const ids = items.map((d) => d.id).sort()
    assert.deepEqual(ids, ['bay', 'ghibli', 'kubrick', 'noir', 'wong'].sort())
  })

  it('getDirector 命中返回档案，未命中返回 undefined', () => {
    assert.ok(getDirector('kubrick'))
    assert.equal(getDirector('nosuch'), undefined)
    assert.equal(getDirector(''), undefined)
  })

  it('orchestrateShot 为不同镜头产出不同运镜、时长在 3-8、指导非空', () => {
    const director = getDirector('kubrick')
    const shots = [
      { shotType: 'close-up', dialogue: '你好' },
      { shotType: 'wide', description: '城市全景' },
      { shotType: 'medium', dialogue: '再见' },
      { shotType: 'close-up', description: '人物特写' },
    ]
    const results = shots.map((s, i) => orchestrateShot(director, s, i))
    // 运镜要有变化
    const movements = new Set(results.map((r) => r.cameraMovement))
    assert.ok(movements.size >= 2, '不同镜头运镜应有变化')
    for (const r of results) {
      assert.ok(r.duration >= 3 && r.duration <= 8, `时长应在 3-8，实际 ${r.duration}`)
      assert.ok(r.directorGuidance.length > 0, '导演指导不应为空')
      assert.ok(r.directorGuidance.includes('表演:'), '指导应含表演提示')
    }
    // kubrick 偏置 +1 → 基准 5+1=6
    assert.equal(results[0].duration, 6)
  })

  it('orchestrateShot bay 导演偏置为 -1 → 时长 4', () => {
    const director = getDirector('bay')
    const r = orchestrateShot(director, { shotType: 'medium' }, 0)
    assert.equal(r.duration, 4)
  })

  it('buildDirectorPrompt 无 shot 时退化为全局风格片段', () => {
    const director = getDirector('wong')
    const fragment = buildDirectorPrompt(director, undefined)
    assert.ok(fragment.includes('王家卫式') || fragment.includes('都市迷离'))
    assert.ok(fragment.includes('霓虹'), '全局片段应含色调')
    assert.ok(fragment.includes('配乐情绪建议'), '应标注配乐为 BGM 建议')
    assert.ok(!fragment.includes('本镜运镜'), '无 shot 不应有本镜运镜')
  })

  it('buildDirectorPrompt 有 shot 时含本镜运镜/节奏/表演/色调/配乐', () => {
    const director = getDirector('noir')
    const shot = { cameraMovement: '荷兰角倾斜构图', directorGuidance: '表演:画外独白旁白' }
    const fragment = buildDirectorPrompt(director, shot)
    assert.ok(fragment.includes('本镜运镜:荷兰角倾斜构图'))
    assert.ok(fragment.includes('表演指导:表演:画外独白旁白'))
    assert.ok(fragment.includes('黑白幽蓝'))
    assert.ok(fragment.includes('萨克斯'))
    assert.ok(fragment.includes('配乐情绪建议(BGM选曲参考，非自动生成配乐)'))
  })
})

describe('R29 导演 prompt 注入视频生成（stub provider 捕获真实 prompt）', () => {
  let originalProvider
  let originalPoll
  const captured = {}

  beforeEach(() => {
    captured.prompt = undefined
    originalProvider = videoService.provider
    originalPoll = videoService.pollTaskStatus
    videoService.provider = {
      name: 'stub',
      supportsReferenceImages: () => true,
      generateVideo: async (params) => {
        captured.prompt = params.prompt
        return { taskId: 'stub-task' }
      },
    }
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

  async function genWithDirector(directorId, shot) {
    const project = {
      id: 'p1',
      characters: [],
      directorMode: directorId ? { enabled: true, directorId } : { enabled: false },
      shots: [shot],
    }
    await videoService.generateShot({
      projectId: 'p1',
      shotId: shot.id,
      prompt: '走廊尽头站着一个黑衣男人',
      project,
    })
    return captured.prompt
  }

  it('启用 kubrick 后 prompt 含对称构图/运镜等具体文案与该镜 cameraMovement', async () => {
    const prompt = await genWithDirector('kubrick', {
      id: 's1',
      cameraMovement: '缓慢推镜',
      directorGuidance: '表演:面无表情直视镜头，节奏:冷峻克制',
    })
    assert.ok(prompt.includes('导演执导'), '应注入导演执导段')
    assert.ok(prompt.includes('对称'), 'kubrick 应含对称构图')
    assert.ok(prompt.includes('缓慢推镜'), '应含该镜 cameraMovement')
    assert.ok(prompt.includes('古典与电子极简'), '应含 kubrick 配乐情绪')
    assert.ok(prompt.includes('配乐情绪建议'), '配乐应标注为建议')
    assert.ok(prompt.includes('走廊尽头站着一个黑衣男人'), '应保留原始描述')
  })

  it('启用 wong 后 prompt 含霓虹等专属词', async () => {
    const prompt = await genWithDirector('wong', {
      id: 's1',
      cameraMovement: '抽帧慢门拖影',
      directorGuidance: '表演:暧昧停顿凝视',
    })
    assert.ok(prompt.includes('导演执导'))
    assert.ok(prompt.includes('霓虹'), 'wong 应含霓虹')
    assert.ok(prompt.includes('抽帧慢门拖影'), '应含该镜运镜')
  })

  it('不同导演文案可区分（kubrick vs wong）', async () => {
    const kubrickPrompt = await genWithDirector('kubrick', {
      id: 's1', cameraMovement: '缓慢推镜', directorGuidance: '表演:面无表情',
    })
    captured.prompt = undefined
    const wongPrompt = await genWithDirector('wong', {
      id: 's1', cameraMovement: '手持跟拍', directorGuidance: '表演:暧昧停顿',
    })
    assert.notEqual(kubrickPrompt, wongPrompt, '不同导演 prompt 应不同')
    assert.ok(kubrickPrompt.includes('对称') && !kubrickPrompt.includes('霓虹'))
    assert.ok(wongPrompt.includes('霓虹') && !wongPrompt.includes('对称'))
  })

  it('关闭导演模式后 prompt 不含「导演执导」且保留原始描述', async () => {
    const prompt = await genWithDirector(null, { id: 's1', cameraMovement: 'static' })
    assert.ok(!prompt.includes('导演执导'), '关闭后不应注入导演段')
    assert.ok(prompt.includes('走廊尽头站着一个黑衣男人'), '应保留原始描述')
  })

  it('未知 directorId 不注入导演段', async () => {
    const project = {
      id: 'p1',
      characters: [],
      directorMode: { enabled: true, directorId: 'not-a-real-director' },
      shots: [{ id: 's1', cameraMovement: 'static' }],
    }
    await videoService.generateShot({
      projectId: 'p1', shotId: 's1', prompt: '原始画面描述', project,
    })
    assert.ok(captured.prompt)
    assert.ok(!captured.prompt.includes('导演执导'), '未知导演不应注入')
    assert.ok(captured.prompt.includes('原始画面描述'))
  })

  it('musicMood 仅以配乐情绪建议出现，不声称自动生成配乐', async () => {
    const prompt = await genWithDirector('noir', {
      id: 's1', cameraMovement: '荷兰角倾斜构图', directorGuidance: '表演:画外独白',
    })
    assert.ok(prompt.includes('配乐情绪建议'))
    assert.ok(prompt.includes('非自动生成配乐'), '应明确不自动生成配乐')
    assert.ok(prompt.includes('萨克斯'), 'noir 配乐词')
  })
})

describe('R29 directorService 应用/关闭导演模式', () => {
  let testProjectId

  after(async () => {
    if (testProjectId) {
      try {
        await projectService.deleteProject(testProjectId)
        storageService._flush()
      } catch { /* ignore */ }
    }
  })

  async function makeProjectWithShots(n) {
    const project = await projectService.createProject({ name: '导演模式测试', userId: TEST_USER })
    testProjectId = project.id
    for (let i = 0; i < n; i += 1) {
      project.addShot({
        description: `镜头${i + 1}`,
        shotType: i % 2 === 0 ? 'close-up' : 'wide',
        dialogue: i === 0 ? '开场独白' : '',
      })
    }
    return project
  }

  it('applyDirector 后各 shot 运镜有变化、时长合理、指导含表演提示', async () => {
    const project = await makeProjectWithShots(4)
    const result = await directorService.applyDirector(project.id, 'kubrick')

    assert.equal(result.director.id, 'kubrick')
    assert.equal(result.guidance.length, 4)
    const movements = result.guidance.map((g) => g.cameraMovement)
    assert.ok(new Set(movements).size >= 2, '运镜应有变化')
    for (const g of result.guidance) {
      assert.ok(g.duration >= 3 && g.duration <= 8)
      assert.ok(g.directorGuidance.includes('表演:'))
    }
    // project.directorMode 已设置
    assert.equal(result.project.directorMode.enabled, true)
    assert.equal(result.project.directorMode.directorId, 'kubrick')
  })

  it('applyDirector 后 shot.cameraMovement/directorGuidance 落到模型实例', async () => {
    const project = await projectService.getProject(testProjectId)
    for (const shot of project.shots) {
      assert.ok(shot.cameraMovement && shot.cameraMovement !== 'static', 'shot 运镜应被编排')
      assert.ok(shot.directorGuidance.length > 0, 'shot 指导非空')
    }
  })

  it('未知导演 apply 抛 Director not found', async () => {
    await assert.rejects(
      () => directorService.applyDirector(testProjectId, 'ghost'),
      /Director not found/
    )
  })

  it('未知项目 apply 抛 Project not found', async () => {
    await assert.rejects(
      () => directorService.applyDirector('no-such-project', 'kubrick'),
      /Project not found/
    )
  })

  it('disableDirector 置 enabled=false 但保留 directorId 与指导', async () => {
    const json = await directorService.disableDirector(testProjectId)
    assert.equal(json.directorMode.enabled, false)
    assert.equal(json.directorMode.directorId, 'kubrick', '应保留 directorId')
    // 已生成指导仍在
    const project = await projectService.getProject(testProjectId)
    for (const shot of project.shots) {
      assert.ok(shot.directorGuidance.length > 0, '关闭后已生成指导应保留')
    }
  })

  it('重启（重新 hydrate）后 directorMode 与 shot 指导不丢', async () => {
    // 重新启用 kubrick 以确保字段落盘
    await directorService.applyDirector(testProjectId, 'kubrick')
    await new Promise((r) => setTimeout(r, 200))
    storageService._flush()

    const restarted = new ProjectService()
    const restored = restarted.projects.get(testProjectId)
    assert.ok(restored, '重启后项目应加载')
    assert.equal(restored.directorMode.enabled, true)
    assert.equal(restored.directorMode.directorId, 'kubrick')
    for (const shot of restored.shots) {
      assert.ok(shot.cameraMovement && shot.cameraMovement !== 'static')
      assert.ok(shot.directorGuidance.length > 0, '重启后导演指导不丢')
    }
  })

  it('getDirector 服务层对未知 id 抛 Director not found', () => {
    assert.throws(() => directorService.getDirector('xxx'), /Director not found/)
  })
})
