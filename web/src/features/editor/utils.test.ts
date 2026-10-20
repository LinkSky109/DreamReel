import { describe, expect, it } from 'vitest'
import { aspectRatioCss, aspectRatioOf, buildShareUrl, buildShotFromScene, scriptToText, totalDuration } from './utils'
import type { Shot } from '../../domain/types'

function shot(duration: number): Shot {
  return { id: `s${duration}`, index: 0, description: '', duration, status: 'pending' }
}

describe('editor utils', () => {
  it('按项目画幅返回比例', () => {
    expect(aspectRatioOf({ platform: 'landscape' })).toBe('16:9')
    expect(aspectRatioOf({ platform: 'portrait' })).toBe('9:16')
    expect(aspectRatioOf({ platform: 'square' })).toBe('1:1')
    expect(aspectRatioCss({ platform: 'portrait' })).toBe('9 / 16')
  })

  it('镜头总时长累加', () => {
    expect(totalDuration([shot(5), shot(7.5)])).toBe(12.5)
    expect(totalDuration([])).toBe(0)
  })

  it('剧本导出包含梗概、角色、场次与对白', () => {
    const text = scriptToText(
      {
        synopsis: '一个宇航员在火星种花。',
        characters: [{ name: '林', description: '宇航员', personality: '坚定' }],
        shots: [
          {
            description: '火星表面，主角蹲下',
            duration: 5,
            shotType: 'wide',
            cameraMovement: 'slow_push_in',
            dialogue: '林：开始吧。',
          },
        ],
      },
      '火星种花'
    )
    expect(text).toContain('《火星种花》')
    expect(text).toContain('一个宇航员在火星种花。')
    expect(text).toContain('林：宇航员（坚定）')
    expect(text).toContain('S01 火星表面，主角蹲下')
    expect(text).toContain('远景 · 缓慢推进 · 5s')
    expect(text).toContain('对白：林：开始吧。')
  })
})


describe('scene to shot', () => {
  it('场景转为 5s 待生成镜头并带参考图', () => {
    const shot = buildShotFromScene(
      {
        id: 'scene-mars',
        name: '火星表面',
        description: '红色荒漠，橙红色天空',
        referenceImage: '/storage/scenes/mars.png',
      },
      2
    )
    expect(shot.index).toBe(2)
    expect(shot.duration).toBe(5)
    expect(shot.status).toBe('pending')
    expect(shot.sceneId).toBe('scene-mars')
    expect(shot.referenceImages).toEqual(['/storage/scenes/mars.png'])
    expect(shot.description).toContain('火星表面')
    expect(shot.description).toContain('红色荒漠')
  })
})


describe('share url', () => {
  it('生成 hash 分享链接', () => {
    expect(buildShareUrl('https://example.com', '/', 'abc123')).toBe(
      'https://example.com/#/share/abc123'
    )
  })
})
