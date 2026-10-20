import type { Project, ProjectScript, SceneItem, Shot } from '../../domain/types'

export function aspectRatioOf(project: Pick<Project, 'platform'>): string {
  if (project.platform === 'portrait') return '9:16'
  if (project.platform === 'square') return '1:1'
  return '16:9'
}

export function aspectRatioCss(project: Pick<Project, 'platform'>): string {
  return aspectRatioOf(project).replace(':', ' / ')
}

export const SHOT_TYPE_LABELS: Record<string, string> = {
  'close-up': '特写',
  medium: '中景',
  wide: '远景',
  'extreme-wide': '大远景',
}

export const CAMERA_LABELS: Record<string, string> = {
  static: '固定',
  slow_push_in: '缓慢推进',
  pull_back: '拉远',
  pan_left: '左摇',
  pan_right: '右摇',
  handheld: '手持',
  dolly: '推轨',
  crane: '升降',
}

export function shotTypeLabel(value?: string): string {
  if (!value) return '中景'
  return SHOT_TYPE_LABELS[value] ?? value
}

export function cameraLabel(value?: string): string {
  if (!value) return '固定'
  return CAMERA_LABELS[value] ?? value
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
