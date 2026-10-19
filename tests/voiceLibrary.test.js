import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { storageService } from '../src/services/storageService.js'
import {
  makeSpeakerId,
  registerVoiceAsset,
  listVoiceAssets,
  deleteVoiceAsset,
  resourceIdFor,
  isCustomVoice,
  CLONE_RESOURCE_ID,
  DESIGN_RESOURCE_ID,
} from '../src/services/voiceLibraryService.js'
import { validateSpeakerName, VoiceApiError } from '../src/services/volcVoiceApi.js'

const NOVEL = 'vl-test-novel'

describe('自建音色库 voiceLibraryService', () => {
  before(() => {
    for (const v of listVoiceAssets(NOVEL)) deleteVoiceAsset(v.speakerId)
  })
  after(() => {
    for (const v of listVoiceAssets(NOVEL)) deleteVoiceAsset(v.speakerId)
  })

  it('生成的音色代号符合火山命名规范', () => {
    const id = makeSpeakerId(NOVEL, '血瞳-少年')
    assert.match(id, /^[A-Za-z][A-Za-z0-9_-]{7,255}$/)
    assert.equal(validateSpeakerName(id), null)
  })

  it('校验拒绝官方保留前缀与非法字符', () => {
    assert.ok(validateSpeakerName('S_abc') !== null)
    assert.ok(validateSpeakerName('ab') !== null)
    assert.ok(validateSpeakerName('1abc') !== null)
  })

  it('登记 / 列出 / 删除 复刻音色，并解析 resourceId', () => {
    const speakerId = makeSpeakerId(NOVEL, 'testclone')
    const asset = registerVoiceAsset({ novelId: NOVEL, name: '测试复刻', type: 'clone', speakerId })
    assert.equal(asset.speakerId, speakerId)
    assert.equal(resourceIdFor(speakerId), CLONE_RESOURCE_ID)
    assert.equal(isCustomVoice(speakerId), true)
    assert.ok(listVoiceAssets(NOVEL).some((v) => v.speakerId === speakerId))

    deleteVoiceAsset(speakerId)
    assert.equal(storageService.getVoiceAsset(speakerId), null)
    assert.equal(resourceIdFor(speakerId), null) // 非标准前缀、且已删除 → 无映射
  })

  it('设计音色解析到设计 resourceId', () => {
    const speakerId = 'dreeldesignvoice1'
    registerVoiceAsset({ novelId: NOVEL, name: '测试设计', type: 'design', speakerId })
    assert.equal(resourceIdFor(speakerId), DESIGN_RESOURCE_ID)
    deleteVoiceAsset(speakerId)
  })

  it('预设音色不解析为自建 resourceId', () => {
    assert.equal(resourceIdFor('zh_female_vv_uranus_bigtts'), null)
    assert.equal(isCustomVoice('zh_female_vv_uranus_bigtts'), false)
  })
})

describe('volcVoiceApi 输入校验', () => {
  it('缺少 API Key 时给出可操作错误', async () => {
    const { cloneVoice } = await import('../src/services/volcVoiceApi.js')
    await assert.rejects(
      () => cloneVoice({ speakerId: 'dreelprobe1234', audioBase64: 'AAAA', format: 'mp3', apiKey: '' }),
      (e) => e instanceof VoiceApiError && /VOLC_VOICE_API_KEY/.test(e.message)
    )
  })

  it('401 转为鉴权错误', async () => {
    const { cloneVoice } = await import('../src/services/volcVoiceApi.js')
    const fetchImpl = async () => new Response(JSON.stringify({ code: 45000010, message: 'Invalid X-Api-Key' }), { status: 401 })
    await assert.rejects(
      () => cloneVoice({ speakerId: 'dreelprobe1234', audioBase64: 'AAAA', format: 'mp3', apiKey: 'x', fetchImpl }),
      /鉴权失败（401）/
    )
  })

  it('复刻成功返回 speakerId 与试听', async () => {
    const { cloneVoice } = await import('../src/services/volcVoiceApi.js')
    const fetchImpl = async () =>
      new Response(JSON.stringify({ speaker_id: 'dreelprobe1234', status: 2, speaker_status: [{ demo_audio: 'http://x/demo.mp3' }] }), { status: 200 })
    const r = await cloneVoice({ speakerId: 'dreelprobe1234', audioBase64: 'AAAA', format: 'mp3', apiKey: 'x', fetchImpl })
    assert.equal(r.speakerId, 'dreelprobe1234')
    assert.equal(r.status, 2)
    assert.equal(r.demoAudio, 'http://x/demo.mp3')
  })

  it('音色设计缺 speaker_id 时报错', async () => {
    const { designVoice } = await import('../src/services/volcVoiceApi.js')
    await assert.rejects(
      () => designVoice({ text: '你好', textPrompt: '女性', apiKey: 'x', fetchImpl: async () => new Response('{}', { status: 200 }) }),
      /已购买的 speaker_id/
    )
  })
})
