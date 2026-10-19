import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  findNode,
  findNodes,
  patchNodeInput,
  buildWorkflow,
  loadDefaultTemplate,
  stripMeta,
} from '../src/providers/comfyuiWorkflow.js'

describe('comfyuiWorkflow', () => {
  const tpl = loadDefaultTemplate()

  it('默认模板是 API 格式且含关键节点', () => {
    assert.ok(findNode(tpl, 'KSampler')[1])
    assert.ok(findNode(tpl, 'Wan22ImageToVideoLatent')[1])
    // 保存链路：SaveWEBM 或 CreateVideo+SaveVideo 均可
    assert.ok(findNode(tpl, 'SaveWEBM')[1] || findNode(tpl, 'SaveVideo')[1])
    assert.strictEqual(findNode(tpl, 'Nope')[0], null)
  })

  it('findNodes 返回全部同类节点', () => {
    assert.strictEqual(findNodes(tpl, 'CLIPTextEncode').length, 2)
  })

  it('patchTextEncode 通过 KSampler 链接改写正负提示词', () => {
    const wf = buildWorkflow(tpl, { prompt: 'P', negativePrompt: 'N' })
    const [, ks] = findNode(wf, 'KSampler')
    assert.strictEqual(wf[String(ks.inputs.positive[0])].inputs.text, 'P')
    assert.strictEqual(wf[String(ks.inputs.negative[0])].inputs.text, 'N')
  })

  it('buildWorkflow 注入采样/尺寸/帧数/种子', () => {
    const wf = buildWorkflow(tpl, { steps: 30, cfg: 3.5, seed: 7, width: 640, height: 640, length: 33 })
    const [, ks] = findNode(wf, 'KSampler')
    const [, lat] = findNode(wf, 'Wan22ImageToVideoLatent')
    assert.strictEqual(ks.inputs.steps, 30)
    assert.strictEqual(ks.inputs.cfg, 3.5)
    assert.strictEqual(ks.inputs.seed, 7)
    assert.strictEqual(lat.inputs.width, 640)
    assert.strictEqual(lat.inputs.length, 33)
  })

  it('buildWorkflow 不修改原模板（不可变）', () => {
    const before = JSON.stringify(tpl)
    buildWorkflow(tpl, { prompt: 'changed', steps: 99 })
    assert.strictEqual(JSON.stringify(tpl), before)
  })

  it('stripMeta 剔除 _meta 字段', () => {
    const stripped = stripMeta(tpl)
    assert.ok(!JSON.stringify(stripped).includes('_meta'))
    assert.strictEqual(stripped['9'].class_type, 'KSampler')
  })

  it('patchNodeInput 对不存在节点抛错', () => {
    assert.throws(() => patchNodeInput({}, 'KSampler', 'steps', 1), /不存在/)
  })
})

describe('comfyuiWorkflow - 多参考图/多提示词/多配音', () => {
  const tpl = loadDefaultTemplate()

  function multiTemplate() {
    // 扩出一个多输入模板：2 张参考图 + 3 个文本节点 + 1 个音频节点
    const wf = JSON.parse(JSON.stringify(tpl))
    wf['20'] = { class_type: 'LoadImage', inputs: { image: 'x.png' } }
    wf['21'] = { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['2', 0] } }
    wf['30'] = { class_type: 'LoadAudio', inputs: { audio: 'a.wav' } }
    return wf
  }

  it('多参考图按 node_id 升序写入 LoadImage', () => {
    const wf = buildWorkflow(multiTemplate(), { images: ['r1.png', 'r2.png'] })
    assert.strictEqual(findNode(wf, 'LoadImage')[1].inputs.image, 'r1.png')
    assert.strictEqual(wf['20'].inputs.image, 'r2.png')
  })

  it('参考图多于 LoadImage 节点时抛错', () => {
    assert.throws(() => buildWorkflow(tpl, { images: ['a.png', 'b.png'] }), /LoadImage 节点/)
  })

  it('多提示词：节点足够时按序对应', () => {
    const wf = buildWorkflow(multiTemplate(), { prompts: ['p1', 'p2'], negativePrompts: ['n1'] })
    const [, ks] = findNode(wf, 'KSampler')
    assert.strictEqual(wf[String(ks.inputs.positive[0])].inputs.text, 'p1')
    assert.strictEqual(wf['21'].inputs.text, 'p2') // 额外文本节点按序接收
    assert.strictEqual(wf[String(ks.inputs.negative[0])].inputs.text, 'n1')
  })

  it('多提示词：节点不足时合并到主正向节点', () => {
    const wf = buildWorkflow(tpl, { prompts: ['a', 'b', 'c'] })
    const [, ks] = findNode(wf, 'KSampler')
    assert.strictEqual(wf[String(ks.inputs.positive[0])].inputs.text, 'a, b, c')
  })

  it('多配音按序写入音频节点', () => {
    const wf = buildWorkflow(multiTemplate(), { audios: ['v1.wav'] })
    assert.strictEqual(wf['30'].inputs.audio, 'v1.wav')
  })

  it('无音频节点但传 audios 时抛错', () => {
    assert.throws(() => buildWorkflow(tpl, { audios: ['v1.wav'] }), /音频加载节点/)
  })

  it('单条 prompt 与多条 prompts 等价', () => {
    const a = buildWorkflow(tpl, { prompt: 'X' })
    const b = buildWorkflow(tpl, { prompts: ['X'] })
    const [, ks] = findNode(a, 'KSampler')
    assert.strictEqual(a[String(ks.inputs.positive[0])].inputs.text, b[String(ks.inputs.positive[0])].inputs.text)
  })
})
