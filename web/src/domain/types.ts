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
  sourceNovelId?: string | null
  sourceStoryboardId?: string | null
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

export interface StatsOverview {
  totalProjects: number
  totalShots: number
  completedShots: number
  completionRate: number
  totalCharacters: number
  totalVideoGenerations: number
  totalExports: number
  totalDubbingMinutes: number
  lastActive?: string | null
}

export interface StatsTrendPoint {
  date: string
  projectsCreated: number
  videoGenerations: number
  exports: number
}

export interface StatsDistributionItem {
  styleId?: string
  platform?: string
  count: number
}

export interface StatsQuota {
  video: { daily: { used: number; limit: number; remaining: number } }
  dubbing: { monthly: { used: number; limit: number; remaining: number } }
}

export interface StatsDashboard {
  overview: StatsOverview
  trend: StatsTrendPoint[]
  styleDistribution: StatsDistributionItem[]
  platformDistribution: StatsDistributionItem[]
  quotaUsage: StatsQuota
  recentProjects: Project[]
}







export interface StorePack {
  id: string
  name: string
  type: 'style_pack' | 'template_pack' | 'audio_pack' | string
  icon?: string
  price: number
  author: string
  description: string
  items: number
}

export interface StoreAsset {
  packId: string
  price: number
  purchasedAt: string
  orderId: string
  pack: StorePack
}

export interface StudioMember {
  userId: string
  name: string
  role: string
  joinedAt?: string
}

export interface StudioWork {
  id: string
  name: string
  coverUrl?: string
  status?: string
  shotCount?: number
}

export interface StudioShow {
  id: string
  title: string
  synopsis?: string
  projectIds: string[]
  createdAt?: string
  works?: StudioWork[]
}

export interface Studio {
  id: string
  name: string
  description: string
  logo?: string
  logoUrl?: string
  stylePositioning: string
  curatorId?: string | null
  curatorName: string
  members: StudioMember[]
  shows: StudioShow[]
  projectIds: string[]
  memberCount: number
  showCount: number
  projectCount: number
  works?: StudioWork[]
  createdAt?: string
  updatedAt?: string
}

export interface CommunityReview {
  id: string
  userId: string
  movieId?: string
  title: string
  content: string
  movieTags: string[]
  storyScore: number
  visualScore: number
  performanceScore: number
  soundtrackScore: number
  overallScore: number
  likeCount: number
  commentCount: number
  createdAt: string
  status: string
}

export interface CommunityLeaderboardItem {
  rank: number
  reviewId: string
  title: string
  userId: string
  overallScore: number
  likeCount: number
  heat: number
  createdAt: string
}

export interface CommunityReport {
  id: string
  reviewId: string
  reporterId: string
  reason: string
  status: string
}

export interface CommunityReviewInput {
  title: string
  movieId?: string
  content?: string
  movieTags?: string[]
  storyScore?: number
  visualScore?: number
  performanceScore?: number
  soundtrackScore?: number
}

export interface TitleSequenceTemplate {
  id: string
  name: string
  visualDescription: string
  musicMood: string
  ffmpeg: {
    duration: number
    resolution: string
    aspectRatio: string
    bgColors: string[]
    titleColor: string
  }
}

export interface TitleSequenceResult {
  templateId: string
  templateName: string
  projectId: string | null
  title: string
  subtitle: string
  duration: number
  videoUrl: string
  filePath: string
  titleRendered: boolean
  audioTrack: boolean
  audio: string
  musicMood: string
}

export interface DirectorProfile {
  id: string
  name: string
  tagline: string
  era: string
  statement: string
  camera: { style: string; moves: string[] }
  pacing: { tempo: string; shotDurationBias: number; description: string }
  performance: { style: string; cues: string[] }
  colorLighting: { palette: string; lighting: string; description: string }
  musicMood: string
}

export interface DirectorGuidance {
  index: number
  cameraMovement: string
  duration: number
  directorGuidance: string
}

export interface ApplyDirectorResult {
  director: DirectorProfile
  project: Project
  guidance: DirectorGuidance[]
  appliedCount: number
  skippedCount: number
  skipped: { index: number; shotId: string }[]
}

