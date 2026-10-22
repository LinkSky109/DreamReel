import { writeChild } from './novelChildStore.js'
import { listCharactersAsync } from './novelAsyncReadService.js'
import { CARD_FIELDS, CHARACTER_FIELDS } from '../models/NovelCharacter.js'

/**
 * 角色卡与人工审核（Sprint 19 / S19-5、S19-6）
 * - ensureCards：补齐角色卡字段（schema 归一）
 * - applyEdits：应用人工修订并记录 reviewEdits
 * - reviewStats：修订率 = 被修订字段数 ÷ 字段总数
 */

export async function ensureCards(novelId) {
  const characters = await listCharactersAsync(novelId)
  for (const c of characters) {
    if (!c.card) c.card = {}
    for (const field of CARD_FIELDS) {
      if (c.card[field] === undefined || c.card[field] === null) c.card[field] = ''
    }
    if (!Array.isArray(c.aliases)) c.aliases = []
    await writeChild('characters', c)
  }
  return characters
}

export async function applyEdits(novelId, characterId, patch = {}, { approve = false } = {}) {
  const c = (await listCharactersAsync(novelId)).find((x) => x.id === characterId)
  if (!c || c.novelId !== novelId) throw new Error(`character not found: ${characterId}`)
  const now = new Date().toISOString()
  if (!Array.isArray(c.reviewEdits)) c.reviewEdits = []
  const record = (field, from, to) => {
    c.reviewEdits.push({ field, from, to, at: now })
  }

  if (patch.name !== undefined && patch.name !== c.name) {
    record('name', c.name, patch.name)
    c.name = patch.name
  }
  if (patch.aliases !== undefined) {
    const from = JSON.stringify(c.aliases)
    const to = JSON.stringify(patch.aliases)
    if (from !== to) record('aliases', from, to)
    c.aliases = patch.aliases
  }
  if (patch.description !== undefined) c.description = patch.description
  if (patch.card && typeof patch.card === 'object') {
    for (const field of CARD_FIELDS) {
      if (patch.card[field] !== undefined && patch.card[field] !== c.card[field]) {
        record(field, c.card[field], patch.card[field])
        c.card[field] = patch.card[field]
      }
    }
  }
  if (approve) c.status = 'approved'
  c.updatedAt = now
  await writeChild('characters', c)
  return c
}

export async function reviewStats(novelId) {
  const characters = await listCharactersAsync(novelId)
  const totalFields = characters.length * CHARACTER_FIELDS.length
  const edited = new Set()
  for (const c of characters) {
    for (const e of c.reviewEdits || []) edited.add(`${c.id}:${e.field}`)
  }
  const editedFields = edited.size
  const rate = totalFields ? editedFields / totalFields : 0
  return {
    characters: characters.length,
    totalFields,
    editedFields,
    revisionRate: Number(rate.toFixed(4)),
    approved: characters.filter((c) => c.status === 'approved').length,
  }
}
