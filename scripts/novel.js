#!/usr/bin/env node
/**
 * 小说 → 角色 流水线 CLI（Sprint 19）
 *
 * 用法：
 *   node scripts/novel.js create   --title "殖装" [--author 铅笔刀 --category 科幻灵异 --url <bookUrl>]
 *   node scripts/novel.js ingest   <novelId> --url https://www.qishuxia.com/book/34639/ [--max-chapters 100]
 *   node scripts/novel.js ingest   <novelId> --text-file ./book.txt [--max-chapters 100]
 *   node scripts/novel.js extract  <novelId> [--provider heuristic|llm] [--max-chapters 100] [--min-freq 20]
 *   node scripts/novel.js list
 *   node scripts/novel.js show     <novelId>
 *   node scripts/novel.js characters <novelId>
 *   node scripts/novel.js stats    <novelId>
 */

// 关闭 info 日志，保证 stdout 只输出机器可读结果（日志会污染 CLI 输出）
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function print(obj) {
  // eslint-disable-next-line no-console
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2))
}

async function main() {
  const { readFileSync } = await import('node:fs')
  const services = {
    project: await import('../src/services/novelProjectService.js'),
    chunk: await import('../src/services/novelChunkService.js'),
    extract: await import('../src/services/characterExtractionService.js'),
    card: await import('../src/services/characterCardService.js'),
  }

  const [cmd, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)

  switch (cmd) {
    case 'create': {
      if (!flags.title) throw new Error('缺少 --title')
      const project = services.project.createNovelProject({
        title: flags.title,
        author: flags.author || '',
        category: flags.category || '',
        sourceType: flags.url ? 'qishuxia-txt' : 'text',
        sourceRef: flags.url || '',
      })
      print({ id: project.id, title: project.title, dir: project.dir })
      break
    }

    case 'list': {
      print(
        services.project
          .listNovelProjects()
          .map((p) => ({ id: p.id, title: p.title, status: p.status, counts: p.counts }))
      )
      break
    }

    case 'ingest': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      let text
      if (flags['text-file']) text = readFileSync(flags['text-file'], 'utf-8')
      const result = await services.chunk.ingestNovel(id, {
        sourceType: flags.url ? 'qishuxia-txt' : 'text',
        url: flags.url,
        text,
        maxChapters: flags['max-chapters'] ? Number(flags['max-chapters']) : undefined,
        force: flags.force === true,
      })
      print({ novelId: id, chapterCount: result.chapterCount, downloaded: result.downloaded, status: result.project.status })
      break
    }

    case 'extract': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const result = await services.extract.extractCharacters(id, {
        provider: flags.provider,
        maxChapters: flags['max-chapters'] ? Number(flags['max-chapters']) : undefined,
        minFreq: flags['min-freq'] ? Number(flags['min-freq']) : undefined,
      })
      services.card.ensureCards(id)
      print({ novelId: id, provider: result.provider, characters: services.extract.listCharacters(id).length })
      break
    }

    case 'characters': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(
        services.extract.listCharacters(id).map((c) => ({
          name: c.name,
          aliases: c.aliases,
          provider: c.provider,
          status: c.status,
          card: c.card,
        }))
      )
      break
    }

    case 'show': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const p = services.project.getNovelProject(id)
      print({ ...p, chunkCount: services.chunk.listChunks(id).length, reviewStats: services.card.reviewStats(id) })
      break
    }

    case 'stats': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.card.reviewStats(id))
      break
    }

    default:
      print('usage: node scripts/novel.js <create|ingest|extract|list|show|characters|stats> [args]')
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err.message)
  process.exit(1)
})
