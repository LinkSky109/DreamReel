/**
 * OpenCode LLM 冒烟：验证 ai + ai-sdk-provider-opencode-sdk 能真实产出文本。
 * 用法：node scripts/llm-smoke.js [modelId]
 */
const explicit = process.argv[2]
const candidates = [
  explicit,
  process.env.OPENCODE_MODEL,
  'opencode/big-pickle',
  'opencode/nemotron-3.5-lightning-free',
  'opencode-go/deepseek-v4.1-flash',
].filter(Boolean)

const { generateText } = await import('ai')
const { opencode } = await import('ai-sdk-provider-opencode-sdk')

let lastErr = null
for (const id of candidates) {
  try {
    const r = await generateText({ model: opencode(id), prompt: '只回答四个字：连接成功' })
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, model: id, text: (r.text || '').trim().slice(0, 60), usage: r.usage }))
    process.exit(0)
  } catch (e) {
    lastErr = e
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: false, model: id, error: String(e.message || e).slice(0, 160) }))
  }
}
// eslint-disable-next-line no-console
console.error('ALL_FAILED:', String(lastErr && lastErr.message).slice(0, 300))
process.exit(1)
