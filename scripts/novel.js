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
    style: await import('../src/services/novelStyleService.js'),
    series: await import('../src/services/seriesPlannerService.js'),
    epScript: await import('../src/services/episodeScriptService.js'),
    epAsset: await import('../src/services/episodeAssetService.js'),
    compose: await import('../src/services/episodeComposeService.js'),
    sync: await import('../src/services/novelSyncService.js'),
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
        maxChars: flags['max-chars'] ? Number(flags['max-chars']) : undefined,
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

    case 'style': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const project = await services.style.generateStyle(id)
      print(project.style)
      break
    }

    case 'plan': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const result = services.series.planSeries(id, {
        episodeSeconds: flags['episode-seconds'] ? Number(flags['episode-seconds']) : undefined,
        episodesPerSeason: flags['episodes-per-season'] ? Number(flags['episodes-per-season']) : undefined,
        charsPerSecond: flags['chars-per-second'] ? Number(flags['chars-per-second']) : undefined,
        maxChapters: flags['max-chapters'] ? Number(flags['max-chapters']) : undefined,
      })
      print(result)
      break
    }

    case 'seasons': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(
        services.series.listSeasons(id).map((s) => ({
          seasonNo: s.seasonNo,
          title: s.title,
          episodeCount: s.episodeCount,
          chapterRange: `${s.chapterStart}-${s.chapterEnd}`,
        }))
      )
      break
    }

    case 'episodes': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const list = services.series.listEpisodes(id, positional[1])
      print({
        count: list.length,
        sample: list.slice(0, 5).map((e) => ({ episodeNo: e.episodeNo, title: e.title, targetSeconds: e.targetSeconds, status: e.status })),
      })
      break
    }

    case 'script': {
      const id = positional[0]
      const eid = positional[1]
      if (!id || !eid) throw new Error('用法：script <novelId> <episodeId> [--provider heuristic|llm]')
      const ep = await services.epScript.generateEpisodeScript(id, eid, { provider: flags.provider })
      print({
        episodeId: ep.id,
        episodeNo: ep.episodeNo,
        title: ep.title,
        scriptProvider: ep.scriptProvider,
        totalSeconds: ep.screenplay.totalSeconds,
        shots: ep.screenplay.shots.length,
      })
      break
    }

    case 'assets': {
      const id = positional[0]
      const eid = positional[1]
      if (!id || !eid) throw new Error('用法：assets <novelId> <episodeId>')
      const ep = await services.epAsset.generateEpisodeAssets(id, eid, {})
      print({ episodeId: ep.id, status: ep.status, assets: ep.assets })
      break
    }

    case 'compose': {
      const id = positional[0]
      const eid = positional[1]
      if (!id || !eid) throw new Error('用法：compose <novelId> <episodeId>')
      print(await services.compose.composeEpisode(id, eid))
      break
    }

    case 'manifest': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const files = services.sync.buildManifest(id).map((f) => ({ rel: f.rel, size: f.size }))
      print({ fileCount: files.length, files: files.slice(0, 20) })
      break
    }

    case 'sync': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const backend = flags.backend || 'local'
      if (backend === 'local') {
        print(services.sync.syncToLocal(id, flags.target, { dryRun: flags['dry-run'] === true }))
      } else if (backend === 'quark') {
        print(services.sync.syncToQuark(id, { dryRun: flags['dry-run'] !== false }))
      } else {
        throw new Error(`unknown backend: ${backend}`)
      }
      break
    }

    default:
      print('usage: node scripts/novel.js <create|ingest|extract|list|show|characters|stats|style|plan|seasons|episodes|script|assets> [args]')
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err.message)
  process.exit(1)
})
