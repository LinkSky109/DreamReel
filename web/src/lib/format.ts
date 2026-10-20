import type { Project, ProjectStatus } from '../domain/types'

export function relativeTime(iso?: string | null): string {
  if (!iso) return '从未'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

export function formatDate(value = new Date()): string {
  return value.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function projectStatus(project: Project): ProjectStatus {
  const shots = project.shots ?? []
  if (shots.length === 0) return 'empty'
  const completed = shots.filter((shot) => shot.status === 'completed').length
  return completed === shots.length ? 'completed' : 'in-progress'
}

const STATUS_LABEL: Record<string, string> = {
  empty: '未开始',
  draft: '草稿',
  'in-progress': '制作中',
  completed: '已完成',
  pending: '待生成',
  generating: '生成中',
  failed: '需重试',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
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

export function platformLabel(platform?: string): string {
  return platform === 'portrait' ? '9:16 竖屏' : '16:9 横屏'
}

export function enabledShots(project: Project): number {
  return (project.shots ?? []).filter((shot) => shot.status !== 'completed' && !shot.locked).length
}
