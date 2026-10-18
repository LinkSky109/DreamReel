/**
 * ComfyUI 工作流工具（API 格式）
 *
 * 对齐用户侧 comfyui_client.py 的静态辅助方法：find_node / patch_node_input / patch_text_encode，
 * 并扩展支持「多参考图 / 多提示词 / 多配音」（见新版接口文档 generate(params)）。
 *
 * 工作流为「API 格式」：{ "<node_id>": { class_type, inputs } }（非 UI 格式）。
 * 所有操作先深拷贝，保持不可变；模板里的 `_meta` 字段提交前会被剔除。
 *
 * 多输入映射规则（按 class_type 定位）：
 *   images[]          → 所有 LoadImage 节点，按 node_id 升序位置对应；images[0] 同时作为 latent.start_image
 *   audios[]          → 所有音频加载节点（class 含 Audio 且含 filename 类字段，如 LoadAudio.audio），按 node_id 升序
 *   prompts[]         → 正向文本节点（KSampler.positive 指向的节点 + 其它未被占用的 CLIPTextEncode），按序对应；
 *                       节点数不足时合并（英文逗号）到主正向节点
 *   negativePrompts[] → 负向文本节点，同上
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'config', 'comfyuiWorkflows')

const AUDIO_FIELDS = ['audio', 'audio_file', 'audio_path', 'audioUI', 'file', 'filename']

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/** 查找第一个指定 class_type 的节点 → [nodeId, node]；找不到返回 [null, null] */
export function findNode(workflow, classType) {
  for (const [id, node] of Object.entries(workflow)) {
    if (node?.class_type === classType) return [id, node]
  }
  return [null, null]
}

/** 查找所有指定 class_type 的节点 → [[id, node], ...]（按 node_id 升序） */
export function findNodes(workflow, classType) {
  return Object.entries(workflow).filter(([, node]) => node?.class_type === classType)
}

/** 修改指定 class_type 节点的输入字段（不可变） */
export function patchNodeInput(workflow, classType, field, value) {
  const [id, node] = findNode(workflow, classType)
  if (!node) throw new Error(`节点不存在: ${classType}`)
  workflow[id] = { ...node, inputs: { ...node.inputs, [field]: value } }
  return workflow
}

/** 按 node_id 修改输入字段（不可变） */
export function patchNodeInputById(workflow, nodeId, field, value) {
  const id = String(nodeId)
  const node = workflow[id]
  if (!node) throw new Error(`节点不存在: ${id}`)
  workflow[id] = { ...node, inputs: { ...node.inputs, [field]: value } }
  return workflow
}

/**
 * 通过 KSampler 的 positive/negative 链接改写对应 CLIPTextEncode 的 text（单条，兼容原 API）。
 */
export function patchTextEncode(workflow, ksamplerClass, texts = {}) {
  return applyTexts(workflow, ksamplerClass, texts.positive != null ? [texts.positive] : [], texts.negative != null ? [texts.negative] : [])
}

/** 内部：把多条正向/负向文本按序写入文本节点 */
function applyTexts(workflow, ksamplerClass, positives = [], negatives = []) {
  const [, ks] = findNode(workflow, ksamplerClass)
  if (!ks) throw new Error(`节点不存在: ${ksamplerClass}`)
  const posId = Array.isArray(ks.inputs?.positive) ? String(ks.inputs.positive[0]) : null
  const negId = Array.isArray(ks.inputs?.negative) ? String(ks.inputs.negative[0]) : null
  const encodeIds = findNodes(workflow, 'CLIPTextEncode').map(([id]) => id)
  const extras = encodeIds.filter((id) => id !== posId && id !== negId)

  const posExtras = positives.length > 1 ? extras.slice(0, Math.min(extras.length, positives.length - 1)) : []
  const negExtras = extras.filter((id) => !posExtras.includes(id))

  setTexts(workflow, posId, posExtras, positives)
  setTexts(workflow, negId, negExtras, negatives)
  return workflow
}

function setTexts(workflow, primaryId, extraIds, texts) {
  if (!texts?.length) return
  if (texts.length === 1) {
    const id = primaryId || extraIds[0]
    if (id) patchNodeInputById(workflow, id, 'text', texts[0])
    return
  }
  const targets = [primaryId, ...extraIds].filter(Boolean)
  if (targets.length >= texts.length) {
    texts.forEach((t, i) => patchNodeInputById(workflow, targets[i], 'text', t))
  } else if (targets[0]) {
    // 文本节点不足 → 合并到主节点
    patchNodeInputById(workflow, targets[0], 'text', texts.join(', '))
  }
}

/** 查找音频加载节点：[{id, field}, ...] */
export function findAudioNodes(workflow) {
  const out = []
  for (const [id, node] of Object.entries(workflow)) {
    if (!/audio/i.test(node?.class_type || '')) continue
    const field = AUDIO_FIELDS.find((f) => f in (node.inputs || {}))
    if (field) out.push({ id, field })
  }
  return out
}

/** 剔除 `_meta` 等非 API 字段（提交前） */
export function stripMeta(workflow) {
  const out = {}
  for (const [id, node] of Object.entries(workflow)) {
    out[id] = { class_type: node.class_type, inputs: node.inputs }
  }
  return out
}

