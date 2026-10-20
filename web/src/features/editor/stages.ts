export type StageId =
  | 'script'
  | 'shots'
  | 'generate'
  | 'dubbing'
  | 'edit'
  | 'images'
  | 'characters'
  | 'scenes'
  | 'analysis'
  | 'collab'
  | 'versions'
  | 'settings'

export type StageDef = {
  id: StageId
  zh: string
  en: string
  icon: string
  legacy?: boolean
}

// 规范 §8：五阶段 + 七个扩展标签，顺序固定
export const PRIMARY_STAGES: StageDef[] = [
  { id: 'script', zh: '剧本', en: 'Script', icon: 'file-text' },
  { id: 'shots', zh: '分镜', en: 'Storyboard', icon: 'film' },
  { id: 'generate', zh: '生成', en: 'Generate', icon: 'sparkles' },
  { id: 'dubbing', zh: '配音', en: 'Dubbing', icon: 'message', legacy: true },
  { id: 'edit', zh: '剪辑', en: 'Edit', icon: 'clapper', legacy: true },
]

export const EXTENDED_STAGES: StageDef[] = [
  { id: 'images', zh: '图片', en: 'Images', icon: 'template', legacy: true },
  { id: 'characters', zh: '角色', en: 'Characters', icon: 'user', legacy: true },
  { id: 'scenes', zh: '场景库', en: 'Scenes', icon: 'compass', legacy: true },
  { id: 'analysis', zh: 'AI 影评', en: 'AI Review', icon: 'chart', legacy: true },
  { id: 'collab', zh: '协作', en: 'Collaboration', icon: 'users', legacy: true },
  { id: 'versions', zh: '版本', en: 'Versions', icon: 'file-text', legacy: true },
  { id: 'settings', zh: '项目设置', en: 'Settings', icon: 'settings', legacy: true },
]

export const ALL_STAGES = [...PRIMARY_STAGES, ...EXTENDED_STAGES]

const ALIASES: Record<string, StageId> = {
  video: 'shots',
  storyboard: 'shots',
  generation: 'generate',
  render: 'generate',
  audio: 'dubbing',
  editing: 'edit',
  'smart-edit': 'edit',
  smartEdit: 'edit',
  review: 'analysis',
  collaboration: 'collab',
}

export function normalizeStage(value: string | null | undefined): StageId {
  if (!value) return 'script'
  const mapped = ALIASES[value] ?? value
  return ALL_STAGES.some((stage) => stage.id === mapped) ? (mapped as StageId) : 'script'
}

export function stageLabel(id: StageId, lang: 'zh' | 'en'): string {
  const stage = ALL_STAGES.find((item) => item.id === id)
  if (!stage) return id
  return lang === 'en' ? stage.en : stage.zh
}
