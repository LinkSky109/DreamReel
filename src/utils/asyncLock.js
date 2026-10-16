/**
 * 进程内异步任务锁：防止同一份长任务（如角色/世界观抽取）被并发重复触发。
 * 单实例开发/生产运行时足够；多实例部署需换成 Redis 等外部锁。
 */
const held = new Map() // key -> { since, meta }

export function tryAcquire(key, meta = {}) {
  if (held.has(key)) return { ok: false, since: held.get(key).since }
  held.set(key, { since: Date.now(), meta })
  return { ok: true }
}

export function release(key) {
  held.delete(key)
}

export function isLocked(key) {
  return held.has(key)
}

export function lockInfo(key) {
  return held.get(key) || null
}

export default { tryAcquire, release, isLocked, lockInfo }
