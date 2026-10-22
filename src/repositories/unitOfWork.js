import { sql } from 'kysely'
import { getDb } from '../db/client.js'
import { DEFAULT_ORG } from './novelRepository.js'
import { createNovelSourceRepository } from './novelSourceRepository.js'
import { createNovelChunkRepository } from './novelChunkRepository.js'
import { createSeasonRepository } from './seasonRepository.js'
import { createEpisodeRepository } from './episodeRepository.js'
import { createNovelPlanRepository } from './novelPlanRepository.js'

/** 绑定到同一个 db/事务的小说写仓储集合。 */
export function createNovelWriteRepositories(db) {
  return {
    sources: createNovelSourceRepository(db),
    chunks: createNovelChunkRepository(db),
    seasons: createSeasonRepository(db),
    episodes: createEpisodeRepository(db),
    plans: createNovelPlanRepository(db),
  }
}

export function getNovelWriteRepositories() {
  return createNovelWriteRepositories(getDb())
}

/**
 * 小说级事务 + advisory lock。
 * 同一小说的分季分集/重建/级联写入必须串行，避免半套数据与并发覆盖。
 */
export async function withNovelTransaction(novelId, fn, { db = getDb(), orgId = DEFAULT_ORG } = {}) {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`novel:${novelId}`})::bigint)`.execute(trx)
    return fn(createNovelWriteRepositories(trx), { orgId, novelId })
  })
}
