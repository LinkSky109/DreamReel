import config from '../config/index.js'
import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import { getNovelRepository } from '../repositories/novelRepository.js'
import { stableStringify } from '../utils/stableJson.js'

/**
 * 小说只读服务：legacy / shadow / postgres 三档切换。
 *
 * - legacy：完全走现有 JSON 存储（默认，行为不变）
 * - shadow：仍返回 JSON 结果，同时读 PostgreSQL 做差异比对并记录
 * - postgres：返回 PostgreSQL 结果（需先执行 novels 数据迁移）
 *
 * 只覆盖列表与详情两个读路径；写入与其它 service 仍走旧实现。
 */

const INTERNAL_FIELDS = ['orgId', 'version', 'deletedAt']

function toApiShape(doc) {
  const out = { ...doc }
  for (const field of INTERNAL_FIELDS) delete out[field]
  return out
}

function shapeOf(doc) {
  return stableStringify({
    title: doc.title ?? '',
    status: doc.status ?? '',
    updatedAt: doc.updatedAt ?? '',
    counts: doc.counts ?? null,
    stage: doc.stage ?? null,
  })
}

export function createNovelReadService({
  legacy,
  getRepo,
  mode = 'legacy',
  orgId = 'default',
  log = logger,
} = {}) {
  async function repoList() {
    const repo = await getRepo()
    const rows = await repo.list({ orgId, limit: 1000 })
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  function compareList(legacyRows, pgRows, requestId) {
    const legacyMap = new Map(legacyRows.map((d) => [d.id, d]))
    const pgMap = new Map(pgRows.map((d) => [d.id, d]))
    const missing = [...legacyMap.keys()].filter((id) => !pgMap.has(id))
    const extra = [...pgMap.keys()].filter((id) => !legacyMap.has(id))
    const changed = [...legacyMap.keys()]
      .filter((id) => pgMap.has(id) && shapeOf(legacyMap.get(id)) !== shapeOf(pgMap.get(id)))
      .slice(0, 10)
    if (missing.length || extra.length || changed.length) {
      log.warn('[novel-shadow] list mismatch', { requestId, missing, extra, changed })
    }
  }

  return {
    mode,

    async list({ requestId } = {}) {
      const legacyRows = legacy.list()
      if (mode === 'legacy') return legacyRows
      let pgRows
      try {
        pgRows = await repoList()
      } catch (error) {
        log.warn('[novel-read] postgres 读取失败，回退 legacy', { requestId, message: error.message })
        return legacyRows
      }
      if (mode === 'shadow') {
        compareList(legacyRows, pgRows, requestId)
        return legacyRows
      }
      return pgRows.map(toApiShape)
    },

    async get(id, { requestId } = {}) {
      const legacyDoc = legacy.get(id)
      if (mode === 'legacy') return legacyDoc
      let pgDoc
      try {
        const repo = await getRepo()
        pgDoc = await repo.findById(id, { orgId })
      } catch (error) {
        log.warn('[novel-read] postgres 读取失败，回退 legacy', { requestId, message: error.message })
        return legacyDoc
      }
      if (mode === 'shadow') {
        if (!pgDoc) {
          log.warn('[novel-shadow] detail missing in postgres', { requestId, id })
        } else if (shapeOf(legacyDoc) !== shapeOf(pgDoc)) {
          log.warn('[novel-shadow] detail mismatch', {
            requestId,
            id,
            legacy: shapeOf(legacyDoc),
            postgres: shapeOf(pgDoc),
          })
        }
        return legacyDoc
      }
      if (!pgDoc) throw new Error(`Novel project not found: ${id}`)
      return toApiShape(pgDoc)
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
    list: () =>
      storageService
        .listNovelProjects()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    get: (id) => {
      const project = storageService.getNovelProject(id)
      if (!project) throw new Error(`Novel project not found: ${id}`)
      return project
    },
  },
  getRepo: getRepoLazy,
  mode: config.novels.repoMode,
  orgId: config.novels.orgId,
})
