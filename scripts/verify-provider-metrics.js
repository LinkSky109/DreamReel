#!/usr/bin/env node
/**
 * Phase 0 验证入口（独立脚本；**不修改任何现有代码、不影响开发库**）
 *
 * 用途：在把指标埋点接进现有服务之前，先端到端验证 Phase 0 管线是否可用：
 *   真实 mock provider 调用 → usage 归一 → 成本折算 → 指标落盘 → 聚合/对比 → 独立 HTTP 服务
 *
 * 存储隔离：使用 storage/metrics-verify/，不写 storage/data 与 storage/metrics，也不碰开发库。
 *
 * 用法：
 *   node scripts/verify-provider-metrics.js              # 跑验证 + 启动独立 HTTP 服务（Ctrl+C 退出）
 *   node scripts/verify-provider-metrics.js --no-serve   # 只跑验证并退出（用于 CI/快速自检）
 *   node scripts/verify-provider-metrics.js --port 3100  # 指定服务端口
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// 必须在动态 import 业务模块之前设置，config 在导入期读取该环境变量
process.env.STORAGE_PATH = path.resolve(repoRoot, 'storage', 'metrics-verify')
process.env.NODE_ENV = process.env.NODE_ENV || 'development'

const args = process.argv.slice(2)
const noServe = args.includes('--no-serve')
const portIdx = args.indexOf('--port')
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.METRICS_VERIFY_PORT || 3100)

const { normalizeUsage } = await import('../src/services/usageNormalizer.js')
const { estimateCost } = await import('../src/services/costEstimator.js')
const { recordInvocation } = await import('../src/services/metricsRecorder.js')
const {
  readInvocationMetrics,
  metricsDir,
  cleanupOldMetrics,
} = await import('../src/services/metricsStore.js')
const { queryMetrics, compareModels, costSummary } = await import(
  '../src/services/providerMetricsService.js'
)
const { MockLLMProvider } = await import('../src/providers/mockLLMProvider.js')

let failures = 0
function check(name, cond, detail = '') {
  const ok = Boolean(cond)
  if (!ok) failures++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`)
}

function printGroup(title, rows) {
  console.log(`\n${title}`)
  for (const r of rows) {
    console.log(
      `  - ${r.key.padEnd(26)} calls=${r.calls} 成功=${r.successRate ?? '-'} ` +
        `回退=${r.fallbackCalls} p50=${r.p50LatencyMs ?? '-'}ms p95=${r.p95LatencyMs ?? '-'}ms ` +
        `cost=${r.costEstimate ?? 'null'} 缺价=${r.pricingMissingCalls}`
    )
  }
}

async function main() {
  console.log('=== Phase 0 指标管线验证 ===')
  fs.rmSync(metricsDir(), { recursive: true, force: true })
  console.log('验证存储目录:', metricsDir())

  // 1) 真实 mock provider 调用，走完整管线
  console.log('\n[1] 真实 mock LLM 调用 → 归一 → 折算 → 记录')
  const llm = new MockLLMProvider({ provider: 'mock' })
  const t0 = Date.now()
  const result = await llm.generate({ userPrompt: '验证指标管线：一个关于星光的故事' })
  const latencyMs = Date.now() - t0
  const usage = normalizeUsage('text', result.usage)
  const cost = estimateCost('text', { provider: 'mock', model: 'mock', usage })
  recordInvocation({
    stage: 'text',
    taskType: 'script.generate',
    provider: 'mock',
    model: 'mock',
    success: true,
    latencyMs,
    ...usage,
    ...cost,
  })
  check('mock 文本调用产出 usage', usage.totalTokens === 400, `totalTokens=${usage.totalTokens}`)
  check('自托管成本为 0', cost.costEstimate === 0, `cost=${cost.costEstimate}`)
  check('产出结构化 JSON 文本', typeof result.content === 'string' && result.content.includes('synopsis'))

  // 发现：基类 generateJSON 只返回 { data, raw }，丢弃了 provider 的 usage。
  // 接线阶段必须从 generate() 或 provider 侧取 usage，否则文本指标会全为 null。
  const gj = await llm.generateJSON({ userPrompt: 'usage 透出检查' })
  check(
    '[发现] 基类 generateJSON 不返回 usage（接线时需从 generate/provider 侧取）',
    gj.usage === undefined,
    `generateJSON keys=[${Object.keys(gj)}]`
  )

  // 2) 模拟一次「跨供应商回退」：第 1 次失败（timeout），第 2 次成功
  console.log('\n[2] 模拟执行级回退链（失败 → 切换 → 成功）')
  const reqId = 'verify-request-1'
  const failUsage = normalizeUsage('text', null)
  recordInvocation({
    requestId: reqId,
    attempt: 1,
    stage: 'text',
    taskType: 'script.generate',
    provider: 'deepseek',
    model: 'deepseek-chat',
    success: false,
    errorClass: 'timeout',
    latencyMs: 15000,
    ...failUsage,
    ...estimateCost('text', { provider: 'deepseek', model: 'deepseek-chat', usage: failUsage }),
  })
  const raw2 = { prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 800 } }
  const okUsage = normalizeUsage('text', raw2)
  recordInvocation({
    requestId: reqId,
    attempt: 2,
    stage: 'text',
    taskType: 'script.generate',
    provider: 'openai',
    model: 'gpt-4o-mini',
    success: true,
    latencyMs: 2100,
    ...okUsage,
    ...estimateCost('text', { provider: 'openai', model: 'gpt-4o-mini', usage: okUsage }),
  })
  check('缓存命中被识别', okUsage.cacheHit === true && okUsage.cachedTokens === 800)
  check('未录单价 -> cost=null 且 pricingMissing=false',
    estimateCost('text', { provider: 'openai', model: 'gpt-4o-mini', usage: okUsage }).costEstimate === null)

  // 3) 视频（ComfyUI，单视频文件，按秒折算）
  console.log('\n[3] 视频阶段（ComfyUI 自托管，按秒）')
  const vUsage = normalizeUsage('video', null, { unitCount: 5 })
  const vCost = estimateCost('video', { provider: 'comfyui', model: 't2v-default', ctx: { durationSeconds: 5 } })
  recordInvocation({
    stage: 'video',
    taskType: 'shot.video',
    provider: 'comfyui',
    model: 't2v-default',
    success: true,
    latencyMs: 92000,
    ...vUsage,
    ...vCost,
  })
  check('视频单位=second', vUsage.unit === 'second')
  check('ComfyUI 外部货币成本=0', vCost.costEstimate === 0)

  // 4) 读取 + 聚合 + 对比
  console.log('\n[4] 落盘与聚合')
  const all = readInvocationMetrics()
  check('指标已落盘', all.length === 4, `rows=${all.length}`)

  const byProvider = queryMetrics({}, { groupBy: 'provider' })
  check('聚合 calls 总数一致', byProvider.totals.calls === 4, `calls=${byProvider.totals.calls}`)
  check('回退被识别', byProvider.totals.fallbackCalls === 1, `fallback=${byProvider.totals.fallbackCalls}`)

  const cmp = compareModels({ stage: 'text' })
  const costs = costSummary({}, { groupBy: 'provider' })

  printGroup('按 provider 聚合:', byProvider.groups)
  printGroup('文本模型对比:', cmp)
  console.log('\n成本汇总(costSummary): totals.calls=%d cost=%s 缺价调用=%d',
    costs.totals.calls, costs.totals.costEstimate, costs.totals.pricingMissingCalls)

  // 5) 保留期清理（验证不误删新数据）
  const cleanup = cleanupOldMetrics({ rawRetentionDays: 7 })
  check('保留期清理不删新数据', readInvocationMetrics().length === 4, `removed=${cleanup.removed.length}`)

  console.log(`\n=== 验证结果: ${failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`} ===`)

  if (!noServe) {
    await serve()
  } else if (failures > 0) {
    process.exitCode = 1
  }
}

async function serve() {
  const express = (await import('express')).default
  const router = (await import('../src/routes/providerMetrics.js')).default

  const app = express()
  app.get('/', (_req, res) =>
    res.json({
      service: 'DreamReel Provider Metrics (verify)',
      endpoints: [
        '/api/providers/metrics?groupBy=provider',
        '/api/providers/compare?stage=text',
        '/api/providers/costs?groupBy=provider',
      ],
    })
  )
  app.use('/api/providers', router)

  app.listen(PORT, () => {
    console.log(`\n独立验证服务已启动: http://127.0.0.1:${PORT}`)
    console.log('试运行：')
    console.log(`  curl 'http://127.0.0.1:${PORT}/api/providers/metrics?groupBy=provider'`)
    console.log(`  curl 'http://127.0.0.1:${PORT}/api/providers/compare?stage=text'`)
    console.log(`  curl 'http://127.0.0.1:${PORT}/api/providers/costs?groupBy=provider'`)
    console.log('（Ctrl+C 退出；该服务仅验证用，未接入主应用）')
  })
}

main().catch((err) => {
  console.error('验证脚本异常:', err)
  process.exitCode = 1
})
