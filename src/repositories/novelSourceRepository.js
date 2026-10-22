import { sql } from 'kysely'
import { DEFAULT_ORG } from './novelRepository.js'

/** 小说正文（cleaned.txt）仓储：PG 单一事实源。 */
export function createNovelSourceRepository(db) {
  function map(row) {
    if (!row) return null
    return {
      novelId: row.novel_id,
      orgId: row.org_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      cleanedText: row.cleaned_text,
      cleanedHash: row.cleaned_hash,
      encoding: row.encoding,
      wordCount: row.word_count,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function get(novelId, { orgId = DEFAULT_ORG } = {}) {
    const row = await db
      .selectFrom('novel_sources')
      .selectAll()
      .where('novel_id', '=', novelId)
      .where('org_id', '=', orgId)
      .executeTakeFirst()
    return map(row)
  }

  async function upsert(novelId, data = {}, { orgId = DEFAULT_ORG } = {}) {
    const cleanedText = String(data.cleanedText || '')
    const now = new Date()
    await db
      .insertInto('novel_sources')
      .values({
        novel_id: novelId,
        org_id: orgId,
        source_type: data.sourceType || 'text',
        source_ref: data.sourceRef || '',
        cleaned_text: cleanedText,
        cleaned_hash: data.cleanedHash || '',
        encoding: data.encoding || 'utf-8',
        word_count: Number.isFinite(data.wordCount) ? data.wordCount : cleanedText.length,
        version: 1,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('novel_id').doUpdateSet({
          source_type: data.sourceType || 'text',
          source_ref: data.sourceRef || '',
          cleaned_text: cleanedText,
          cleaned_hash: data.cleanedHash || '',
          encoding: data.encoding || 'utf-8',
          word_count: Number.isFinite(data.wordCount) ? data.wordCount : cleanedText.length,
          updated_at: now,
          version: sql`novel_sources.version + 1`,
        })
      )
      .execute()
    return get(novelId, { orgId })
  }

  return { get, upsert }
}
