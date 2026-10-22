import config from '../config/index.js'
import { getNovelProject } from './novelProjectService.js'
import { novelReadService } from './novelReadService.js'

/**
 * Phase 3c-2：核心生成链路的异步读门面。
 *
 * postgres：直接读 PG；legacy：退回现有同步实现（仅测试/回滚）。
 * 后续会逐步替换 admin/读模型，最终删除内存投影。
 */

export function isPgReadMode() {
  return config.novels.writeMode === 'postgres'
}

export async function getNovelProjectAsync(id) {
  if (isPgReadMode()) return novelReadService.get(id)
  return getNovelProject(id)
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
