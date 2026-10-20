import type { Project, ProjectScript, SceneItem, Shot } from '../../domain/types'

export function aspectRatioOf(project: Pick<Project, 'platform'>): string {
  if (project.platform === 'portrait') return '9:16'
  if (project.platform === 'square') return '1:1'
  return '16:9'
}

export function aspectRatioCss(project: Pick<Project, 'platform'>): string {
  return aspectRatioOf(project).replace(':', ' / ')
}

type Label = { zh: string; en: string }

export const SHOT_TYPE_LABELS: Record<string, Label> = {
  'close-up': { zh: '特写', en: 'Close-up' },
  medium: { zh: '中景', en: 'Medium shot' },
  wide: { zh: '远景', en: 'Wide shot' },
  'extreme-wide': { zh: '大远景', en: 'Extreme wide' },
}

export const CAMERA_LABELS: Record<string, Label> = {
  static: { zh: '固定', en: 'Static' },
  slow_push_in: { zh: '缓慢推进', en: 'Slow push-in' },
  pull_back: { zh: '拉远', en: 'Pull back' },
  pan_left: { zh: '左摇', en: 'Pan left' },
  pan_right: { zh: '右摇', en: 'Pan right' },
  handheld: { zh: '手持', en: 'Handheld' },
  dolly: { zh: '推轨', en: 'Dolly' },
  crane: { zh: '升降', en: 'Crane' },
}

function labelOf(map: Record<string, Label>, value: string, lang: 'zh' | 'en'): string {
  const item = map[value]
  return item ? (lang === 'en' ? item.en : item.zh) : value
}

export function shotTypeLabel(value?: string, lang: 'zh' | 'en' = 'zh'): string {
  if (!value) return lang === 'en' ? 'Medium shot' : '中景'
  return labelOf(SHOT_TYPE_LABELS, value, lang)
}

export function cameraLabel(value?: string, lang: 'zh' | 'en' = 'zh'): string {
  if (!value) return lang === 'en' ? 'Static' : '固定'
  return labelOf(CAMERA_LABELS, value, lang)
}

export function totalDuration(shots: Shot[]): number {
  return shots.reduce((sum, shot) => sum + (shot.duration || 0), 0)
}

export function scriptToText(script: ProjectScript, projectName: string): string {
  const lines: string[] = [`《${projectName}》`, '']
  if (script.synopsis) {
    lines.push('【故事梗概】', script.synopsis, '')
  }
  if (script.characters?.length) {
    lines.push('【角色设定】')
    for (const character of script.characters) {
      lines.push(
        `- ${character.name}${character.description ? `：${character.description}` : ''}${
          character.personality ? `（${character.personality}）` : ''
        }`
      )
    }
    lines.push('')
  }
  lines.push(`【分镜表】共 ${script.shots?.length ?? 0} 镜`, '')
  ;(script.shots ?? []).forEach((scene, index) => {
    lines.push(`S${String(index + 1).padStart(2, '0')} ${scene.description}`)
    const meta = [shotTypeLabel(scene.shotType), cameraLabel(scene.cameraMovement), `${scene.duration ?? 5}s`]
    lines.push(`　　${meta.join(' · ')}`)
    if (scene.dialogue) lines.push(`　　对白：${scene.dialogue}`)
    if (scene.narration) lines.push(`　　旁白：${scene.narration}`)
    lines.push('')
  })
  return lines.join('\n')
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}


export function buildShotFromScene(scene: SceneItem, index: number): Shot {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `shot_${Date.now()}_${index}`
  return {
    id,
    index,
    description: scene.description ? `${scene.name}：${scene.description}` : scene.name,
    duration: 5,
    status: 'pending',
    shotType: 'medium',
    cameraMovement: 'static',
    characterIds: [],
    referenceImages: scene.referenceImage ? [scene.referenceImage] : [],
    sceneId: scene.id,
    locked: false,
    versions: [],
  }
}


export function buildShareUrl(origin: string, pathname: string, token: string): string {
  return `${origin}${pathname}#/share/${encodeURIComponent(token)}`
}
