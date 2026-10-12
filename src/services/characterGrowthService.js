import { storageService } from './storageService.js'
import { NovelCharacterState } from '../models/NovelCharacterState.js'

/**
 * 角色成长状态服务（Sprint 20 / S20-3）
 * 按章节/集记录角色演进（外貌/关系/能力）。生成留待后续（可由 LLM 产出增量）。
 */

export function addState(novelId, characterId, data = {}) {
  const character = storageService.getNovelCharacter(characterId)
  if (!character || character.novelId !== novelId) {
    throw new Error(`character not found: ${characterId}`)
  }
  const state = new NovelCharacterState({ ...data, novelId, characterId })
  return storageService.createNovelCharacterState(state)
}

export function listStates(novelId, characterId) {
  return storageService
    .listNovelCharacterStates(novelId, characterId)
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0))
}
