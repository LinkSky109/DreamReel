/**
 * 单集批量生成（按季、分批、可续跑）
 * 一季可达 200+ 集，单次同步请求跑完不现实；这里每次只处理一批（limit），
 * 前端循环调用直到 remaining=0，从而既有进度、又可中断续跑。
 */
import { storageService } from './storageService.js'
import { clampInt } from '../utils/coerce.js'
import { runPool } from '../utils/pool.js'
import { generateEpisodeScript } from './episodeScriptService.js'
import { generateEpisodeAssets } from './episodeAssetService.js'
import { getNovelProject } from './novelProjectService.js'

const hasScript = (e) => !!(e.screenplay && (e.screenplay.shots || []).length)
const hasAssets = (e) => !!(e.assets && e.assets.image && e.assets.image.url)

export async function bulkGenerate(novelId, seasonId, opts = {}) {
  const task = opts.task === 'assets' ? 'assets' : 'script'
  const limit = clampInt(opts.limit, 8, 1, 50)
  const concurrency = clampInt(opts.concurrency, 4, 1, 8)
  const onlyMissing = opts.onlyMissing !== false
  const project = getNovelProject(novelId)
  const all = storageService.listEpisodes(novelId, seasonId).sort((a, b) => a.episodeNo - b.episodeNo)
  const isDone = task === 'assets' ? hasAssets : hasScript

  const todo = (onlyMissing ? all.filter((e) => !isDone(e)) : all).slice(0, limit)
  let ok = 0
  let failed = 0
  await runPool(
    todo,
    async (e) => {
      try {
        if (task === 'assets') await generateEpisodeAssets(novelId, e.id, { userId: opts.userId }).then(() => null)
        else await generateEpisodeScript(novelId, e.id, { userId: opts.userId, provider: opts.provider }).then(() => null)
        ok++
      } catch {
        failed++
      }
    },
    concurrency
  )

  const nowAll = storageService.listEpisodes(novelId, seasonId)
  const doneCount = nowAll.filter(isDone).length
  return {
    task,
    processed: todo.length,
    ok,
    failed,
    total: nowAll.length,
    done: doneCount,
    remaining: nowAll.length - doneCount,
    projectStatus: project.status,
  }
}

export default bulkGenerate
