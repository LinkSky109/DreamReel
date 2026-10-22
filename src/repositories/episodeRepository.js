import { sql } from 'kysely'
import { DEFAULT_ORG } from './novelRepository.js'

const COLUMN_FIELDS = [
  'id', 'orgId', 'novelId', 'seasonId', 'episodeNo', 'title', 'chapterStart', 'chapterEnd',
  'startOffset', 'endOffset', 'estimatedSeconds', 'shortSource', 'cleanedHash', 'outline',
  'screenplay', 'targetSeconds', 'status', 'logicalKey', 'sortOrder', 'createdAt', 'updatedAt',
  'deletedAt', 'version',
]

function toPayload(episode) {
  const payload = { ...episode }
  for (const field of COLUMN_FIELDS) delete payload[field]
  return payload
}

export function createEpisodeRepository(db) {
  function map(row) {
    const payload = row.payload || {}
    return {
      ...payload,
      id: row.id,
      novelId: row.novel_id,
      seasonId: row.season_id,
      episodeNo: row.episode_no,
      title: row.title,
      chapterStart: row.chapter_start ?? payload.chapterStart ?? null,
      chapterEnd: row.chapter_end ?? payload.chapterEnd ?? null,
      startOffset: row.start_offset ?? payload.startOffset ?? null,
      endOffset: row.end_offset ?? payload.endOffset ?? null,
      estimatedSeconds:
        row.estimated_seconds !== null && row.estimated_seconds !== undefined
          ? Number(row.estimated_seconds)
          : payload.estimatedSeconds ?? null,
      shortSource: row.short_source ?? payload.shortSource ?? false,
      cleanedHash: row.cleaned_hash || payload.cleanedHash || '',
      outline: row.outline ?? payload.outline ?? null,
      screenplay: row.screenplay ?? payload.screenplay ?? null,
      targetSeconds: row.target_seconds ?? payload.targetSeconds ?? 90,
      status: row.status || payload.status || 'planned',
      logicalKey: row.logical_key || payload.logicalKey || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function list(novelId, { orgId = DEFAULT_ORG, seasonId = null } = {}) {
    let query = db
      .selectFrom('episodes')
      .selectAll()
      .where('novel_id', '=', novelId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
    if (seasonId) query = query.where('season_id', '=', seasonId)
    const rows = await query.orderBy('episode_no', 'asc').execute()
    return rows.map(map)
  }

  async function findById(id, { orgId = DEFAULT_ORG } = {}) {
    const row = await db
      .selectFrom('episodes')
      .selectAll()
      .where('id', '=', id)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    return map(row)
  }

  /** 按 (novel_id, logical_key) upsert；保留已存在集的 id。 */
  async function upsertMany(novelId, episodes = [], { orgId = DEFAULT_ORG } = {}) {
    if (!episodes.length) return new Map()
    const rows = episodes.map((e, i) => ({
      id: e.id,
      org_id: orgId,
      novel_id: novelId,
      season_id: e.seasonId || null,
      episode_no: e.episodeNo,
      title: e.title || '',
      payload: toPayload(e),
      sort_order: e.sortOrder ?? i,
      chapter_start: e.chapterStart ?? null,
      chapter_end: e.chapterEnd ?? null,
      start_offset: e.startOffset ?? null,
      end_offset: e.endOffset ?? null,
      estimated_seconds: e.estimatedSeconds ?? null,
      short_source: e.shortSource === true,
      cleaned_hash: e.cleanedHash || '',
      outline: e.outline ?? null,
      screenplay: e.screenplay ?? null,
      target_seconds: e.targetSeconds ?? 90,
      status: e.status || 'planned',
      logical_key: e.logicalKey || `e${e.episodeNo}`,
    }))
    const result = await sql`
      INSERT INTO episodes (
        id, org_id, novel_id, season_id, episode_no, title, payload, sort_order,
        chapter_start, chapter_end, start_offset, end_offset, estimated_seconds,
        short_source, cleaned_hash, outline, screenplay, target_seconds, status,
        logical_key, created_at, updated_at
      )
      SELECT
        x.id, x.org_id, x.novel_id, x.season_id, x.episode_no, x.title, x.payload, x.sort_order,
        x.chapter_start, x.chapter_end, x.start_offset, x.end_offset, x.estimated_seconds,
        x.short_source, x.cleaned_hash, x.outline, x.screenplay, x.target_seconds, x.status,
        x.logical_key, now(), now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        id text, org_id text, novel_id text, season_id text, episode_no integer, title text,
        payload jsonb, sort_order bigint, chapter_start integer, chapter_end integer,
        start_offset integer, end_offset integer, estimated_seconds numeric, short_source boolean,
        cleaned_hash text, outline jsonb, screenplay jsonb, target_seconds integer,
        status text, logical_key text
      )
      ON CONFLICT (novel_id, logical_key) WHERE deleted_at IS NULL AND logical_key <> ''
      DO UPDATE SET
        season_id = EXCLUDED.season_id,
        episode_no = EXCLUDED.episode_no,
        title = EXCLUDED.title,
        payload = EXCLUDED.payload,
        sort_order = EXCLUDED.sort_order,
        chapter_start = EXCLUDED.chapter_start,
        chapter_end = EXCLUDED.chapter_end,
        start_offset = EXCLUDED.start_offset,
        end_offset = EXCLUDED.end_offset,
        estimated_seconds = EXCLUDED.estimated_seconds,
        short_source = EXCLUDED.short_source,
        cleaned_hash = EXCLUDED.cleaned_hash,
        outline = EXCLUDED.outline,
        screenplay = EXCLUDED.screenplay,
        target_seconds = EXCLUDED.target_seconds,
        status = EXCLUDED.status,
        updated_at = now(),
        deleted_at = NULL,
        version = episodes.version + 1
      RETURNING id, logical_key
    `.execute(db)
    return new Map(result.rows.map((row) => [row.logical_key, row.id]))
  }

  /** 本次未出现的集软删除（保留历史，资产可按 id 归档）。 */
  async function softDeleteMissing(novelId, logicalKeys = [], { orgId = DEFAULT_ORG } = {}) {
    const keys = logicalKeys.filter(Boolean)
    if (!keys.length) {
      await db
        .updateTable('episodes')
        .set({ deleted_at: sql`now()`, updated_at: sql`now()`, version: sql`version + 1` })
        .where('novel_id', '=', novelId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .execute()
      return
    }
    await sql`
      UPDATE episodes
      SET deleted_at = now(), updated_at = now(), version = version + 1
      WHERE novel_id = ${novelId} AND org_id = ${orgId} AND deleted_at IS NULL
        AND logical_key <> ALL(${keys}::text[])
    `.execute(db)
  }

  async function replaceForNovel(novelId, episodes = [], { orgId = DEFAULT_ORG, prune = true } = {}) {
    const idByKey = await upsertMany(novelId, episodes, { orgId })
    if (prune) {
      await softDeleteMissing(novelId, episodes.map((e) => e.logicalKey || `e${e.episodeNo}`), { orgId })
    }
    return idByKey
  }

  async function update(id, patch = {}, { orgId = DEFAULT_ORG } = {}) {
    const set = {}
    const columns = {
      seasonId: 'season_id',
      episodeNo: 'episode_no',
      title: 'title',
      chapterStart: 'chapter_start',
      chapterEnd: 'chapter_end',
      startOffset: 'start_offset',
      endOffset: 'end_offset',
      estimatedSeconds: 'estimated_seconds',
      shortSource: 'short_source',
      cleanedHash: 'cleaned_hash',
      outline: 'outline',
      screenplay: 'screenplay',
      targetSeconds: 'target_seconds',
      status: 'status',
      logicalKey: 'logical_key',
    }
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] === undefined) continue
      set[column] = key === 'outline' || key === 'screenplay' ? JSON.stringify(patch[key]) : patch[key]
    }
    if (patch.payload !== undefined) set.payload = JSON.stringify(patch.payload)
    if (!Object.keys(set).length) return findById(id, { orgId })
    set.updated_at = sql`now()`
    set.version = sql`version + 1`
    await db
      .updateTable('episodes')
      .set(set)
      .where('id', '=', id)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .execute()
    return findById(id, { orgId })
  }

  return { list, findById, upsertMany, softDeleteMissing, replaceForNovel, update }
}
