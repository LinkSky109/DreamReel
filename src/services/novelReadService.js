import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getNovelRepository } from '../repositories/novelRepository.js'
import { storageService } from './storageService.js'

/**
 * 小说只读服务（Phase 3c-2）。
 *
 * PostgreSQL 是唯一读源；不再有 legacy/shadow 回退。
 * 内存投影只服务于尚未异步化的内部同步读，不参与这里。
 */

const INTERNAL_FIELDS = ['orgId', 'version', 'deletedAt']

function toApiShape(doc) {
  const out = { ...doc }
  for (const field of INTERNAL_FIELDS) delete out[field]
  return out
}

export function createNovelReadService({ legacy, getRepo, mode = 'postgres', orgId = 'default', log = logger } = {}) {
  async function repoList() {
    const repo = await getRepo()
    const rows = await repo.list({ orgId, limit: 1000 })
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  return {
    async list({ requestId } = {}) {
      if (mode === 'legacy') return legacy.list()
      try {
        const rows = await repoList()
        return rows.map(toApiShape)
      } catch (error) {
        log.warn('[novel-read] postgres 读取失败', { requestId, message: error.message })
        throw error
      }
    },

    async get(id, { requestId } = {}) {
      if (mode === 'legacy') return legacy.get(id)
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
  legacy: {
    list: () => storageService.listNovelProjects().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    get: (id) => {
      const project = storageService.getNovelProject(id)
      if (!project) throw new Error(`Novel project not found: ${id}`)
      return project
    },
  },
  getRepo: getRepoLazy,
  // legacy 仅用于测试/回滚；生产写模式为 postgres 时读强制 PG。
  mode: config.novels.writeMode === 'legacy' ? 'legacy' : 'postgres',
  orgId: config.novels.orgId,
})
