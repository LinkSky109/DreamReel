export type ProjectStatus = 'draft' | 'in-progress' | 'completed' | 'empty'

export interface ShotVersion {
  videoUrl: string
  prompt?: string
  model?: string
  createdAt?: string
  consistencyScore?: number | null
}

export interface Shot {
  id: string
  projectId?: string
  index: number
  description: string
  duration: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  progress?: number
  videoUrl?: string | null
  imageUrl?: string | null
  locked?: boolean
  versions?: ShotVersion[]
  shotType?: string
  cameraMovement?: string
  dialogue?: string
  narration?: string
  characterIds?: string[]
  consistencyScore?: number | null
  errorMessage?: string
  updatedAt?: string
  createdAt?: string
}

export interface ScriptCharacter {
  name: string
  description?: string
  personality?: string
}

export interface ScriptScene {
  description: string
  dialogue?: string
  narration?: string
  duration?: number
  shotType?: string
  cameraMovement?: string
}

export interface ProjectScript {
  synopsis?: string
  characters?: ScriptCharacter[]
  shots?: ScriptScene[]
}

export interface Character {
  id: string
  name: string
  description?: string
  personality?: string
}

export interface Project {
  id: string
  name: string
  description: string
  coverUrl: string
  status: ProjectStatus | string
  targetDuration: number
  style: string
  platform: 'landscape' | 'portrait' | string
  shots: Shot[]
  script?: ProjectScript
  characters?: Character[]
  audioConfig?: {
    bgmId?: string | null
    sfxIds?: string[]
    voiceVolume?: number
    bgmVolume?: number
    sfxVolume?: number
    bgmFadeIn?: number
    bgmFadeOut?: number
  }
  dialogueAssignments?: Record<string, string>
  editPlan?: EditPlan | null
  tags: string[]
  isFavorite: boolean
  isArchived: boolean
  isPublished: boolean
  likeCount: number
  viewCount: number
  createdAt: string
  updatedAt: string
  lastAccessedAt?: string | null
}

export interface ProjectListResponse {
  total: number
  items: Project[]
}

export interface Template {
  id: string
  name: string
  description: string
  category: string
  icon?: string
  tags?: string[]
  config?: {
    targetDuration?: number
    platform?: string
    style?: string
    [key: string]: unknown
  }
  usageCount?: number
}

export interface TemplateListResponse {
  total: number
  items: Template[]
}

export interface QuotaOverview {
  video: { daily: { used: number; limit: number; remaining: number; resetAt: string } }
  image: { daily: { used: number; limit: number; remaining: number } }
  maxDuration: number
  maxResolution: string
}

export interface CurrentUser {
  id: string
  username: string
  email?: string
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  projectId?: string
}

export interface ModerationLog {
  id: string
  text?: string
  context?: string
  action?: string
  level?: string
  createdAt?: string
  [key: string]: unknown
}

export interface Voice {
  id: string
  name: string
  language?: string
  gender?: string
  provider?: string
}

export interface DubbingTrack {
  shotIndex: number
  text: string
  type?: string
  characterId?: string | null
  voiceId?: string
  audioUrl?: string
  duration: number
  placeholder?: boolean
  provider?: string
  startTime: number
  endTime: number
}

export interface DubbingResult {
  success: boolean
  message?: string
  audioTracks: DubbingTrack[]
  subtitles?: { format: string; content: string; language?: string } | null
  totalDuration?: number
  dialogueAssignments?: Record<string, string>
  burnSubtitles?: boolean
  placeholderVoices?: boolean
  ttsProvider?: string
}

export interface EditProfile {
  id: string
  name: string
  description: string
  rhythmExponent?: number
  transition?: string
  transitionDuration?: number
}

export interface EditPlanShot {
  shotId: string
  index: number
  in: number
  out: number
  duration: number
  transition: string
  reason: string
}

export interface EditPlan {
  id: string
  profile: string
  profileName: string
  targetDuration: number
  totalDuration: number
  transition: string
  transitionDuration: number
  bpm?: number | null
  beatGrid?: number | null
  bgmId?: string | null
  shots: EditPlanShot[]
  summary: string
}

export interface EditRenderResult {
  outputUrl: string
  shotCount?: number
  duration?: number
  transitionApplied?: string
  transitionFallback?: boolean
  hasAudio?: boolean
}

export interface BgmItem {
  id: string
  name: string
  emotion?: string
  bpm?: number
  available?: boolean
}
