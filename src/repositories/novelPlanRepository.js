import { DEFAULT_ORG } from './novelRepository.js'

/** 规划运行与产物仓储（替代本地 plan/*.json）。 */
export function createNovelPlanRepository(db) {
  function mapRun(row) {
    if (!row) return null
    return {
      id: row.id,
      orgId: row.org_id,
      novelId: row.novel_id,
      cleanedHash: row.cleaned_hash,
      provider: row.provider,
      model: row.model,
      status: row.status,
      stats: row.stats,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function createRun(run = {}, { orgId = DEFAULT_ORG } = {}) {
    const now = new Date()
    await db
      .insertInto('novel_plan_runs')
      .values({
        id: run.id,
        org_id: orgId,
        novel_id: run.novelId,
        cleaned_hash: run.cleanedHash || '',
        provider: run.provider || '',
        model: run.model || '',
        status: run.status || 'running',
        stats: run.stats ? JSON.stringify(run.stats) : null,
        created_at: now,
        updated_at: now,
      })
      .execute()
    return run.id
  }

  async function addArtifact(runId, kind, payload) {
    await db
      .insertInto('novel_plan_artifacts')
      .values({ run_id: runId, kind, payload: JSON.stringify(payload) })
      .onConflict((oc) => oc.columns(['run_id', 'kind']).doUpdateSet({ payload: JSON.stringify(payload) }))
      .execute()
  }

  async function finishRun(runId, { status = 'done', stats = null } = {}) {
    await db
      .updateTable('novel_plan_runs')
      .set({
        status,
        stats: stats ? JSON.stringify(stats) : null,
        updated_at: new Date(),
      })
      .where('id', '=', runId)
      .execute()
  }

  async function findRun(id, { orgId = DEFAULT_ORG } = {}) {
    const row = await db
      .selectFrom('novel_plan_runs')
      .selectAll()
      .where('id', '=', id)
      .where('org_id', '=', orgId)
      .executeTakeFirst()
    return mapRun(row)
  }

  async function getLatest(novelId, { orgId = DEFAULT_ORG } = {}) {
    const row = await db
      .selectFrom('novel_plan_runs')
      .selectAll()
      .where('novel_id', '=', novelId)
      .where('org_id', '=', orgId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    return mapRun(row)
  }

  async function getArtifacts(runId) {
    const rows = await db
      .selectFrom('novel_plan_artifacts')
      .selectAll()
      .where('run_id', '=', runId)
      .execute()
    return Object.fromEntries(rows.map((row) => [row.kind, row.payload]))
  }

  return { createRun, addArtifact, finishRun, findRun, getLatest, getArtifacts }
}
