import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import request from 'supertest'
import app from '../src/server.js'
import { MockTTSProvider } from '../src/providers/mockTTSProvider.js'
import { dubbingService } from '../src/services/dubbingService.js'
import { audioService } from '../src/services/audioService.js'
import { generateBgmFile, generateSfxFile, seedAudioPack } from '../src/services/audioAssetService.js'
import { projectService, ProjectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { BGM_LIBRARY } from '../src/config/bgmLibrary.js'
import { SFX_LIBRARY } from '../src/config/sfxLibrary.js'
import config from '../src/config/index.js'
import ffmpeg from '../src/utils/ffmpeg.js'

const TEST_USER = 'default'
const STORAGE_DIR = path.resolve(config.storage.path)

describe('R33 音频生成', () => {
  let projectId

  before(async () => {
    const project = await projectService.createProject({ name: 'R33 音频测试项目', userId: TEST_USER })
    projectId = project.id
    const hydrated = await projectService.getProject(projectId)
    hydrated.addShot({ description: '雨夜街头', narration: '夜色降临，城市开始呼吸。' })
    await projectService.updateProject(projectId, {
      shots: hydrated.shots,
      audioConfig: { bgmId: 'tension-01', sfxIds: ['ambient-rain'], voiceVolume: 1, bgmVolume: 0.3, sfxVolume: 0.5 },
    })
    await seedAudioPack({ bgmIds: ['tension-01'], sfxIds: ['ambient-rain'], duration: 3 })
  })

  after(async () => {
    try {
      await projectService.deleteProject(projectId)
    } catch { /* ignore */ }
    storageService._flush()
  })

  it('Mock TTS 产出本地真实 WAV 且标记 placeholder=true', async () => {
    const provider = new MockTTSProvider(config.tts)
    const result = await provider.synthesize({ text: '测试旁白文本', language: 'zh', voice: 'zh_male_calm', speed: 1 })
    assert.equal(result.placeholder, true)
    assert.equal(result.provider, 'mock')
    assert.ok(result.audioUrl.startsWith('/storage/audio/voices/'))
    const filePath = path.join(STORAGE_DIR, result.audioUrl.replace('/storage/', ''))
    assert.ok(fs.existsSync(filePath))
    const header = fs.readFileSync(filePath).subarray(0, 4).toString('ascii')
    assert.equal(header, 'RIFF')
  })

  it('dubbingService 透传 placeholderVoices 与 provider', async () => {
    const project = await projectService.getProject(projectId)
    const result = await dubbingService.generateDubbing({ project, language: 'zh', voiceId: 'zh_male_calm' })
    assert.equal(result.success, true)
    assert.equal(result.placeholderVoices, true)
    assert.equal(result.audioTracks[0].placeholder, true)
    assert.equal(result.ttsProvider, 'mock')
  })

  it('程序化 BGM 文件真实可播放（mp3 且有非零时长）', async () => {
    const bgm = BGM_LIBRARY.find((item) => item.id === 'tension-01')
    const result = await generateBgmFile(bgm, { duration: 3 })
    assert.ok(fs.existsSync(result.filePath))
    assert.ok(fs.statSync(result.filePath).size > 1000)
    assert.equal(result.url, '/storage/audio/bgm/tension-01.mp3')
  })

  it('程序化 SFX 文件真实可播放', async () => {
    const sfx = SFX_LIBRARY.find((item) => item.id === 'ambient-rain')
    const result = await generateSfxFile(sfx)
    assert.ok(fs.existsSync(result.filePath))
    assert.ok(fs.statSync(result.filePath).size > 1000)
  })

  it('seed 后 audioService 把素材标记为 available', () => {
    const bgm = audioService.listBgm({ emotion: 'all', search: '紧张追逐' })
    assert.ok(bgm.items.find((item) => item.id === 'tension-01').available)
    const sfx = audioService.listSfx({ category: 'all', search: '雨声' })
    assert.ok(sfx.items.find((item) => item.id === 'ambient-rain').available)
  })

  it('POST /api/audio/preview 返回真实混音文件与占位音口径', async () => {
    const res = await request(app).post('/api/audio/preview').send({ projectId, language: 'zh', voiceId: 'zh_male_calm' })
    assert.equal(res.status, 200)
    assert.ok(res.body.url.startsWith('/storage/audio/previews/'))
    const filePath = path.join(STORAGE_DIR, res.body.url.replace('/storage/', ''))
    assert.ok(fs.existsSync(filePath))
    assert.ok(fs.statSync(filePath).size > 1000)
    assert.equal(res.body.placeholderVoices, true)
    assert.ok(res.body.tracks.length >= 1)
  })

  it('他人项目的音频预览返回 404', async () => {
    const other = await projectService.createProject({ name: '他人项目', userId: 'other-audio-user' })
    try {
      const res = await request(app).post('/api/audio/preview').send({ projectId: other.id })
      assert.equal(res.status, 404)
    } finally {
      await projectService.deleteProject(other.id)
    }
  })

  it('只有短旁白时，混音预听会补齐到目标时长', async () => {
    const p = await projectService.createProject({ name: '纯旁白项目', userId: TEST_USER })
    try {
      const hydrated = await projectService.getProject(p.id)
      hydrated.addShot({ description: '短镜头', narration: '你好。' })
      await projectService.updateProject(p.id, {
        shots: hydrated.shots,
        audioConfig: { bgmId: null, sfxIds: [], voiceVolume: 1, bgmVolume: 0.3, sfxVolume: 0.5 },
      })
      const project = await projectService.getProject(p.id)
      const result = await audioService.previewMix(project, { duration: 5 })
      assert.equal(result.tracks.length, 1)
      const duration = await ffmpeg.getDuration(path.join(STORAGE_DIR, result.url.replace('/storage/', '')))
      assert.ok(duration >= 4.5, `expected padded audio >=4.5s, got ${duration}`)
    } finally {
      await projectService.deleteProject(p.id)
    }
  })

  it('audioConfig 与 dialogueAssignments 重启 hydrate 后不丢', async () => {
    await projectService.updateProject(projectId, {
      audioConfig: { bgmId: 'tension-01', sfxIds: ['ambient-rain'], voiceVolume: 0.9, bgmVolume: 0.25, sfxVolume: 0.4 },
      dialogueAssignments: { 'char-x': 'zh_female_warm' },
    })
    const fresh = new ProjectService()
    const project = await fresh.getProject(projectId)
    assert.equal(project.audioConfig.bgmId, 'tension-01')
    assert.equal(project.audioConfig.voiceVolume, 0.9)
    assert.equal(project.dialogueAssignments['char-x'], 'zh_female_warm')
  })
})
