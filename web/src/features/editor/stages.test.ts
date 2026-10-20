import { describe, expect, it } from 'vitest'
import { ALL_STAGES, EXTENDED_STAGES, PRIMARY_STAGES, normalizeStage, stageLabel } from './stages'

describe('editor stages', () => {
  it('固定 5 + 7 阶段', () => {
    expect(PRIMARY_STAGES.map((stage) => stage.id)).toEqual([
      'script',
      'shots',
      'generate',
      'dubbing',
      'edit',
    ])
    expect(EXTENDED_STAGES).toHaveLength(7)
    expect(ALL_STAGES).toHaveLength(12)
  })

  it('兼容旧 tab 别名', () => {
    expect(normalizeStage('video')).toBe('shots')
    expect(normalizeStage('audio')).toBe('dubbing')
    expect(normalizeStage('generation')).toBe('generate')
    expect(normalizeStage('unknown-tab')).toBe('script')
  })

  it('中英文阶段名', () => {
    expect(stageLabel('shots', 'zh')).toBe('分镜')
    expect(stageLabel('shots', 'en')).toBe('Storyboard')
  })
})


describe('migration status', () => {
  it('所有 12 个阶段均已迁移，无默认 legacy 阶段', () => {
    expect(ALL_STAGES.filter((stage) => stage.legacy)).toHaveLength(0)
  })
})
