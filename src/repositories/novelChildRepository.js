/**
 * 小说子集合只读仓库（chunks / characters / entities）。
 *
 * 目的：用一套通用实现覆盖三张结构相似的表，避免为每张表复制 CRUD。
 * 迁移期策略与 novels 一致：高频字段提升为列，其余放 payload。
 */

const SPECS = {
  chunks: {
    table: 'novel_chunks',
    order: ['idx', 'asc'],
    toDoc: (row) => {
      const payload = row.payload || {}
      return {
        ...payload,
        id: row.id,
        novelId: row.novel_id,
        index: row.idx,
        chapterTitle: row.chapter_title || payload.chapterTitle || '',
        startOffset: payload.startOffset ?? row.start_offset ?? null,
        endOffset: payload.endOffset ?? row.end_offset ?? null,
        wordCount: payload.wordCount ?? row.word_count ?? 0,
        cleanedHash: payload.cleanedHash ?? row.cleaned_hash ?? '',
        text: row.content,
      }
    },
    fromDoc: (doc) => ({
      id: doc.id,
      novelId: doc.novelId,
      idx: doc.index ?? 0,
      content: doc.text || '',
    }),
  },
  characters: {
    table: 'novel_characters',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({
      ...(row.payload || {}),
      id: row.id,
      novelId: row.novel_id,
      name: row.name,
    }),
    fromDoc: (doc) => ({ id: doc.id, novelId: doc.novelId, name: doc.name || '' }),
  },
  entities: {
    table: 'novel_world_entities',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({
      ...(row.payload || {}),
      id: row.id,
      novelId: row.novel_id,
      name: row.name,
      type: row.kind,
    }),
    fromDoc: (doc) => ({
      id: doc.id,
      novelId: doc.novelId,
      name: doc.name || '',
      kind: doc.type || '',
    }),
  },
  seasons: {
    table: 'seasons',
    order: ['sort_order', 'asc'],
    toDoc: (row) => {
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
        estimatedEpisodes: payload.estimatedEpisodes ?? row.estimated_episodes ?? null,
        planProvider: row.plan_provider || payload.planProvider || '',
        chapterStart: payload.chapterStart ?? row.chapter_start ?? null,
        chapterEnd: payload.chapterEnd ?? row.chapter_end ?? null,
      }
    },
    fromDoc: (doc) => ({ id: doc.id, novelId: doc.novelId, seasonNo: doc.seasonNo ?? 1, title: doc.title || '' }),
  },
  episodes: {
    table: 'episodes',
    order: ['sort_order', 'asc'],
    toDoc: (row) => {
      const payload = row.payload || {}
      return {
        ...payload,
        id: row.id,
        novelId: row.novel_id,
        seasonId: row.season_id,
        episodeNo: row.episode_no,
        title: row.title,
        chapterStart: payload.chapterStart ?? row.chapter_start ?? null,
        chapterEnd: payload.chapterEnd ?? row.chapter_end ?? null,
        startOffset: payload.startOffset ?? row.start_offset ?? null,
        endOffset: payload.endOffset ?? row.end_offset ?? null,
        estimatedSeconds:
          payload.estimatedSeconds ??
          (row.estimated_seconds !== null && row.estimated_seconds !== undefined ? Number(row.estimated_seconds) : null),
        shortSource: payload.shortSource ?? row.short_source ?? false,
        cleanedHash: payload.cleanedHash ?? row.cleaned_hash ?? '',
        outline: row.outline ?? payload.outline ?? null,
        screenplay: row.screenplay ?? payload.screenplay ?? null,
        targetSeconds: payload.targetSeconds ?? row.target_seconds ?? 90,
        status: payload.status ?? row.status ?? 'planned',
        logicalKey: row.logical_key || payload.logicalKey || '',
      }
    },
    fromDoc: (doc) => ({
      id: doc.id,
      novelId: doc.novelId,
      seasonId: doc.seasonId || null,
      episodeNo: doc.episodeNo ?? 1,
      title: doc.title || '',
    }),
  },
  states: {
    table: 'novel_character_states',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({
      ...(row.payload || {}),
      id: row.id,
      novelId: row.novel_id,
      characterId: row.character_id,
      episodeNo: row.episode_no,
      appearance: row.appearance,
      equipment: row.equipment,
    }),
    fromDoc: (doc) => ({
      id: doc.id,
      novelId: doc.novelId,
      characterId: doc.characterId,
      episodeNo: doc.episodeNo,
    }),
  },
  characterSets: {
    table: 'character_sets',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({ ...(row.payload || {}), id: row.id, novelId: row.novel_id, provider: row.provider }),
    fromDoc: (doc) => ({ id: doc.id, novelId: doc.novelId, provider: doc.provider || '' }),
  },
  worldSets: {
    table: 'world_sets',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({ ...(row.payload || {}), id: row.id, novelId: row.novel_id, provider: row.provider }),
    fromDoc: (doc) => ({ id: doc.id, novelId: doc.novelId, provider: doc.provider || '' }),
  },
  assets: {
    table: 'novel_asset_images',
    order: ['sort_order', 'asc'],
    toDoc: (row) => ({
      ...(row.payload || {}),
      id: row.id,
      novelId: row.novel_id,
      category: row.category,
      name: row.name,
      status: row.status,
    }),
    fromDoc: (doc) => ({
      id: doc.id,
      novelId: doc.novelId,
      category: doc.category || '',
      name: doc.name || '',
      status: doc.status || 'draft',
    }),
  },
}

export const CHILD_KINDS = Object.keys(SPECS)

const COLUMN_FIELDS = {
  chunks: ['id', 'novelId', 'index', 'text'],
  characters: ['id', 'novelId', 'name'],
  entities: ['id', 'novelId', 'name', 'type'],
  seasons: ['id', 'novelId', 'seasonNo', 'title'],
  episodes: ['id', 'novelId', 'seasonId', 'episodeNo', 'title'],
  assets: ['id', 'novelId', 'category', 'name', 'status'],
  states: ['id', 'novelId', 'characterId', 'episodeNo', 'appearance', 'equipment'],
  characterSets: ['id', 'novelId', 'provider'],
  worldSets: ['id', 'novelId', 'provider'],
}

export function toChildPayload(kind, doc) {
  const payload = { ...doc }
  for (const field of COLUMN_FIELDS[kind]) delete payload[field]
  return payload
}

export function createPostgresNovelChildRepository(db) {
  return {
    async list(kind, novelId, { orgId = 'default' } = {}) {
      const spec = SPECS[kind]
      if (!spec) throw new Error(`未知子集合：${kind}`)
      const rows = await db
        .selectFrom(spec.table)
        .selectAll()
        .where('novel_id', '=', novelId)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .orderBy(spec.order[0], spec.order[1])
        .execute()
      return rows.map(spec.toDoc)
    },
  }
}

function sortByCreatedAsc(rows) {
  return [...rows].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
}

export function createJsonNovelChildRepository(storage) {
  return {
    async list(kind, novelId) {
      if (kind === 'chunks') {
        return storage.listNovelChunks(novelId).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      }
      if (kind === 'characters') return sortByCreatedAsc(storage.listNovelCharacters(novelId))
      if (kind === 'entities') return sortByCreatedAsc(storage.listWorldEntities(novelId))
      throw new Error(`未知子集合：${kind}`)
    },
  }
}

export function getSpec(kind) {
  return SPECS[kind]
}
