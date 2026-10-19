#!/usr/bin/env node
/**
 * 图片 / TTS Provider 真机冒烟
 *
 * 用应用自身的工厂真实调用一次：
 *   - 图片：走 IMAGE_PROVIDER（你的是 openai 兼容 + 火山 plan 端点），产出图片文件
 *   - TTS ：走 TTS_PROVIDER（你的是 volc），产出音频；未配置 key 则报告阻塞
 * 并检查指标是否落盘。
 *
 * 用法：node scripts/verify-media.js   （隔离存储 storage/media-verify，不碰开发库）
 */

import fs from 'node:fs'
import path from 'node:path'

process.env.STORAGE_PATH = process.env.STORAGE_PATH || path.resolve('.', 'storage', 'media-verify')

const { getImageProvider } = await import('../src/providers/imageProviderFactory.js')
const { getTTSProvider } = await import('../src/providers/ttsProviderFactory.js')
const { readInvocationMetrics, metricsDir } = await import('../src/services/metricsStore.js')

let failures = 0
const check = (name, cond, detail = '') => {
  const ok = Boolean(cond)
  if (!ok) failures++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`)
}

function sniff(buf) {
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'PNG'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'JPEG'
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'WEBP'
  return 'unknown'
}

async function main() {
  console.log('=== 图片 / TTS Provider 冒烟 ===')
  fs.rmSync(metricsDir(), { recursive: true, force: true })

  // ---- 图片 ----
  console.log('\n[图片]')
  const imgProvider = getImageProvider()
  console.log('  provider:', imgProvider.name, '| model:', imgProvider.model, '| baseUrl:', imgProvider.baseUrl)
  const outPath = path.join(process.env.STORAGE_PATH, 'images', 'smoke.png')
  const t0 = Date.now()
  try {
    const res = await imgProvider.generateImage({
      prompt: '一只坐在窗台的橘猫，柔和的晨光，写实摄影风格',
      aspectRatio: '16:9',
      outputPath: outPath,
    })
    check('图片生成返回 filePath', Boolean(res.filePath || outPath))
    check('图片文件已落盘', fs.existsSync(outPath), outPath)
    if (fs.existsSync(outPath)) {
      const buf = fs.readFileSync(outPath)
      check('图片非空且格式可识别', buf.length > 1000 && sniff(buf) !== 'unknown', `${buf.length} bytes / ${sniff(buf)}`)
    }
    console.log(`  耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } catch (e) {
    check('图片生成', false, e.message)
  }

  // ---- TTS ----
  console.log('\n[TTS]')
  const tts = getTTSProvider()
  console.log('  provider:', tts.name)
  if (tts.name === 'volc' && !tts.apiKey) {
    console.log('  ⏸  阻塞：未取到 Agent Plan key（VOLC_TTS_API_KEY / SEEDANCE_API_KEY），跳过真实合成')
  } else {
    const outAudio = path.join(process.env.STORAGE_PATH, 'audio', 'smoke.mp3')
    try {
      const res = await tts.synthesize({ text: '你好，这是 DreamReel 的配音冒烟测试。', language: 'zh', outputPath: outAudio })
      check('TTS 返回 audioUrl', Boolean(res.audioUrl || res.filePath), JSON.stringify(res).slice(0, 120))
    } catch (e) {
      check('TTS 合成', false, e.message)
    }
  }

  // ---- 指标 ----
  console.log('\n[指标]')
  const rows = readInvocationMetrics()
  for (const r of rows) {
    console.log(
      `  - ${r.stage} ${r.provider}:${r.model} success=${r.success} cost=${r.costEstimate} (${r.billingModel}) latency=${r.latencyMs}ms`
    )
  }
  check('至少落盘一条指标', rows.length > 0, `rows=${rows.length}`)

  console.log(`\n=== 结果: ${failures === 0 ? '通过 ✅' : `${failures} 项失败 ❌`} ===`)
  if (failures > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exitCode = 1
})