/**
 * 用高层参数构建可提交工作流。
 * @param {object} template
 * @param {object} p
 *   @param {string}   [p.prompt]           单条正向（便捷）
 *   @param {string[]} [p.prompts]          多条正向
 *   @param {string}   [p.negativePrompt]   单条负向
 *   @param {string[]} [p.negativePrompts]  多条负向
 *   @param {string[]} [p.images]           多参考图（ComfyUI input 文件名）
 *   @param {string}   [p.startImage]       images[0] 的别名
 *   @param {string[]} [p.audios]           多音频（ComfyUI input 文件名）
 *   @param {number}   [p.width|height|length|batch_size|steps|cfg|shift|fps|seed]
 *   @param {string}   [p.sampler|scheduler|filenamePrefix]
 */
export function buildWorkflow(template, p = {}) {
  const wf = clone(template)

  const positives = normalizeList(p.prompts, p.prompt)
  const negatives = normalizeList(p.negativePrompts, p.negativePrompt)
  const images = normalizeList(p.images, p.startImage)
  const audios = normalizeList(p.audios, null)

  // 提示词
  applyTexts(wf, 'KSampler', positives, negatives)

  // 采样参数
  const [ksId, ks] = findNode(wf, 'KSampler')
  if (ks) {
    const inp = { ...ks.inputs }
    if (p.seed != null) inp.seed = p.seed
    if (p.steps != null) inp.steps = p.steps
    if (p.cfg != null) inp.cfg = p.cfg
    if (p.sampler) inp.sampler_name = p.sampler
    if (p.scheduler) inp.scheduler = p.scheduler
    wf[ksId] = { ...ks, inputs: inp }
  }

  if (p.shift != null && findNode(wf, 'ModelSamplingSD3')[1]) {
    patchNodeInput(wf, 'ModelSamplingSD3', 'shift', p.shift)
  }

  const [latId, lat] = findNode(wf, 'Wan22ImageToVideoLatent')
  if (lat) {
    for (const f of ['width', 'height', 'length', 'batch_size']) {
      if (p[f] != null) patchNodeInput(wf, 'Wan22ImageToVideoLatent', f, p[f])
    }
  }

  // 参考图：按序写入 LoadImage；images[0] 作为 latent.start_image
  const imgIds = findNodes(wf, 'LoadImage').map(([id]) => id)
  if (images.length) {
    if (imgIds.length === 0) throw new Error('工作流无 LoadImage 节点，无法注入参考图')
    if (imgIds.length < images.length) {
      throw new Error(`参考图 ${images.length} 张 > LoadImage 节点 ${imgIds.length} 个`)
    }
    images.forEach((v, i) => patchNodeInputById(wf, imgIds[i], 'image', v))
    if (lat?.inputs && 'start_image' in lat.inputs) {
      patchNodeInputById(wf, latId, 'start_image', [imgIds[0], 0])
    }
  } else {
    // T2V：移除 LoadImage 与 latent.start_image（重新查找 latent，避免用过期的节点引用覆盖已注入的宽高/帧数）
    for (const id of imgIds) delete wf[id]
    const [lid, latNow] = findNode(wf, 'Wan22ImageToVideoLatent')
    if (latNow?.inputs && 'start_image' in latNow.inputs) {
      const inputs = { ...latNow.inputs }
      delete inputs.start_image
      wf[lid] = { ...latNow, inputs }
    }
  }

  // 配音/音频：按序写入音频加载节点
  if (audios.length) {
    const audioNodes = findAudioNodes(wf)
    if (audioNodes.length === 0) throw new Error('工作流无音频加载节点（如 LoadAudio），无法注入配音')
    if (audioNodes.length < audios.length) {
      throw new Error(`音频 ${audios.length} 个 > 音频节点 ${audioNodes.length} 个`)
    }
    audios.forEach((v, i) => patchNodeInputById(wf, audioNodes[i].id, audioNodes[i].field, v))
  }

  // 保存节点
  const [, webm] = findNode(wf, 'SaveWEBM')
  const [, saveVideo] = findNode(wf, 'SaveVideo')
  if (webm) {
    if (p.filenamePrefix) patchNodeInput(wf, 'SaveWEBM', 'filename_prefix', p.filenamePrefix)
    if (p.fps != null) patchNodeInput(wf, 'SaveWEBM', 'fps', p.fps)
  } else if (saveVideo) {
    if (p.filenamePrefix) patchNodeInput(wf, 'SaveVideo', 'filename_prefix', p.filenamePrefix)
    // mp4 输出：帧率在 CreateVideo 节点上
    if (p.fps != null) patchNodeInput(wf, 'CreateVideo', 'fps', p.fps)
  }

  return stripMeta(wf)
}

function normalizeList(list, single) {
  if (Array.isArray(list) && list.length) return list.filter(Boolean)
  if (single != null && single !== '') return [single]
  return []
}

/** 从文件加载工作流模板 */
export function loadTemplateFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/** 加载内置默认模板（wan22_ti2v） */
export function loadDefaultTemplate() {
  return loadTemplateFile(path.join(TEMPLATE_DIR, 'wan22_ti2v.json'))
}

export { TEMPLATE_DIR }
export default {
  findNode,
  findNodes,
  patchNodeInput,
  patchNodeInputById,
  patchTextEncode,
  findAudioNodes,
  buildWorkflow,
  loadTemplateFile,
  loadDefaultTemplate,
}
