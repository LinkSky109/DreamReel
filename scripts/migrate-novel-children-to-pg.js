#!/usr/bin/env node
/**
 * 小说子集合迁移：novelChunks / novelCharacters / novelWorldEntities → PostgreSQL
 *
 *   node scripts/migrate-novel-children-to-pg.js --dry-run
 *   node scripts/migrate-novel-children-to-pg.js
 *   node scripts/migrate-novel-children-to-pg.js --verify
 *   node scripts/migrate-novel-children-to-pg.js --kind=chunks
 *
 * 幂等：按 id upsert。
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import config from '../src/config/index.js'
import { toChildPayload, CHILD_KINDS } from '../src/repositories/novelChildRepository.js'
import { stableStringify } from '../src/utils/stableJson.js'
import { findLatestNovelArchive, loadNovelArchive } from './lib/novelJsonArchive.js'

const { Client } = pg
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const verifyOnly = args.has('--verify')
const kindArg = [...args].find((a) => a.startsWith('--kind='))?.split('=')[1]
const kinds = kindArg ? [kindArg] : CHILD_KINDS
const orgId = config.novels.orgId
const dbPath = path.resolve(config.storage.path, 'data', 'db.json')

const SOURCE_COLLECTIONS = {
  chunks: 'novelChunks',
  characters: 'novelCharacters',
  entities: 'novelWorldEntities',
  seasons: 'seriesSeasons',
  episodes: 'seriesEpisodes',
  assets: 'novelAssetImages',
  states: 'novelCharacterStates',
  characterSets: 'characterSets',
  worldSets: 'worldSets',
}

const TABLES = {
  chunks: 'novel_chunks',
  characters: 'novel_characters',
  entities: 'novel_world_entities',
  seasons: 'seasons',
  episodes: 'episodes',
  assets: 'novel_asset_images',
  states: 'novel_character_states',
  characterSets: 'character_sets',
  worldSets: 'world_sets',
}

function loadData() {
  if (!fs.existsSync(dbPath)) throw new Error(`找不到数据文件：${dbPath}`)
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
  const hasNovels = data.novelProjects && Object.keys(data.novelProjects).length > 0
  if (hasNovels) return data
  const latest = findLatestNovelArchive()
  if (!latest) return data
  console.log(`db.json 无小说集合，使用归档：${latest}`)
  return { ...data, ...loadNovelArchive(latest).collections }
}

function valuesFor(kind, doc, position, now) {
  if (kind === 'chunks') return [doc.id, orgId, doc.novelId, doc.index ?? 0, doc.text || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, now]
  if (kind === 'characters') return [doc.id, orgId, doc.novelId, doc.name || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.updatedAt ? new Date(doc.updatedAt) : now]
  if (kind === 'entities') return [doc.id, orgId, doc.novelId, doc.name || '', doc.type || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, now]
  if (kind === 'seasons') return [doc.id, orgId, doc.novelId, doc.seasonNo ?? 1, doc.title || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.createdAt ? new Date(doc.createdAt) : now]
  if (kind === 'episodes') return [doc.id, orgId, doc.novelId, doc.seasonId || null, doc.episodeNo ?? 1, doc.title || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.createdAt ? new Date(doc.createdAt) : now]
  if (kind === 'assets') return [doc.id, orgId, doc.novelId, doc.category || '', doc.name || '', doc.status || 'draft', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.updatedAt ? new Date(doc.updatedAt) : now]
  if (kind === 'states') return [doc.id, orgId, doc.novelId, doc.characterId, doc.episodeNo ?? 0, doc.appearance || '', doc.equipment || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.updatedAt ? new Date(doc.updatedAt) : now]
  if (kind === 'characterSets' || kind === 'worldSets') return [doc.id, orgId, doc.novelId, doc.provider || '', JSON.stringify(toChildPayload(kind, doc)), position, doc.createdAt ? new Date(doc.createdAt) : now, doc.updatedAt ? new Date(doc.updatedAt) : now]
  throw new Error(kind)
}

const UPSERT_SQL = {
  chunks: `INSERT INTO novel_chunks (id, org_id, novel_id, idx, content, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1)
           ON CONFLICT (id) DO UPDATE SET
             idx = EXCLUDED.idx, content = EXCLUDED.content, payload = EXCLUDED.payload,
             sort_order = EXCLUDED.sort_order, updated_at = EXCLUDED.updated_at, version = novel_chunks.version + 1`,
  characters: `INSERT INTO novel_characters (id, org_id, novel_id, name, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,1)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = novel_characters.version + 1`,
  entities: `INSERT INTO novel_world_entities (id, org_id, novel_id, name, kind, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, kind = EXCLUDED.kind, payload = EXCLUDED.payload,
             sort_order = EXCLUDED.sort_order, updated_at = EXCLUDED.updated_at, version = novel_world_entities.version + 1`,
  seasons: `INSERT INTO seasons (id, org_id, novel_id, season_no, title, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1)
           ON CONFLICT (id) DO UPDATE SET
             season_no = EXCLUDED.season_no, title = EXCLUDED.title, payload = EXCLUDED.payload,
             sort_order = EXCLUDED.sort_order, updated_at = EXCLUDED.updated_at, version = seasons.version + 1`,
  episodes: `INSERT INTO episodes (id, org_id, novel_id, season_id, episode_no, title, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1)
           ON CONFLICT (id) DO UPDATE SET
             season_id = EXCLUDED.season_id, episode_no = EXCLUDED.episode_no, title = EXCLUDED.title,
             payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = episodes.version + 1`,
  assets: `INSERT INTO novel_asset_images (id, org_id, novel_id, category, name, status, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1)
           ON CONFLICT (id) DO UPDATE SET
             category = EXCLUDED.category, name = EXCLUDED.name, status = EXCLUDED.status,
             payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = novel_asset_images.version + 1`,
  states: `INSERT INTO novel_character_states (id, org_id, novel_id, character_id, episode_no, appearance, equipment, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,1)
           ON CONFLICT (id) DO UPDATE SET
             character_id = EXCLUDED.character_id, episode_no = EXCLUDED.episode_no,
             appearance = EXCLUDED.appearance, equipment = EXCLUDED.equipment,
             payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = novel_character_states.version + 1`,
  characterSets: `INSERT INTO character_sets (id, org_id, novel_id, provider, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,1)
           ON CONFLICT (id) DO UPDATE SET
             provider = EXCLUDED.provider, payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = character_sets.version + 1`,
  worldSets: `INSERT INTO world_sets (id, org_id, novel_id, provider, payload, sort_order, created_at, updated_at, version)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,1)
           ON CONFLICT (id) DO UPDATE SET
             provider = EXCLUDED.provider, payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order,
             updated_at = EXCLUDED.updated_at, version = world_sets.version + 1`,
}

async function main() {
  if (!config.db.url) throw new Error('DATABASE_URL 未配置')
  const data = loadData()
  const client = new Client({ connectionString: config.db.url })
  await client.connect()
  try {
    for (const kind of kinds) {
      const collection = SOURCE_COLLECTIONS[kind]
      if (!collection) throw new Error(`未知 kind：${kind}`)
      const docs = Object.values(data[collection] || {})
      const novelIds = new Set(docs.map((d) => d.novelId).filter(Boolean))
      console.log(`\n[${kind}] source=${docs.length} novels=${novelIds.size}`)
      if (dryRun) {
        console.log(`  [dry] would upsert ${docs.length} rows into ${TABLES[kind]}`)
        continue
      }
      if (!verifyOnly) {
        const now = new Date()
        let ok = 0
        await client.query('BEGIN')
        try {
          for (const [position, doc] of docs.entries()) {
            await client.query(UPSERT_SQL[kind], valuesFor(kind, doc, position, now))
            ok += 1
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw new Error(`${kind} 迁移失败：${error.message}`)
        }
        console.log(`  upserted=${ok}`)
      }
      const { rows } = await client.query(`SELECT * FROM ${TABLES[kind]} WHERE org_id = $1`, [orgId])
      const pgMap = new Map(rows.map((r) => [r.id, r]))
      const mismatches = []
      for (const doc of docs) {
        const row = pgMap.get(doc.id)
        if (!row) {
          mismatches.push(`${doc.id}: missing`)
          continue
        }
        const rebuilt = { ...(row.payload || {}), id: row.id, novelId: row.novel_id }
        if (kind === 'chunks') Object.assign(rebuilt, { index: row.idx, text: row.content })
        if (kind === 'characters') rebuilt.name = row.name
        if (kind === 'entities') Object.assign(rebuilt, { name: row.name, type: row.kind })
        if (kind === 'seasons') Object.assign(rebuilt, { seasonNo: row.season_no, title: row.title })
        if (kind === 'episodes') Object.assign(rebuilt, { seasonId: row.season_id, episodeNo: row.episode_no, title: row.title })
        if (kind === 'assets') Object.assign(rebuilt, { category: row.category, name: row.name, status: row.status })
        if (kind === 'states') Object.assign(rebuilt, { characterId: row.character_id, episodeNo: row.episode_no, appearance: row.appearance, equipment: row.equipment })
        if (kind === 'characterSets' || kind === 'worldSets') rebuilt.provider = row.provider
        if (stableStringify(rebuilt) !== stableStringify(doc)) mismatches.push(`${doc.id}: payload mismatch`)
      }
      console.log(`  verify: pg=${rows.length} source=${docs.length} mismatches=${mismatches.length}`)
      for (const m of mismatches.slice(0, 10)) console.log(`    ! ${m}`)
      if (mismatches.length) process.exitCode = 1
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('[migrate-novel-children]', error.message)
  process.exit(1)
})
