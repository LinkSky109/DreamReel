import { describe, expect, it } from 'vitest'
import {
  platformLabel,
  progressOf,
  projectStatus,
  pluralize,
  formatNumber,
  formatValue,
  relativeTime,
  statusLabel,
  totalDuration,
} from '../lib/format'
import type { Project, Shot } from '../domain/types'

function project(shots: Partial<Shot>[]): Project {
  return {
    id: 'p1',
    name: '测试项目',
    description: '',
    coverUrl: '',
    status: 'draft',
    targetDuration: 60,
    style: '',
    platform: 'landscape',
    shots: shots.map((shot, index) => ({
      id: `s${index}`,
      index,
      description: '',
      duration: 5,
      status: 'pending',
      ...shot,
    })),
    tags: [],
    isFavorite: false,
    isArchived: false,
    isPublished: false,
    likeCount: 0,
    viewCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('project formatting', () => {
  it('无镜头 => 未开始', () => {
    expect(projectStatus(project([]))).toBe('empty')
    expect(progressOf(project([]))).toBe(0)
  })

  it('部分完成 => 制作中，并计算百分比', () => {
    const value = project([{ status: 'completed' }, { status: 'pending' }])
    expect(projectStatus(value)).toBe('in-progress')
    expect(progressOf(value)).toBe(50)
  })

  it('全部完成 => 已完成', () => {
    expect(projectStatus(project([{ status: 'completed' }, { status: 'completed' }]))).toBe(
      'completed'
    )
  })

  it('总时长按镜头累加', () => {
    expect(totalDuration(project([{ duration: 5 }, { duration: 7.5 }]))).toBe(12.5)
  })

  it('状态与画幅文案统一', () => {
    expect(statusLabel('generating')).toBe('生成中')
    expect(statusLabel('failed')).toBe('需重试')
    expect(platformLabel('portrait')).toBe('9:16 竖屏')
    expect(platformLabel('landscape')).toBe('16:9 横屏')
  })

  it('英文状态下状态、画幅与相对时间使用英文', () => {
    expect(statusLabel('generating', 'en')).toBe('Generating')
    expect(statusLabel('failed', 'en')).toBe('Retry')
    expect(platformLabel('portrait', 'en')).toBe('9:16 Portrait')
    expect(relativeTime(new Date(Date.now() - 2 * 60_000).toISOString(), 'en')).toBe('2 min ago')
    expect(relativeTime(null, 'en')).toBe('Never')
  })

  it('英文复数与数字格式化', () => {
    expect(pluralize(1, 'shot')).toBe('shot')
    expect(pluralize(2, 'shot')).toBe('shots')
    expect(pluralize(0, 'file')).toBe('files')
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
    expect(formatNumber(1234567, 'zh')).toBe('1,234,567')
    expect(formatValue(['a', 'b'], 'en')).toBe('a, b')
    expect(formatValue(['a', 'b'], 'zh')).toBe('a、b')
    expect(formatValue({ a: 'x', b: 'y' }, 'en')).toBe('a x; b y')
  })
})
