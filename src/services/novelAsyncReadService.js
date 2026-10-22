import { novelReadService } from './novelReadService.js'

/**
 * Phase 3c-2：核心生成链路的异步读门面。
 *
 * PostgreSQL 是唯一读源。
 */

export async function getNovelProjectAsync(id) {
  return novelReadService.get(id)
}

export async function listChildrenAsync(kind, novelId, opts) {
  // 动态导入避免与 growth/asset 等服务形成循环依赖
  const { novelChildReadService } = await import('./novelChildReadService.js')
  return novelChildReadService.list(kind, novelId, opts)
}

export const listChunksAsync = (novelId) => listChildrenAsync('chunks', novelId)
export const listCharactersAsync = (novelId) => listChildrenAsync('characters', novelId)
export const listEntitiesAsync = (novelId) => listChildrenAsync('entities', novelId)
export const listSeasonsAsync = (novelId) => listChildrenAsync('seasons', novelId)
export const listEpisodesAsync = (novelId, seasonId) => listChildrenAsync('episodes', novelId, { seasonId })
export const listAssetsAsync = (novelId, opts = {}) => listChildrenAsync('assets', novelId, opts)
export const listStatesAsync = (novelId, characterId) => listChildrenAsync('states', novelId, { characterId })
