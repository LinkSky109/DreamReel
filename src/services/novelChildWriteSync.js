import { toChildPayload } from '../repositories/novelChildRepository.js'

/**
 * 小说子集合 PostgreSQL 写入原语（chunks / characters / entities / seasons / episodes / assets / states / sets）。
 *
 * 生产写路径由 novelChildStore 直接调用（PG 是唯一事实源）；
 * 这里同时作为离线迁移/恢复脚本的 upsert/delete 工具，不再包含 outbox/镜像调度。
 * 删除均为软删除；重新创建会清除 deleted_at。
 */

const SPECS = {
  chunks: {
    table: 'novel_chunks',
    columns: 'id, org_id, novel_id, idx, content, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'idx = EXCLUDED.idx, content = EXCLUDED.content, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.index ?? 0, doc.text || ''],
    payload: (doc) => toChildPayload('chunks', doc),
  },
  characters: {
    table: 'novel_characters',
    columns: 'id, org_id, novel_id, name, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5::jsonb,$6,$7,$8,1',
    update: 'name = EXCLUDED.name, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.name || ''],
    payload: (doc) => toChildPayload('characters', doc),
  },
  entities: {
    table: 'novel_world_entities',
    columns: 'id, org_id, novel_id, name, kind, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'name = EXCLUDED.name, kind = EXCLUDED.kind, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.name || '', doc.type || ''],
    payload: (doc) => toChildPayload('entities', doc),
  },
  seasons: {
    table: 'seasons',
    columns: 'id, org_id, novel_id, season_no, title, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'season_no = EXCLUDED.season_no, title = EXCLUDED.title, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.seasonNo ?? 1, doc.title || ''],
    payload: (doc) => toChildPayload('seasons', doc),
  },
  episodes: {
    table: 'episodes',
    columns: 'id, org_id, novel_id, season_id, episode_no, title, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1',
    update:
      'season_id = EXCLUDED.season_id, episode_no = EXCLUDED.episode_no, title = EXCLUDED.title, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.seasonId || null, doc.episodeNo ?? 1, doc.title || ''],
    payload: (doc) => toChildPayload('episodes', doc),
  },
  states: {
    table: 'novel_character_states',
    columns:
      'id, org_id, novel_id, character_id, episode_no, appearance, equipment, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,1',
    update:
      'character_id = EXCLUDED.character_id, episode_no = EXCLUDED.episode_no, appearance = EXCLUDED.appearance, equipment = EXCLUDED.equipment, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.characterId, doc.episodeNo ?? 0, doc.appearance || '', doc.equipment || ''],
    payload: (doc) => toChildPayload('states', doc),
  },
  characterSets: {
    table: 'character_sets',
    columns: 'id, org_id, novel_id, provider, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5::jsonb,$6,$7,$8,1',
    update: 'provider = EXCLUDED.provider, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.provider || ''],
    payload: (doc) => toChildPayload('characterSets', doc),
  },
  worldSets: {
    table: 'world_sets',
    columns: 'id, org_id, novel_id, provider, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5::jsonb,$6,$7,$8,1',
    update: 'provider = EXCLUDED.provider, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.provider || ''],
    payload: (doc) => toChildPayload('worldSets', doc),
  },
  assets: {
    table: 'novel_asset_images',
    columns: 'id, org_id, novel_id, category, name, status, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1',
    update:
      'category = EXCLUDED.category, name = EXCLUDED.name, status = EXCLUDED.status, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.category || '', doc.name || '', doc.status || 'draft'],
    payload: (doc) => toChildPayload('assets', doc),
  },
}

let sequence = 0
function nextSortOrder() {
  const now = Date.now()
  sequence = now > sequence ? now : sequence + 1
  return sequence
}

function requireSpec(kind) {
  const spec = SPECS[kind]
  if (!spec) throw new Error(`未知子集合：${kind}`)
  return spec
}

export async function applyChildUpsert(pool, kind, doc, orgId) {
  const spec = requireSpec(kind)
  const now = new Date()
  const createdAt = doc.createdAt ? new Date(doc.createdAt) : now
  const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : now
  const mapped = spec.map(doc)
  const params = [doc.id, orgId, doc.novelId, ...mapped.slice(2), JSON.stringify(spec.payload(doc)), nextSortOrder(), createdAt, updatedAt]
  await pool.query(
    `INSERT INTO ${spec.table} (${spec.columns}) VALUES (${spec.values})
     ON CONFLICT (id) DO UPDATE SET ${spec.update},
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL,
       version = ${spec.table}.version + 1`,
    params
  )
}

export async function applyChildDelete(pool, kind, id, orgId) {
  const spec = requireSpec(kind)
  const now = new Date()
  const result = await pool.query(
    `UPDATE ${spec.table} SET deleted_at = $3, updated_at = $3, version = version + 1
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [id, orgId, now]
  )
  return result.rowCount
}

export async function applyChildDeleteByNovel(pool, kind, novelId, orgId) {
  const spec = requireSpec(kind)
  const now = new Date()
  const result = await pool.query(
    `UPDATE ${spec.table} SET deleted_at = $3, updated_at = $3, version = version + 1
     WHERE novel_id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [novelId, orgId, now]
  )
  return result.rowCount
}

export async function applyChildDeleteStates(pool, novelId, orgId, characterId = null, episodeNo = null) {
  const now = new Date()
  const result = await pool.query(
    `UPDATE novel_character_states
       SET deleted_at = $5, updated_at = $5, version = version + 1
     WHERE novel_id = $1 AND org_id = $2
       AND ($3::text IS NULL OR character_id = $3::text)
       AND ($4::int IS NULL OR episode_no = $4::int)
       AND deleted_at IS NULL`,
    [novelId, orgId, characterId || null, episodeNo ?? null, now]
  )
  return result.rowCount
}
