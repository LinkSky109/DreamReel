import { describe, expect, it } from 'vitest'
import { planShotBlocks, planVoiceBlocks, splitTracks, subtitlePreviewStyle, trackBlockStyle } from './audio'
import type { DubbingTrack, EditPlan, Shot } from '../../domain/types'

function track(overrides: Partial<DubbingTrack>): DubbingTrack {
  return {
    shotIndex: 0,
    text: '',
    duration: 1,
    startTime: 0,
    endTime: 1,
    ...overrides,
  }
}

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: 's1',
    index: 0,
    description: '',
    duration: 5,
    status: 'completed',
    ...overrides,
  }
}

const plan: EditPlan = {
  id: 'p',
  profile: 'narrative',
  profileName: '叙事',
  targetDuration: 10,
  totalDuration: 10,
  transition: 'cut',
  transitionDuration: 0,
  shots: [
    { shotId: 'a', index: 0, in: 0, out: 4, duration: 4, transition: 'cut', reason: '' },
    { shotId: 'b', index: 1, in: 0, out: 6, duration: 6, transition: 'cut', reason: '' },
  ],
  summary: '',
}

describe('audio helpers', () => {
  it('按总时长换算轨道块位置', () => {
    expect(trackBlockStyle({ startTime: 2, duration: 3 }, 10)).toEqual({
      left: '20%',
      width: '30%',
    })
  })

  it('极短轨道保留最小可见宽度', () => {
    expect(trackBlockStyle({ startTime: 0, duration: 0.01 }, 10).width).toBe('1.5%')
  })

  it('对白与旁白分轨', () => {
    const tracks = [
      track({ text: 'a', type: 'dialogue' }),
      track({ text: 'b', type: 'narration' }),
    ]
    expect(splitTracks(tracks).dialogue).toHaveLength(1)
    expect(splitTracks(tracks).narration).toHaveLength(1)
  })

  it('剪辑方案块按累计时间定位', () => {
    const blocks = planShotBlocks(plan)
    expect(blocks[0]).toMatchObject({ left: '0%', width: '40%' })
    expect(blocks[1]).toMatchObject({ left: '40%', width: '60%' })
  })

  it('只为有台词/旁白的镜头生成配音块', () => {
    const blocks = planVoiceBlocks(plan, [
      shot({ id: 'a', dialogue: '你好' }),
      shot({ id: 'b', narration: '' }),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].shotId).toBe('a')
    expect(blocks[0].text).toBe('你好')
  })
})


describe('subtitle preview style', () => {
  it('生成字号/颜色/阴影样式', () => {
    const css = subtitlePreviewStyle({ fontSize: 32, fontColor: '#FF0000', bold: true, shadow: true })
    expect(css.fontSize).toBe('32px')
    expect(css.color).toBe('#FF0000')
    expect(css.fontWeight).toBe(700)
    expect(String(css.textShadow)).toContain('rgba(0,0,0,0.8)')
  })

  it('无阴影时使用描边', () => {
    const css = subtitlePreviewStyle({ shadow: false, strokeWidth: 3, strokeColor: '#00FF00' })
    expect(css.WebkitTextStroke).toBe('3px #00FF00')
  })
})
