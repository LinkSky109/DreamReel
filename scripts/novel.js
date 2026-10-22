#!/usr/bin/env node
/**
 * 小说 → 角色 流水线 CLI（Sprint 19）
 *
 * 用法：
 *   node scripts/novel.js create   --title "殖装" [--author 铅笔刀 --category 科幻灵异 --url <bookUrl>]
 *   node scripts/novel.js ingest   <novelId> --url https://www.qishuxia.com/book/34639/ [--max-chapters 100]
 *   node scripts/novel.js ingest   <novelId> --text-file ./book.txt [--max-chapters 100]
 *   node scripts/novel.js extract  <novelId> [--provider heuristic|llm] [--max-chapters 100] [--chunk-size 8] [--min-freq 20]
 *   node scripts/novel.js list
 *   node scripts/novel.js show     <novelId>
 *   node scripts/novel.js characters <novelId>
 *   node scripts/novel.js stats    <novelId>
 *   node scripts/novel.js sync     <novelId> --backend local|webdav|quark [--target <dir>] [--remote-dir <sub>] [--scope deliverables|media|all] [--dry-run] [--full]
 *   node scripts/novel.js ledger   <novelId>
 *   node scripts/novel.js quark-login [--timeout 300] [--file storage/.quark-cookie]
 *   node scripts/novel.js quark-check
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
    episodeStore: await import('../src/services/novelEpisodeStore.js'),
    epScript: await import('../src/services/episodeScriptService.js'),
    epAsset: await import('../src/services/episodeAssetService.js'),
    compose: await import('../src/services/episodeComposeService.js'),
    sync: await import('../src/services/novelSyncService.js'),
    handoff: await import('../src/services/episodeHandoffService.js'),
    world: await import('../src/services/worldbuildingService.js'),
  }

  const [cmd, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)

  switch (cmd) {
    case 'create': {
      if (!flags.title) throw new Error('缺少 --title')
      const project = await services.project.createNovelProject({
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
        chunkSize: flags['chunk-size'] ? Number(flags['chunk-size']) : undefined,
        maxChars: flags['max-chars'] ? Number(flags['max-chars']) : undefined,
        minFreq: flags['min-freq'] ? Number(flags['min-freq']) : undefined,
      })
      await services.card.ensureCards(id)
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
      const result = await services.series.planSeries(id, {
        episodeSeconds: flags['episode-seconds'] ? Number(flags['episode-seconds']) : undefined,
        episodesPerSeason: flags['episodes-per-season'] ? Number(flags['episodes-per-season']) : undefined,
        charsPerSecond: flags['chars-per-second'] ? Number(flags['chars-per-second']) : undefined,
        maxChapters: flags['max-chapters'] ? Number(flags['max-chapters']) : undefined,
        tolerance: flags.tolerance ? Number(flags.tolerance) : undefined,
        useLLM: flags['no-llm'] ? false : flags['use-llm'] ? true : undefined,
        provider: flags.provider,
        force: flags.force === true,
      })
      print(result)
      break
    }

    case 'seasons': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(
        (await services.episodeStore.listSeasons(id)).map((s) => ({
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
      const list = await services.episodeStore.listEpisodes(id, positional[1])
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
      const scope = services.sync.resolveScope(flags.scope)
      const files = services.sync.buildManifest(id, { scope: scope.key }).map((f) => ({ rel: f.rel, size: f.size }))
      print({ scope: scope.key, scopeLabel: scope.label, fileCount: files.length, files: files.slice(0, 20) })
      break
    }

    case 'sync': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      const backend = flags.backend || 'local'
      const onlyChanged = flags['full'] !== true
      const scope = flags.scope
      if (backend === 'local') {
        print(await services.sync.syncNovel(id, {
          backend: 'local',
          targetDir: flags.target,
          dryRun: flags['dry-run'] === true,
          onlyChanged,
          scope,
        }))
      } else if (backend === 'webdav') {
        print(await services.sync.syncToWebdav(id, {
          dryRun: flags['dry-run'] === true,
          onlyChanged,
          onConflict: flags['on-conflict'] || 'overwrite',
          scope,
          remoteDir: flags['remote-dir'],
          url: flags.url,
        }))
      } else if (backend === 'quark') {
        print(await services.sync.syncToQuark(id, {
          dryRun: flags['dry-run'] === true,
          onlyChanged,
          onConflict: flags['on-conflict'] || 'overwrite',
          scope,
          remoteDir: flags['remote-dir'],
        }))
      } else {
        throw new Error(`unknown backend: ${backend}`)
      }
      break
    }

    case 'quark-login': {
      const { QuarkAuth, saveCookie } = await import('../src/services/quarkAuth.js')
      const { encodeQr, renderTerminal } = await import('../src/utils/qrcode.js')
      const { writeQrPng, writeQrSvg } = await import('../src/utils/qrImage.js')
      const { QuarkClient } = await import('../src/services/quarkClient.js')
      const config = (await import('../src/config/index.js')).default
      const timeoutMs = flags.timeout ? Number(flags.timeout) * 1000 : 300000

      const auth = new QuarkAuth()
      const session = await auth.createQrSession()
      const qr = encodeQr(session.qrUrl, { ec: 'M' })

      // 本地生成图片（不经过任何在线二维码服务，避免泄露登录 token）
      const outDir = flags['out-dir'] || config.storage.path
      const pngPath = writeQrPng(qr.modules, flags.png || `${outDir}/quark-login-qr.png`, { scale: 8, border: 4 })
      const svgPath = writeQrSvg(qr.modules, flags.svg || `${outDir}/quark-login-qr.svg`, { scale: 8, border: 4 })

      console.log(`二维码图片：\n  PNG: ${pngPath}\n  SVG: ${svgPath}\n`)
      if (flags.open !== false && process.platform === 'darwin') {
        try {
          const { spawnSync } = await import('node:child_process')
          spawnSync('open', [pngPath])
              console.log('已用系统默认程序打开 PNG，请用夸克 App 扫码。\n')
        } catch {
          /* 打不开就靠路径手动打开 */
        }
      }
      if (flags.ascii) {
          console.log(renderTerminal(qr.modules))
      }
      console.log(`\n链接（手机打开亦可）：${session.qrUrl}\n等待扫码…`)

      const result = await auth.waitForScan(session, {
        timeoutMs,
        onPoll: (state) => {
          if (state === 'pending') process.stdout.write('.')
        },
      })
      process.stdout.write('\n')

      // 用拿到的 cookie 验证一次：能列出根目录才算登录可用
      const client = new QuarkClient({ ...config.quark, cookie: result.cookie })
      const probe = await client.checkAuth()
      const file = saveCookie(result.cookie, flags.file || config.quark.cookieFile)
      print({ ok: true, cookieSavedTo: file, cookieLength: result.cookie.length, canListRoot: probe.ok })
      break
    }

    case 'quark-check': {
      const { QuarkClient } = await import('../src/services/quarkClient.js')
      const { loadCookie } = await import('../src/services/quarkAuth.js')
      const config = (await import('../src/config/index.js')).default
      const cookie = flags.cookie || config.quark.cookie || loadCookie(config.quark.cookieFile)
      if (!cookie) throw new Error('缺少 cookie：先 `quark-login` 扫码，或设置 QUARK_COOKIE')
      const client = new QuarkClient({ ...config.quark, cookie })
      const info = await client.checkAuth()
      print({ ...info, cookieSource: flags.cookie ? 'flag' : config.quark.cookie ? 'env' : 'file' })
      break
    }

    case 'ledger': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.sync.getSyncState(id))
      break
    }

    case 'handoff': {
      const id = positional[0]
      const eid = positional[1]
      if (!id || !eid) throw new Error('用法：handoff <novelId> <episodeId>')
      const r = await services.handoff.exportHandoff(id, eid, { modelHint: flags['model-hint'] })
      print({ dir: r.dir, refs: r.refs })
      break
    }

    case 'handoff-import': {
      const id = positional[0]
      const eid = positional[1]
      const file = positional[2]
      if (!id || !eid || !file) throw new Error('用法：handoff-import <novelId> <episodeId> <file.mp4>')
      print(await services.handoff.importHandoffResult(id, eid, file))
      break
    }

    case 'handoff-list': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(await services.handoff.listHandoff(id))
      break
    }

    case 'world': {
      const id = positional[0]
      if (!id) throw new Error('用法：world <novelId> [--provider llm|heuristic] [--max-chapters N] [--chunk-size N]')
      const r = await services.world.extractWorld(id, {
        provider: flags.provider,
        maxChapters: flags['max-chapters'] ? Number(flags['max-chapters']) : undefined,
        chunkSize: flags['chunk-size'] ? Number(flags['chunk-size']) : undefined,
      })
      print({ provider: r.provider, entities: r.entities, summary: r.summary })
      break
    }

    case 'world-show': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.world.summarize(id))
      break
    }

    case 'world-entities': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.world.listEntities(id, positional[1]).map((e) => ({ type: e.type, name: e.name, aliases: e.aliases, mentions: e.mentions })))
      break
    }

    case 'world-relations': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.world.listRelations(id))
      break
    }

    case 'advance': {
      const id = positional[0]
      if (!id) throw new Error('用法：advance <novelId> [--to <stage>]')
      const p = await services.project.advanceStage(id, flags.to)
      print({ stage: p.stage })
      break
    }

    case 'characters-sets': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.extract.listCharacterSets(id))
      break
    }

    case 'characters-select': {
      const id = positional[0]
      const setId = positional[1]
      if (!id || !setId) throw new Error('用法：characters-select <novelId> <setId>')
      print({ selectedCharacterSet: (await services.extract.selectCharacterSet(id, setId)).selectedCharacterSet })
      break
    }

    case 'world-sets': {
      const id = positional[0]
      if (!id) throw new Error('缺少 <novelId>')
      print(services.world.listWorldSets(id))
      break
    }

    case 'world-select': {
      const id = positional[0]
      const setId = positional[1]
      if (!id || !setId) throw new Error('用法：world-select <novelId> <setId>')
      print({ selectedWorldSet: (await services.world.selectWorldSet(id, setId)).selectedWorldSet })
      break
    }

    default:
      print('usage: node scripts/novel.js <create|ingest|extract|list|show|characters|characters-sets|characters-select|stats|style|plan|seasons|episodes|script|assets|compose|manifest|sync|ledger|quark-login|quark-check|handoff|handoff-import|handoff-list|world|world-show|world-entities|world-relations|world-sets|world-select|advance> [args]')
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err.message)
  process.exit(1)
})
