import type { NovelStage } from '../domain/types'

export const NOVEL_STAGES: NovelStage[] = [
  'source',
  'characters',
  'world',
  'series',
  'episodes',
  'assets',
  'compose',
]

const LABELS: Record<NovelStage, { zh: string; en: string }> = {
  source: { zh: '来源', en: 'Source' },
  characters: { zh: '角色', en: 'Characters' },
  world: { zh: '世界观', en: 'World' },
  series: { zh: '分季分集', en: 'Seasons' },
  episodes: { zh: '单集剧本', en: 'Episodes' },
  assets: { zh: '单集资产', en: 'Assets' },
  compose: { zh: '成片', en: 'Compose' },
}

export function novelStageLabel(stage: NovelStage, lang: 'zh' | 'en') {
  return LABELS[stage]?.[lang] ?? stage
}

export function novelStageIndex(stage: NovelStage) {
  return NOVEL_STAGES.indexOf(stage)
}
