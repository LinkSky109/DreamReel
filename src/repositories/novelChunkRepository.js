import { sql } from 'kysely'
import { DEFAULT_ORG } from './novelRepository.js'

/**
 * 小说章节仓储。
 * 章节正文不落库（存 novel_sources.cleaned_text），这里只存偏移与元数据。
 */
export function createNovelChunkRepository(db) {
  function map(row) {
    const payload = row.payload || {}
    return {
      ...payload,
      id: row.id,
      novelId: row.novel_id,
      index: row.idx,
      chapterTitle: row.chapter_title || payload.chapterTitle || '',
      startOffset: row.start_offset ?? payload.startOffset ?? null,
      endOffset: row.end_offset ?? payload.endOffset ?? null,
      wordCount: row.word_count ?? payload.wordCount ?? 0,
      cleanedHash: row.cleaned_hash || payload.cleanedHash || '',
      text: row.content || '',
    }
  }

  async function list(novelId, { orgId = DEFAULT_ORG } = {}) {
    const rows = await db
      .selectFrom('novel_chunks')
      .selectAll()
      .where('novel_id', '=', novelId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .orderBy('idx', 'asc')
      .execute()
    return rows.map(map)
  }

  /** 重摄取时整体替换（章节是派生数据，硬删除旧行，事务内执行）。 */
  async function replaceAll(novelId, chunks = [], { orgId = DEFAULT_ORG } = {}) {
    await db.deleteFrom('novel_chunks').where('novel_id', '=', novelId).where('org_id', '=', orgId).execute()
    if (!chunks.length) return []
    const rows = chunks.map((c, i) => ({
      id: c.id,
      org_id: orgId,
      novel_id: novelId,
      idx: c.index ?? i,
      payload: {
        chapterTitle: c.chapterTitle || '',
        wordCount: c.wordCount ?? (c.text || '').length,
        cleanedHash: c.cleanedHash || '',
        startOffset: c.startOffset ?? null,
        endOffset: c.endOffset ?? null,
      },
      sort_order: c.sortOrder ?? i,
      chapter_title: c.chapterTitle || '',
      start_offset: c.startOffset ?? null,
      end_offset: c.endOffset ?? null,
      cleaned_hash: c.cleanedHash || '',
      word_count: c.wordCount ?? (c.text || '').length,
    }))
    await sql`
      INSERT INTO novel_chunks (
        id, org_id, novel_id, idx, content, payload, sort_order,
        chapter_title, start_offset, end_offset, cleaned_hash, word_count,
        created_at, updated_at
      )
      SELECT
        x.id, x.org_id, x.novel_id, x.idx, '', x.payload, x.sort_order,
        x.chapter_title, x.start_offset, x.end_offset, x.cleaned_hash, x.word_count,
        now(), now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        id text, org_id text, novel_id text, idx integer, payload jsonb, sort_order bigint,
        chapter_title text, start_offset integer, end_offset integer, cleaned_hash text, word_count integer
      )
    `.execute(db)
    return list(novelId, { orgId })
  }

  return { list, replaceAll }
}
