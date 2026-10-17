/**
 * 并发池：以 concurrency 个 worker 并发处理 items，保持结果顺序。
 * 用于把「多次 LLM 调用」并行化——每次调用都有 ~3s 固定开销 + 生成时间，
 * 并发能近似线性提升吞吐。
 */
export async function runPool(items, worker, concurrency = 4) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return []
  const results = new Array(list.length)
  const n = Math.max(1, Math.min(concurrency || 1, list.length))
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const i = next++
        if (i >= list.length) return
        results[i] = await worker(list[i], i)
      }
    })
  )
  return results
}

export default runPool
