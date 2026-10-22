import { sql } from 'kysely'
import { DEFAULT_ORG } from './novelRepository.js'

const COLUMN_FIELDS = [
  'id', 'orgId', 'novelId', 'seasonNo', 'title', 'arcName', 'goal', 'acts', 'endingHook',
  'estimatedEpisodes', 'planProvider', 'chapterStart', 'chapterEnd', 'sortOrder',
  'createdAt', 'updatedAt', 'deletedAt', 'version',
]

function toPayload(season) {
  const payload = { ...season }
  for (const field of COLUMN_FIELDS) delete payload[field]
  return payload
}

export function createSeasonRepository(db) {
  function map(row) {
    const payload = row.payload || {}
    return {
      ...payload,
      id: row.id,
      novelId: row.novel_id,
      seasonNo: row.season_no,
      title: row.title,
      arcName: row.arc_name || payload.arcName || '',
      goal: row.goal || payload.goal || '',
      acts: row.acts ?? payload.acts ?? null,
      endingHook: row.ending_hook || payload.endingHook || '',
      estimatedEpisodes: row.estimated_episodes ?? payload.estimatedEpisodes ?? null,
      planProvider: row.plan_provider || payload.planProvider || '',
      chapterStart: row.chapter_start ?? payload.chapterStart ?? null,
      chapterEnd: row.chapter_end ?? payload.chapterEnd ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function list(novelId, { orgId = DEFAULT_ORG } = {}) {
    const rows = await db
      .selectFrom('seasons')
      .selectAll()
      .where('novel_id', '=', novelId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .orderBy('season_no', 'asc')
      .execute()
    return rows.map(map)
  }

  /** 按 (novel_id, season_no) upsert；保留已存在季的 id。 */
  async function upsertMany(novelId, seasons = [], { orgId = DEFAULT_ORG } = {}) {
    if (!seasons.length) return new Map()
    const rows = seasons.map((s, i) => ({
      id: s.id,
      org_id: orgId,
      novel_id: novelId,
      season_no: s.seasonNo,
      title: s.title || '',
      payload: toPayload(s),
      sort_order: s.sortOrder ?? i,
      arc_name: s.arcName || '',
      goal: s.goal || '',
      acts: s.acts ?? null,
      ending_hook: s.endingHook || '',
      estimated_episodes: s.estimatedEpisodes ?? null,
      plan_provider: s.planProvider || '',
      chapter_start: s.chapterStart ?? null,
      chapter_end: s.chapterEnd ?? null,
    }))
    const result = await sql`
      INSERT INTO seasons (
        id, org_id, novel_id, season_no, title, payload, sort_order,
        arc_name, goal, acts, ending_hook, estimated_episodes, plan_provider,
        chapter_start, chapter_end, created_at, updated_at
      )
      SELECT
        x.id, x.org_id, x.novel_id, x.season_no, x.title, x.payload, x.sort_order,
        x.arc_name, x.goal, x.acts, x.ending_hook, x.estimated_episodes, x.plan_provider,
        x.chapter_start, x.chapter_end, now(), now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        id text, org_id text, novel_id text, season_no integer, title text, payload jsonb,
        sort_order bigint, arc_name text, goal text, acts jsonb, ending_hook text,
        estimated_episodes integer, plan_provider text, chapter_start integer, chapter_end integer
      )
      ON CONFLICT (novel_id, season_no) WHERE deleted_at IS NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        payload = EXCLUDED.payload,
        sort_order = EXCLUDED.sort_order,
        arc_name = EXCLUDED.arc_name,
        goal = EXCLUDED.goal,
        acts = EXCLUDED.acts,
        ending_hook = EXCLUDED.ending_hook,
        estimated_episodes = EXCLUDED.estimated_episodes,
        plan_provider = EXCLUDED.plan_provider,
        chapter_start = EXCLUDED.chapter_start,
        chapter_end = EXCLUDED.chapter_end,
        updated_at = now(),
        deleted_at = NULL,
        version = seasons.version + 1
      RETURNING id, season_no
    `.execute(db)
    return new Map(result.rows.map((row) => [Number(row.season_no), row.id]))
  }

  /** 本次未出现的季软删除（保留历史与资产引用）。 */
  async function softDeleteMissing(novelId, seasonNos = [], { orgId = DEFAULT_ORG } = {}) {
    const keys = seasonNos.map(Number).filter((n) => Number.isInteger(n))
    if (!keys.length) {
      await db
        .updateTable('seasons')
        .set({ deleted_at: sql`now()`, updated_at: sql`now()`, version: sql`version + 1` })
        .where('novel_id', '=', novelId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .execute()
      return
    }
    await sql`
      UPDATE seasons
      SET deleted_at = now(), updated_at = now(), version = version + 1
      WHERE novel_id = ${novelId} AND org_id = ${orgId} AND deleted_at IS NULL
        AND season_no <> ALL(${keys}::int[])
    `.execute(db)
  }

  async function replaceForNovel(novelId, seasons = [], { orgId = DEFAULT_ORG, prune = true } = {}) {
    const idByNo = await upsertMany(novelId, seasons, { orgId })
    if (prune) await softDeleteMissing(novelId, seasons.map((s) => s.seasonNo), { orgId })
    return idByNo
  }

  return { list, upsertMany, softDeleteMissing, replaceForNovel }
}
