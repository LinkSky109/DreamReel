import { storageService } from './storageService.js'
import { generateId } from '../utils/idGenerator.js'
import { fnv1a64Hex } from '../utils/hash.js'
import logger from '../utils/logger.js'

/**
 * 自建音色库（声音复刻 / 音色设计）。
 *
 * 与预设音色（VOICE_CATALOG）并列：预设直接可用；自建音色由用户上传样本或填写描述生成，
 * 生成后写入 voiceMap，即可像预设一样按角色固定使用。
 */

export const CLONE_RESOURCE_ID = 'seed-icl-2.0'
export const DESIGN_RESOURCE_ID = 'seed-tts-2.0'

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40)
}

/**
 * 生成符合火山命名规范的自定义音色代号。
 * 注意：官方禁用 `^[a-z]{2}_` 前缀，所以这里**不使用下划线分隔**，避免 dr_/xx_ 被判非法。
 */
export function makeSpeakerId(novelId, name) {
  const base = normalizeName(name).toLowerCase().replace(/[_-]/g, '')
  const hash = fnv1a64Hex(`${novelId || ''}:${name || ''}`).slice(0, 8)
  let id = `dreel${base}${hash}`.replace(/[_-]+$/, '').slice(0, 60)
  if (!/^[a-z]/i.test(id)) id = `dreel${id}`
  if (id.length < 8) id = `${id}${generateId().slice(0, 8)}`
  return id
}

export function listVoiceAssets(novelId) {
  return storageService
    .listVoiceAssets(novelId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function getVoiceAsset(id) {
  return storageService.getVoiceAsset(id)
}

/** 查找音色对应的合成 resource id；预设音色返回 null（走 provider 默认） */
export function resourceIdFor(voiceId) {
  if (!voiceId) return null
  const asset = storageService.getVoiceAsset(voiceId)
  if (asset) return asset.resourceId || (asset.type === 'clone' ? CLONE_RESOURCE_ID : DESIGN_RESOURCE_ID)
  // 兼容用户直接填写的复刻音色 ID
  if (/^(custom_|S_|ICL_)/i.test(voiceId)) return CLONE_RESOURCE_ID
  return null
}

export function isCustomVoice(voiceId) {
  return Boolean(storageService.getVoiceAsset(voiceId)) || /^(custom_|S_|ICL_)/i.test(String(voiceId || ''))
}

/**
 * 登记一个自建音色。
 * @param {object} data { novelId, name, type:'clone'|'design', speakerId, gender?, language?, status?, demoAudioUrl?, note?, resourceId? }
 */
export function registerVoiceAsset(data = {}) {
  if (!data.speakerId) throw new Error('缺少 speakerId')
  const existing = storageService.getVoiceAsset(data.speakerId)
  if (existing) {
    // 同一代号重复登记：更新试听与状态
    Object.assign(existing, data, { updatedAt: new Date().toISOString() })
    return storageService.createVoiceAsset(existing)
  }
  const asset = {
    id: data.speakerId,
    speakerId: data.speakerId,
    novelId: data.novelId || null,
    name: data.name || data.speakerId,
    type: data.type || 'clone',
    gender: data.gender || '',
    language: data.language ?? 0,
    status: data.status || 'ready',
    demoAudioUrl: data.demoAudioUrl || '',
    note: data.note || '',
    resourceId: data.resourceId || (data.type === 'design' ? DESIGN_RESOURCE_ID : CLONE_RESOURCE_ID),
    createdAt: new Date().toISOString(),
  }
  logger.info(`登记自建音色 ${asset.speakerId}（${asset.type}）`)
  return storageService.createVoiceAsset(asset)
}

export function deleteVoiceAsset(id) {
  return storageService.deleteVoiceAsset(id)
}

/** 供 UI 使用：预设 + 自建音色统一成下拉选项 */
export function voiceOptions(novelId, presets = []) {
  const custom = listVoiceAssets(novelId).map((v) => ({
    id: v.speakerId,
    name: v.name,
    gender: v.gender || '',
    custom: true,
    type: v.type,
    demoAudioUrl: v.demoAudioUrl || '',
  }))
  return { presets, custom }
}

export default {
  makeSpeakerId,
  listVoiceAssets,
  getVoiceAsset,
  registerVoiceAsset,
  deleteVoiceAsset,
  resourceIdFor,
  isCustomVoice,
  voiceOptions,
}
