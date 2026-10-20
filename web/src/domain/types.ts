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
  referenceImages?: string[]
  sceneId?: string | null
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
  scenes?: ProjectScene[]
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
  subtitleStyle?: SubtitleStyle
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
  url?: string
  filename?: string
  duration?: number
}

export interface Character {
  id: string
  name: string
  description?: string
  referenceImages?: string[]
  isLocked?: boolean
  projectId?: string
  wardrobe?: string
  makeup?: string
  styling?: string
}

export interface ProjectScene {
  id: string
  name: string
  description?: string
  referenceImages?: string[]
  category?: string
  environmentType?: string
}

export interface SceneItem {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  lighting?: string
  referenceImage?: string | null
  isBuiltin?: boolean
  userId?: string
}

export interface ImageAsset {
  id: string
  projectId?: string | null
  prompt: string
  provider?: string
  model?: string
  size?: string
  width?: number
  height?: number
  aspectRatio?: string
  style?: string
  status: 'generating' | 'completed' | 'failed' | string
  url?: string | null
  textRendered?: boolean
  errorMessage?: string
  createdAt?: string
  completedAt?: string | null
}

export interface ImageProviderInfo {
  current: string
  available?: string[]
  models: { id: string; name?: string; realGeneration?: boolean; configured?: boolean }[]
}

export interface AnalysisDimensions {
  cinematography?: number
  narrative?: number
  pacing?: number
  characterConsistency?: number
}

export interface ShotAnalysis {
  index: number
  comment: string
  score?: number
}

export interface FilmAnalysis {
  projectId?: string
  projectName?: string
  analyzedAt?: string
  overallScore: number
  dimensions: AnalysisDimensions
  strengths?: string[]
  weaknesses?: string[]
  suggestions?: string[]
  objectiveMetrics?: Record<string, number | string>
  shotByShot?: ShotAnalysis[]
  note?: string
}

export interface CommentItem {
  id: string
  projectId?: string
  shotId?: string | null
  parentId?: string | null
  userId?: string
  userName?: string
  content: string
  likes?: string[]
  likeCount?: number
  createdAt: string
  resolved?: boolean
}

export interface ShareSettings {
  projectId?: string
  isPublic: boolean
  allowComments: boolean
  password?: string | null
  shareToken?: string | null
  updatedAt?: string | null
}

export interface ProjectVersion {
  id: string
  projectId?: string
  versionNumber: number
  label: string
  description?: string
  auto?: boolean
  createdAt: string
  shotCount?: number
  completedShots?: number
  characterCount?: number
  hasScript?: boolean
}

