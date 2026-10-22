import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getNovelRepository } from '../repositories/novelRepository.js'

/**
 * 小说只读服务（Phase 3c-2）。
 *
 * PostgreSQL 是唯一读源；不存在 legacy/shadow 回退。
 */

const INTERNAL_FIELDS = ['orgId', 'version', 'deletedAt']

function toApiShape(doc) {
  const out = { ...doc }
  for (const field of INTERNAL_FIELDS) delete out[field]
  return out
}

export function createNovelReadService({ getRepo, orgId = 'default', log = logger } = {}) {
  async function repoList() {
    const repo = await getRepo()
    const rows = await repo.list({ orgId, limit: 1000 })
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  return {
    async list({ requestId } = {}) {
      try {
        const rows = await repoList()
        return rows.map(toApiShape)
      } catch (error) {
        log.warn('[novel-read] postgres 读取失败', { requestId, message: error.message })
        throw error
      }
    },

    async get(id, { requestId } = {}) {
      try {
        const repo = await getRepo()
        const doc = await repo.findById(id, { orgId })
        if (!doc) throw new Error(`Novel project not found: ${id}`)
        return toApiShape(doc)
      } catch (error) {
        log.warn('[novel-read] postgres 读取失败', { requestId, id, message: error.message })
        throw error
      }
    },
  }
}

let repoPromise = null

function getRepoLazy() {
  if (!repoPromise) {
    repoPromise = import('../db/client.js').then(({ getDb }) =>
      getNovelRepository({ driver: 'postgres', db: getDb() })
    )
  }
  return repoPromise
}

export const novelReadService = createNovelReadService({
  getRepo: getRepoLazy,
  orgId: config.novels.orgId,
})
