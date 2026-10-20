import type { DubbingTrack, EditPlan, EditPlanShot, Shot } from '../../domain/types'

export type BlockStyle = { left: string; width: string }

export function trackBlockStyle(
  track: Pick<DubbingTrack, 'startTime' | 'duration'>,
  total: number
): BlockStyle {
  const safeTotal = total > 0 ? total : 1
  return {
    left: `${(track.startTime / safeTotal) * 100}%`,
    width: `${Math.max((track.duration / safeTotal) * 100, 1.5)}%`,
  }
}

export function splitTracks(tracks: DubbingTrack[]): {
  dialogue: DubbingTrack[]
  narration: DubbingTrack[]
} {
  return {
    dialogue: tracks.filter((track) => track.type !== 'narration'),
    narration: tracks.filter((track) => track.type === 'narration'),
  }
}

export type PlanBlock = {
  shot: EditPlanShot
  left: string
  width: string
}

export function planShotBlocks(plan: EditPlan): PlanBlock[] {
  const total = plan.totalDuration > 0 ? plan.totalDuration : 1
  let cursor = 0
  return plan.shots.map((shot) => {
    const block = {
      shot,
      left: `${(cursor / total) * 100}%`,
      width: `${Math.max((shot.duration / total) * 100, 1.5)}%`,
    }
    cursor += shot.duration
    return block
  })
}

export type VoiceBlock = {
  shotId: string
  text: string
  left: string
  width: string
}

export function planVoiceBlocks(plan: EditPlan, shots: Shot[]): VoiceBlock[] {
  const byId = new Map(shots.map((shot) => [shot.id, shot]))
  return planShotBlocks(plan)
    .map(({ shot, left, width }) => {
      const projectShot = byId.get(shot.shotId)
      const text = projectShot?.dialogue || projectShot?.narration || ''
      if (!text.trim()) return null
      return { shotId: shot.shotId, text, left, width }
    })
    .filter((block): block is VoiceBlock => block !== null)
}