export interface VersionCompare {
  version1: { id: string; versionNumber: number; label: string; createdAt: string }
  version2: { id: string; versionNumber: number; label: string; createdAt: string }
  differences: {
    name: boolean
    script: boolean
    style: boolean
    shots: {
      countChanged: boolean
      from: number
      to: number
      completedChanged: boolean
      completedFrom: number
      completedTo: number
    }
    characters: { countChanged: boolean; from: number; to: number }
  }
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface AiQuickAction {
  id: string
  label: string
  prompt: string
}

export interface SfxItem {
  id: string
  name: string
  category?: string
  tags?: string[]
  url?: string
  available?: boolean
  duration?: number
}

export interface AudioPreviewResult {
  previewId: string
  url: string
  duration: number
  tracks: { volume: number }[]
  placeholderVoices?: boolean
  ttsProvider?: string
  generatedAt?: string
}

export interface SubtitleStyle {
  fontFamily?: string
  fontSize?: number
  fontColor?: string
  strokeColor?: string
  strokeWidth?: number
  position?: 'bottom' | 'top' | 'center'
  bold?: boolean
  italic?: boolean
  shadow?: boolean
  bilingual?: boolean
  secondaryLanguage?: string
}

export interface ProviderStageStatus {
  current: string
  available: string[]
  configured: Record<string, boolean>
  model?: string
}

export interface ProviderStatus {
  video: ProviderStageStatus
  llm: ProviderStageStatus
  tts: ProviderStageStatus
  image?: ProviderStageStatus
}

export interface SystemInfo {
  app: { name: string; version: string; env: string; uptime: number; startTime?: string }
  system: {
    platform: string
    arch: string
    nodeVersion: string
    cpuCount: number
    totalMemory: number
    freeMemory: number
    hostname?: string
    loadAvg?: number[]
  }
  process: { pid: number; memoryUsage: { heapUsed: number; rss?: number } }
  storage: { usedMB: number; fileCount: number; path: string }
  config: {
    port: number
    videoProvider?: string
    llmProvider?: string
    ttsProvider?: string
    maxConcurrent?: number
  }
}

export type NotificationPreferences = Record<string, boolean>

export interface SubscriptionPlan {
  id: string
  name: string
  price?: number
  priceMonthly?: number
  priceYearly?: number
  features?: Record<string, unknown>
}

export interface SubscriptionFeatures {
  planId?: string
  plan?: SubscriptionPlan
  status?: string
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
}


export type NovelStage = 'source' | 'characters' | 'world' | 'series' | 'episodes' | 'assets' | 'compose'

export interface NovelCounts {
  chapters: number
  characters: number
  worldEntities?: number
  seasons?: number
  episodes?: number
}

export interface NovelStyle {
  scope?: string
  name?: string
  description?: string
}

export interface NovelReviewStats {
  approved?: number
  revisionRate?: number
}

export interface NovelProject {
  id: string
  title: string
  author?: string
  category?: string
  sourceType?: string
  sourceRef?: string
  style?: NovelStyle
  stage: NovelStage
  status?: string
  counts: NovelCounts
  createdAt: string
  updatedAt: string
}

export interface NovelDetail extends NovelProject {
  reviewStats?: NovelReviewStats
}

export interface NovelCardField {
  key: string
  label: string
  group: string
}

export interface NovelSchema {
  character: { fields: NovelCardField[]; groups: Record<string, string> }
  world?: {
    types: { key: string; label: string }[]
    attributes: Record<string, { key: string; label: string }[]>
  }
}

export interface NovelCharacter {
  id: string
  novelId: string
  name: string
  aliases: string[]
  description?: string
  kind: 'individual' | 'group'
  card: Record<string, string>
  provider: string
  status: 'pending' | 'approved' | string
  reviewEdits?: { field: string; from?: string; to?: string; at?: string }[]
  createdAt: string
  updatedAt: string
}

export interface NovelCharacterSet {
  id: string
  provider: string
  createdAt: string
  count: number
  live: number
  selected: boolean
}

export interface NovelExtractTask {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | string
  ms?: number
  error?: string
}

export interface NovelExtractJob {
  total: number
  done: number
  failed: number
  running: number
  finishedAt?: string | null
  tasks?: NovelExtractTask[]
}

export type NovelExtractJobs = Partial<Record<'characters' | 'world' | 'both', NovelExtractJob>>

export interface NovelWorldEntity {
  id: string
  novelId: string
  type: string
  name: string
  aliases: string[]
  description?: string
  attributes: Record<string, unknown>
  relations: { target: string; kind?: string }[]
  firstChapter?: number | null
  mentions: number
  provider: string
  createdAt: string
}

export interface NovelWorldRelation {
  from: string
  fromName: string
  to: string | null
  toName: string
  kind: string
}

export interface NovelWorldSet {
  id: string
  provider: string
  createdAt: string
  count: number
  live: number
  selected: boolean
}

export interface NovelWorldSummary {
  total: number
  byType: Record<string, number>
  byTypeLabel: Record<string, number>
  relations: number
  missingCoreTypes: string[]
  provider?: string | null
}

export interface NovelIngestResult {
  chapters?: number
  chunks?: number
  [key: string]: unknown
}
