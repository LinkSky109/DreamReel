#!/usr/bin/env node
/**
 * 预设音色可用性探测：对 VOICE_CATALOG 逐个做一次极短合成，只保留真实可用的。
 * 需要 TTS key（VOLC_TTS_API_KEY 或 SEEDANCE_API_KEY）。
 *
 * 用法：
 *   node scripts/verify-voices.js            # 只探测并打印结果
 *   node scripts/verify-voices.js --json      # 输出 JSON
 */
import 'dotenv/config'
import { randomUUID } from 'crypto'
import { VOICE_CATALOG } from '../src/services/voiceService.js'

const base = process.env.VOLC_TTS_BASE_URL || 'https://openspeech.bytedance.com'
const path = process.env.VOLC_TTS_PATH || '/api/v3/plan/tts/unidirectional'
const resourceId = process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0'
const key = process.env.VOLC_TTS_API_KEY || process.env.SEEDANCE_API_KEY
const asJson = process.argv.includes('--json')

if (!key) {
  console.error('缺少 TTS key（VOLC_TTS_API_KEY / SEEDANCE_API_KEY）')
  process.exit(1)
}

const results = []
for (const v of VOICE_CATALOG) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'X-Api-Key': key,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ req_params: { text: '你好', speaker: v.id, audio_params: { format: 'mp3', sample_rate: 24000 } } }),
      signal: AbortSignal.timeout(60000),
    })
    const t = await res.text()
    const ok = t.includes('"data"')
    let message = ''
    if (!ok) {
      try {
        const j = JSON.parse(t.split('\n').filter(Boolean).pop())
        message = j.message || j.code || ''
      } catch {
        message = t.slice(0, 80)
      }
    }
    results.push({ id: v.id, name: v.name, ok, message })
  } catch (e) {
    results.push({ id: v.id, name: v.name, ok: false, message: e.message })
  }
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2))
} else {
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id}  ${r.name}  ${r.message}`)
  const ok = results.filter((r) => r.ok).length
  console.log(`\n可用 ${ok}/${results.length}`)
}
