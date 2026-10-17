/**
 * 带重试的 generateJSON：把「空响应 / 解析失败 / 网络错误」都视为可重试。
 * 免费档在持续高压下会返回空串（限流），单一 800ms 重试不够，这里用更长退避多试几次。
 */
export async function generateJSONWithRetry(llm, params, { attempts = 3, backoff = [800, 2500] } = {}) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await llm.generateJSON(params)
      const raw = res && res.raw
      if (typeof raw === 'string' && raw.trim() === '') throw new Error('empty model response')
      return res
    } catch (err) {
      lastErr = err
      if (i < attempts) await new Promise((r) => setTimeout(r, backoff[i - 1] ?? 2500))
    }
  }
  throw lastErr
}

export default generateJSONWithRetry