export interface Challenge {
  id: string
  title: string
  theme: string
  description: string
  rules: string[]
  reward: string
  startAt: string
  endAt: string
  status: 'active' | 'ended' | string
  entryCount?: number
}

export interface ChallengeEntry {
  id: string
  name: string
  likeCount?: number
  coverUrl?: string
}

export interface ChallengeDetail extends Challenge {
  entries: ChallengeEntry[]
  entryCount: number
}

export interface RecycleBinItem extends Project {
  deletedAt?: string
  deletedBy?: string
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
  challengeId?: string | null
  directorMode?: { enabled?: boolean; directorId?: string | null; appliedAt?: string | null }
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
  visual?: string
  narration?: string
  music?: string
  provider?: string
}

export interface NovelReviewStats {
  approved?: number
  revisionRate?: number
}

export interface NovelStoryboardShot {
  id: string
  chapter: number
  para: number
  chapterTitle?: string
  text: string
  duration: number
  shotType: string
  camera: string
  createdAt?: string
}

export interface NovelMark {
  chapter: number
  para: number
  at?: string
}

export interface NovelListStats {
  words: number
  chapters: number
  characters: number
  worldEntities: number
  approved: number
  revisionRate: number
  progress: number
  status: 'draft' | 'in-progress' | 'completed' | string
}

