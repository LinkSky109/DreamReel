import type { Project, ProjectStatus } from '../domain/types'

export type Lang = 'zh' | 'en'

export function relativeTime(iso?: string | null, lang: Lang = 'zh'): string {
  const en = lang === 'en'
  if (!iso) return en ? 'Never' : '从未'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return en ? 'Just now' : '刚刚'
  if (minutes < 60) return en ? `${minutes} min ago` : `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return en ? `${hours} h ago` : `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return en ? `${days} d ago` : `${days} 天前`
  return date.toLocaleDateString(en ? 'en-US' : 'zh-CN')
}

export function formatDate(value = new Date(), lang: Lang = 'zh'): string {
  const en = lang === 'en'
  return value.toLocaleDateString(en ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: en ? 'short' : 'long',
    day: 'numeric',
    weekday: en ? 'short' : 'long',
  })
}

export function projectStatus(project: Project): ProjectStatus {
  const shots = project.shots ?? []
  if (shots.length === 0) return 'empty'
  const completed = shots.filter((shot) => shot.status === 'completed').length
  return completed === shots.length ? 'completed' : 'in-progress'
}

const STATUS_LABEL: Record<string, { zh: string; en: string }> = {
  empty: { zh: '未开始', en: 'Not started' },
  draft: { zh: '草稿', en: 'Draft' },
  'in-progress': { zh: '制作中', en: 'In progress' },
  completed: { zh: '已完成', en: 'Completed' },
  pending: { zh: '待生成', en: 'Pending' },
  generating: { zh: '生成中', en: 'Generating' },
  failed: { zh: '需重试', en: 'Retry' },
}

export function statusLabel(status: string, lang: Lang = 'zh'): string {
  const item = STATUS_LABEL[status]
  if (!item) return status
  return lang === 'en' ? item.en : item.zh
}

export function statusTone(status: string): string {
  if (status === 'completed') return 'is-completed'
  if (status === 'in-progress' || status === 'generating') return 'is-generating'
  if (status === 'failed') return 'is-failed'
  return ''
}

export function progressOf(project: Project): number {
  const shots = project.shots ?? []
  if (shots.length === 0) return 0
  return Math.round((shots.filter((shot) => shot.status === 'completed').length / shots.length) * 100)
}

export function totalDuration(project: Project): number {
  return (project.shots ?? []).reduce((sum, shot) => sum + (shot.duration || 0), 0)
}

export function platformLabel(platform?: string, lang: Lang = 'zh'): string {
  const en = lang === 'en'
  if (platform === 'portrait') return en ? '9:16 Portrait' : '9:16 竖屏'
  return en ? '16:9 Landscape' : '16:9 横屏'
}

export function enabledShots(project: Project): number {
  return (project.shots ?? []).filter((shot) => shot.status !== 'completed' && !shot.locked).length
}

export function formatValue(value: unknown, lang: Lang = 'zh'): string {
  if (value === null || value === undefined) return ''
  const en = lang === 'en'
  if (Array.isArray(value)) return value.map((item) => formatValue(item, lang)).filter(Boolean).join(en ? ', ' : '、')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key} ${formatValue(val, lang)}`)
      .filter(Boolean)
      .join(en ? '; ' : '；')
  }
  return String(value)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural
}

export function formatNumber(value: number, lang: Lang = 'zh'): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'zh-CN').format(value)
}