export interface NovelChunk {
  id: string
  novelId: string
  index: number
  chapterTitle: string
  text?: string
  wordCount?: number
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
  stats?: NovelListStats
  marks?: NovelMark[]
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
  status: 'pending' | 'approved' | 'revision' | string
  note?: string
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
  status?: 'pending' | 'confirmed' | 'revision' | string
  note?: string
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

export interface NovelSeason {
  id: string
  novelId: string
  seasonNo: number
  title: string
  synopsis?: string
  episodeCount: number
  chapterStart: number
  chapterEnd: number
  // LLM 大事件（剧情弧）
  arcName?: string
  goal?: string
  acts?: { setup?: string; confrontation?: string; resolution?: string } | null
  endingHook?: string
  estimatedEpisodes?: number | null
  planProvider?: string
  createdAt?: string
}

export interface NovelEpisodeAssets {
  image?: { url?: string; error?: string }
  video?: { url?: string; error?: string }
}

export interface NovelEpisodeScreenplay {
  totalSeconds?: number
  shots?: { index: number; description?: string; duration?: number; videoUrl?: string }[]
}

export interface NovelEpisodeOutline {
  title?: string
  coreConflict?: string
  synopsis?: string
  cliffhanger?: string
  keyCharacters?: string[]
  provider?: string
  generatedAt?: string
}

export interface NovelEpisode {
  id: string
  novelId: string
  seasonId: string
  episodeNo: number
  chapterIndex?: number | null
  chapterTitle?: string
  title: string
  targetSeconds: number
  // 新旧兼容：旧数据用 sourceFile，新数据用偏移
  sourceFile?: string
  chapterStart?: number | null
  chapterEnd?: number | null
  startOffset?: number | null
  endOffset?: number | null
  estimatedSeconds?: number | null
  shortSource?: boolean
  cleanedHash?: string
  outline?: NovelEpisodeOutline | null
  screenplay?: NovelEpisodeScreenplay | null
  status?: string
  assets?: NovelEpisodeAssets
  createdAt?: string
}

export type NovelAssetCategory =
  | 'character'
  | 'clothing'
  | 'equipment'
  | 'architecture'
  | 'scene'
  | 'prop'
  | 'other'

export interface NovelAsset {
  id: string
  novelId: string
  category: NovelAssetCategory
  name: string
  prompt?: string
  source?: string
  sourceId?: string | null
  characterId?: string | null
  episodeNo?: number | null
  stageLabel?: string
  status: 'draft' | 'generated' | 'failed' | string
  imageUrl?: string | null
  error?: string | null
  provider?: string | null
  createdAt: string
  updatedAt?: string
}

export interface NovelAssetStats {
  total: number
  generated: number
  failed: number
  byCategory: Record<string, number>
}

export interface NovelAssetBulkResult {
  processed: number
  ok: number
  failed: number
  stopped?: boolean
  cancelled?: boolean
  total: number
  withImages: number
  remaining: number
}

export interface NovelSyncScope {
  key: string
  label: string
  dirs?: string[]
}

export interface NovelManifest {
  fileCount: number
  scope: string
  scopeLabel?: string
  files: { rel: string; size: number }[]
}

export interface NovelSyncLedgerEntry {
  backend: string
  targetDir?: string
  url?: string
  remoteDir?: string
  at: string
  uploaded?: number
  copied?: number
  skipped?: number
  failed?: number
}

export interface NovelSyncLedger {
  entries?: NovelSyncLedgerEntry[]
  last?: NovelSyncLedgerEntry | null
}

export interface NovelSyncResult {
  fileCount?: number
  changed?: number
  copied?: number
  uploaded?: number
  skipped?: number
  failed?: unknown[]
  remaining?: number
  remoteCheck?: { ok?: boolean; missing?: unknown[] }
  [key: string]: unknown
}

export interface CloudDriveStatus {
  configured?: boolean
  source?: string
  verified?: boolean
  error?: string
}

export interface QuarkQrSession {
  token: string
  svg: string
  expiresInSec: number
}

export interface QuarkQrStatus {
  state: 'pending' | 'success' | 'failed' | string
  message?: string
}

export interface NovelShot {
  index: number
  description: string
  dialogue?: string
  duration: number
  referenceImages: string[]
  videoUrl?: string | null
}

export interface NovelEpisodeCharacterState {
  id?: string
  novelId?: string
  characterId?: string
  episodeNo?: number
  appearance?: string
  equipment?: string
  injuries?: string
  abilities?: string
  source?: string
  updatedAt?: string
}

export interface NovelEpisodeStateItem {
  characterId: string
  name: string
  exact: NovelEpisodeCharacterState | null
  effective: NovelEpisodeCharacterState | null
}

export interface NovelEpisodeStates {
  episodeNo: number | null
  items: NovelEpisodeStateItem[]
}

export interface NovelVoiceOption {
  id: string
  name: string
  gender?: string
  tags?: string[]
  type?: string
}

export interface NovelVoiceCharacter {
  name: string
  gender?: string
  voice: string
}

export interface NovelVoiceAssignment {
  narrator: string
  catalog: NovelVoiceOption[]
  custom: NovelVoiceOption[]
  characters: NovelVoiceCharacter[]
  map: Record<string, string>
}

export interface NovelVoicePreview {
  audioUrl: string
  duration?: number | string
  provider?: string
}

export interface NovelSeasonAssetSubset {
  seasonId: string
  seasonTitle: string
  chapters: string
  episodes: number
  totalAssets: number
  subsetCount: number
  withImages: number
  remaining: number
}

export interface NovelBulkResult {
  task: 'script' | 'assets'
  processed: number
  ok: number
  failed: number
  total: number
  done: number
  remaining: number
}

export interface NovelSeriesEstimate {
  chapters: number
  totalChars: number
  seasons: number
  episodes: number
  episodeSeconds: number
  charsPerSecond: number
  plannedSeconds: number
  supportSeconds: Record<string, number>
  supportEpisodes: number
}

export interface NovelSeriesPlanResult {
  seasons: number
  episodes: number
  episodesPerSeason: number
  episodeSeconds: number
  charsPerSecond?: number
  tolerance?: number
  provider?: 'llm' | 'heuristic' | string
  buckets?: { below: number; inRange: number; above: number; total: number }
  exceptions?: number
  exceptionSamples?: unknown[]
}

export interface NovelIngestResult {
  chapters?: number
  chunks?: number
  [key: string]: unknown
}

export type TeamRole = 'owner' | 'editor' | 'viewer'

export interface TeamMember {
  userId: string
  name: string
  role: TeamRole
  joinedAt?: string
}

export interface Team {
  id: string
  name: string
  description: string
  ownerId: string
  members: TeamMember[]
  projectIds: string[]
  memberCount: number
  projectCount: number
  createdAt?: string
  updatedAt?: string
}

export interface TeamListResponse {
  total: number
  items: Team[]
}

export interface TeamProjectListResponse {
  total: number
  items: Project[]
}

export interface ApiKeyRecord {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  callCount: number
  revoked?: boolean
}

export interface ApiKeyListResponse {
  total: number
  items: ApiKeyRecord[]
}

export interface ApiKeyCreated extends ApiKeyRecord {
  apiKey: string
}

export interface EnterpriseSsoConfig {
  enabled: boolean
  provider: string
  entryPoint?: string
  issuer?: string
}

export interface EnterpriseSecurityConfig {
  enforceIpAllowlist: boolean
  ipAllowlist: string[]
  exportWatermark: boolean
  watermarkText?: string
  disablePublicSharing: boolean
}

export interface EnterpriseConfig {
  sso: EnterpriseSsoConfig
  passwordPolicy: {
    minLength: number
    requireMixedCase: boolean
    requireNumber: boolean
    requireSymbol: boolean
    sessionTimeoutHours: number
  }
  security: EnterpriseSecurityConfig
  dataResidency: { region: string; retentionDays: number }
}

export interface EnterpriseOverview {
  teams: number
  members: number
  projects: number
  auditEvents: number
  auditStats: Record<string, number>
  config: EnterpriseConfig
}

export interface AuditLogEntry {
  id: string
  actor: string
  action: string
  resourceType: string
  resourceId?: string
  details?: Record<string, unknown>
  ip?: string
  result: 'success' | 'failure' | string
  timestamp: string
}

export interface AuditLogResponse {
  total: number
  items: AuditLogEntry[]
}

export interface EnterpriseDeployment {
  edition: string
  version: string
  deployment: string
  features: string[]
  support: { sla: string; channel: string }
}

export interface GalleryItem {
  id: string
  name: string
  description: string
  coverUrl: string
  previewUrl: string
  authorId: string
  category?: string
  style?: string
  likeCount: number
  viewCount: number
  publishedAt?: string
  challengeId?: string | null
  shotCount: number
}

export interface GalleryListResponse {
  total: number
  items: GalleryItem[]
}

export interface RemixResult {
  success: boolean
  remixId: string
  sourceId: string
  sourceName: string
  copiedShots: number
}

export interface CreatorProfile {
  userId: string
  displayName: string
  bio: string
  avatarUrl?: string
  isPublic: boolean
  socialLinks?: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

export interface CreatorWork {
  id: string
  name: string
  coverUrl?: string
  status: string
  style?: string
  updatedAt?: string
  shotCount: number
}

export interface CreatorStats {
  workCount: number
  totalDuration: number
  completedCount: number
  favoriteCount?: number
  likeCount: number
}

export interface CreatorPageData {
  profile: CreatorProfile
  works: CreatorWork[]
  stats: CreatorStats
  publicUrl: string | null
}

export interface PerformanceEndpointStat {
  endpoint: string
  count: number
  avgTime: number
  errors: number
  errorRate?: number | string
}

export interface PerformanceReport {
  system: {
    cpu: { loadAvg1m: number; loadAvg5m: number; loadAvg15m: number; cores: number; usagePercent: number }
    memory: { totalMB: number; usedMB: number; freeMB: number; usagePercent: number }
    process: { pid: number; uptime: number; memoryUsage: { heapUsed: number; rss?: number } }
    uptime: number
  }
  requests: {
    total: number
    errors: number
    errorRate: number
    avgResponseTime: number
    avgResponseTimeSec: string
    slowestEndpoints: PerformanceEndpointStat[]
    busiestEndpoints: PerformanceEndpointStat[]
  }
  history?: {
    requests: unknown[]
    errors: unknown[]
    responseTime: unknown[]
  }
  timestamp: string
}

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  userId: string
  name: string
  active: boolean
  createdAt: string
  updatedAt?: string
  lastTriggeredAt: string | null
  successCount: number
  failureCount: number
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  url: string
  statusCode: number
  success: boolean
  attempt: number
  timestamp: string
}
