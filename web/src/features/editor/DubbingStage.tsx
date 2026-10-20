import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { AudioPreviewResult, DubbingResult, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import type { SaveState } from './EditorPage'
import { downloadText } from './utils'
import { splitTracks, trackBlockStyle } from './audio'
import { AudioLibrary } from './AudioLibrary'
import { SubtitleStyleCard } from './SubtitleStyleCard'

type Props = {
  project: Project
  onUpdated: (project: Project) => void
  onSaveState: (state: SaveState) => void
}

const LANGUAGES = [
  { id: 'zh', zh: '中文', en: 'Chinese' },
  { id: 'en', zh: '英语', en: 'English' },
  { id: 'ja', zh: '日语', en: 'Japanese' },
]

export function DubbingStage({ project, onUpdated, onSaveState }: Props) {
  const { t } = useLang()
  const voicesQuery = useQuery({
    queryKey: ['dubbing', 'voices'],
    queryFn: () => api.getVoices(),
    staleTime: 300_000,
  })

  const voices = voicesQuery.data?.voices ?? []
  const [language, setLanguage] = useState('zh')
  const [voiceId, setVoiceId] = useState('')
  const [speed, setSpeed] = useState(1)
  const [pauseSeconds, setPauseSeconds] = useState(0.4)
  const [burnSubtitles, setBurnSubtitles] = useState(true)
  const [assignments, setAssignments] = useState<Record<string, string>>(
    project.dialogueAssignments ?? {}
  )
  const [result, setResult] = useState<DubbingResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [selectedBgm, setSelectedBgm] = useState(project.audioConfig?.bgmId ?? '')
  const [selectedSfx, setSelectedSfx] = useState<string[]>(project.audioConfig?.sfxIds ?? [])
  const [mixPreview, setMixPreview] = useState<AudioPreviewResult | null>(null)
  const [audioConfig, setAudioConfig] = useState({
    voiceVolume: project.audioConfig?.voiceVolume ?? 1,
    bgmVolume: project.audioConfig?.bgmVolume ?? 0.3,
    sfxVolume: project.audioConfig?.sfxVolume ?? 0.5,
    bgmFadeIn: project.audioConfig?.bgmFadeIn ?? 2,
    bgmFadeOut: project.audioConfig?.bgmFadeOut ?? 2,
  })

  useEffect(() => {
    if (!voiceId && voices.length > 0) {
      setVoiceId(voices[0].id)
    }
  }, [voices, voiceId])

  useEffect(() => {
    setAssignments(project.dialogueAssignments ?? {})
  }, [project.id])

  const characters = project.characters ?? []
  const lines = useMemo(
    () =>
      (project.shots ?? []).flatMap((shot) =>
        [shot.dialogue, shot.narration].filter((text): text is string => Boolean(text?.trim()))
      ),
    [project.shots]
  )

  const previewMutation = useMutation({
    mutationFn: (text: string) =>
      api.previewVoice({ text, language, voiceId, speed, projectId: project.id }),
    onSuccess: (data) => {
      if (data.audioUrl) {
        setPreviewUrl(data.audioUrl)
      } else {
        showToast(t('试听未返回音频（可能是占位音）', 'Preview returned no audio'), 'error')
      }
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateDubbing({
        projectId: project.id,
        language,
        voiceId,
        speed,
        burnSubtitles,
        dialogueAssignments: assignments,
        pauseSeconds,
      }),
    onSuccess: (data) => {
      setResult(data)
      if (!data.success) {
        showToast(data.message || t('没有可配音的台词', 'No dialogue to dub'), 'error')
      } else {
        showToast(
          t(
            `配音完成：${data.audioTracks.length} 句，${Number(data.totalDuration ?? 0).toFixed(1)}s`,
            `Dubbing ready: ${data.audioTracks.length} lines`
          )
        )
      }
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const saveAssignments = async () => {
    onSaveState('saving')
    try {
      const updated = await api.updateProject(project.id, { dialogueAssignments: assignments })
      onUpdated(updated)
      onSaveState('saved')
      showToast(t('角色音色已保存', 'Voice assignments saved'))
    } catch (error) {
      onSaveState('error')
      showToast((error as Error).message, 'error')
    }
  }

  const saveAudioConfig = async () => {
    onSaveState('saving')
    try {
      const updated = await api.updateProject(project.id, {
        audioConfig: {
          ...(project.audioConfig ?? {}),
          ...audioConfig,
          bgmId: selectedBgm || null,
          sfxIds: selectedSfx,
        },
      })
      onUpdated(updated)
      onSaveState('saved')
      showToast(t('音频配置已保存', 'Audio settings saved'))
    } catch (error) {
      onSaveState('error')
      showToast((error as Error).message, 'error')
    }
  }

  const mixMutation = useMutation({
    mutationFn: () =>
      api.previewAudioMix({
        projectId: project.id,
        language,
        voiceId,
        speed,
      }),
    onSuccess: (preview) => {
      setMixPreview(preview)
      showToast(t('混音预听已生成', 'Mix preview ready'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const tracks = result?.audioTracks ?? []
  const totalDuration = Math.max(result?.totalDuration ?? 0, 0.1)
  const { dialogue: dialogueTracks, narration: narrationTracks } = splitTracks(tracks)
  const bgmId = project.audioConfig?.bgmId

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-dub-head">
        <div>
          <strong>{t('一键配音 + 字幕', 'Dubbing + subtitles')}</strong>
          <div className="dr-hint">
            {t(
              `检测到 ${lines.length} 句台词/旁白；占位音会在结果中标注。`,
              `${lines.length} dialogue/narration lines detected.`
            )}
          </div>
        </div>
      </section>

      <section className="dr-card ed-dub-controls">
        <div className="dr-field">
          <label className="dr-label" htmlFor="dub-language">
            {t('配音语言', 'Language')}
          </label>
          <select
            id="dub-language"
            className="dr-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.zh, item.en)}
              </option>
            ))}
          </select>
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="dub-voice">
            {t('默认音色', 'Default voice')}
          </label>
          <select
            id="dub-voice"
            className="dr-select"
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            disabled={voicesQuery.isLoading}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="dub-speed">
            {t('语速', 'Speed')}
          </label>
          <select
            id="dub-speed"
            className="dr-select"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.8}>{t('慢速', 'Slow')}</option>
            <option value={1}>{t('正常', 'Normal')}</option>
            <option value={1.2}>{t('快速', 'Fast')}</option>
          </select>
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="dub-pause">
            {t('句间停顿', 'Pause')}
          </label>
          <input
            id="dub-pause"
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={pauseSeconds}
            onChange={(event) => setPauseSeconds(Number(event.target.value))}
          />
          <span className="dr-hint">{pauseSeconds.toFixed(1)}s</span>
        </div>
        <label className="ed-check">
          <input
            type="checkbox"
            checked={burnSubtitles}
            onChange={(event) => setBurnSubtitles(event.target.checked)}
          />
          {t('生成并烧录字幕', 'Burn subtitles')}
        </label>
        <button
          type="button"
          className="dr-btn dr-btn-primary"
          disabled={generateMutation.isPending || voices.length === 0}
          onClick={() => generateMutation.mutate()}
        >
          <Icon name="sparkles" size={15} />
          {generateMutation.isPending ? t('生成中…', 'Generating…') : t('生成配音', 'Generate dubbing')}
        </button>
      </section>

      {previewUrl ? (
        <section className="dr-card ed-dub-preview">
          <span className="dr-label">{t('试听', 'Preview')}</span>
          <audio src={previewUrl} controls autoPlay />
        </section>
      ) : null}

      <section className="dr-card ed-dub-characters">
        <div className="ed-section-title-row">
          <strong>{t('角色音色', 'Character voices')}</strong>
          <span className="dr-hint">
            {t('留空则跟随默认音色', 'Empty follows the default voice')}
          </span>
        </div>
        {characters.length === 0 ? (
          <div className="dr-state" style={{ padding: 20 }}>
            {t('暂无角色；可先用默认音色生成，或到「角色」添加。', 'No characters yet.')}
          </div>
        ) : (
          <div className="ed-dub-char-list">
            {characters.map((character) => (
              <div className="ed-dub-char" key={character.id}>
                <span className="ed-dub-char-name">{character.name}</span>
                <select
                  className="dr-select"
                  value={assignments[character.id] ?? ''}
                  onChange={(event) =>
                    setAssignments((current) => ({ ...current, [character.id]: event.target.value }))
                  }
                  aria-label={t(`${character.name} 的音色`, `Voice for ${character.name}`)}
                >
                  <option value="">{t('跟随默认音色', 'Follow default')}</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dr-btn"
                  onClick={() => previewMutation.mutate(t(`你好，我是${character.name}。`, `Hello, I am ${character.name}.`))}
                  disabled={previewMutation.isPending}
                >
                  <Icon name="play" size={14} />
                  {t('试听', 'Preview')}
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="dr-btn" onClick={() => void saveAssignments()}>
            <Icon name="check" size={15} />
            {t('保存角色音色', 'Save voices')}
          </button>
        </div>
      </section>

      <AudioLibrary
        project={project}
        selectedBgm={selectedBgm}
        onSelectBgm={setSelectedBgm}
        selectedSfx={selectedSfx}
        onToggleSfx={(id) =>
          setSelectedSfx((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
          )
        }
      />

      {result ? (
        <section className="dr-card ed-dub-result">
          <div className="ed-section-title-row">
            <strong>{t('配音结果', 'Dubbing result')}</strong>
            <span className="dr-hint">
              {result.ttsProvider ?? '—'} · {tracks.length} {t('句', 'lines')} ·{' '}
              {Number(result.totalDuration ?? 0).toFixed(1)}s
              {result.placeholderVoices ? ` · ${t('包含占位音', 'includes placeholder audio')}` : ''}
            </span>
          </div>

          <div className="ed-audio-lanes">
            <Lane
              label={t('对白', 'Dialogue')}
              tracks={dialogueTracks}
              total={totalDuration}
              empty={t('无对白', 'No dialogue')}
            />
            <Lane
              label={t('旁白', 'Narration')}
              tracks={narrationTracks}
              total={totalDuration}
              empty={t('无旁白', 'No narration')}
            />
            <div className="ed-lane">
              <span className="ed-lane-label">BGM</span>
              <div className="ed-lane-track">
                {bgmId ? (
                  <span className="ed-lane-block is-bgm" style={{ left: 0, width: '100%' }}>
                    {bgmId}
                  </span>
                ) : (
                  <span className="ed-lane-empty">{t('未选择 BGM', 'No BGM selected')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="ed-track-list">
            {tracks.map((track, index) => (
              <div className="ed-track-row" key={`${track.shotIndex}-${index}`}>
                <span className="ed-track-time">
                  {track.startTime.toFixed(1)}–{track.endTime.toFixed(1)}s
                </span>
                <span className="ed-track-text">{track.text}</span>
                <span className="ed-track-meta">
                  {track.type === 'narration' ? t('旁白', 'Narration') : t('对白', 'Dialogue')}
                  {track.placeholder ? ` · ${t('占位音', 'placeholder')}` : ''}
                </span>
                {track.audioUrl ? <audio src={track.audioUrl} controls preload="none" /> : null}
              </div>
            ))}
          </div>

          {result.subtitles?.content ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="dr-btn"
                onClick={() => downloadText(`${project.name}.srt`, result.subtitles?.content ?? '')}
              >
                <Icon name="download" size={15} />
                {t('下载 SRT 字幕', 'Download SRT')}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="dr-card ed-audio-config">
        <div className="ed-section-title-row">
          <strong>{t('三轨音量', 'Track levels')}</strong>
          <span className="dr-hint">
            {t('保存后用于后续合成导出；混音预听在旧版工作台。', 'Saved for export; preview lives in the legacy workbench.')}
          </span>
        </div>
        {[
          { key: 'voiceVolume' as const, label: t('配音', 'Voice') },
          { key: 'bgmVolume' as const, label: 'BGM' },
          { key: 'sfxVolume' as const, label: t('音效', 'SFX') },
        ].map((item) => (
          <div className="ed-volume-row" key={item.key}>
            <span className="ed-volume-label">{item.label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audioConfig[item.key] * 100)}
              onChange={(event) =>
                setAudioConfig((current) => ({ ...current, [item.key]: Number(event.target.value) / 100 }))
              }
              aria-label={item.label}
            />
            <span className="ed-volume-value">{Math.round(audioConfig[item.key] * 100)}%</span>
          </div>
        ))}
        <div className="ed-fade-row">
          <div className="dr-field">
            <label className="dr-label" htmlFor="bgm-fade-in">
              {t('BGM 淡入（秒）', 'BGM fade in (s)')}
            </label>
            <input
              id="bgm-fade-in"
              type="number"
              min={0}
              max={10}
              className="dr-input"
              value={audioConfig.bgmFadeIn}
              onChange={(event) =>
                setAudioConfig((current) => ({ ...current, bgmFadeIn: Number(event.target.value) || 0 }))
              }
            />
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="bgm-fade-out">
              {t('BGM 淡出（秒）', 'BGM fade out (s)')}
            </label>
            <input
              id="bgm-fade-out"
              type="number"
              min={0}
              max={10}
              className="dr-input"
              value={audioConfig.bgmFadeOut}
              onChange={(event) =>
                setAudioConfig((current) => ({ ...current, bgmFadeOut: Number(event.target.value) || 0 }))
              }
            />
          </div>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => void saveAudioConfig()}>
            <Icon name="check" size={15} />
            {t('保存音频配置', 'Save audio settings')}
          </button>
        </div>
      </section>

      <section className="dr-card ed-mix-card">
        <div className="ed-section-title-row">
          <strong>{t('混音预听', 'Mix preview')}</strong>
          <button
            type="button"
            className="dr-btn"
            disabled={mixMutation.isPending}
            onClick={() => mixMutation.mutate()}
          >
            <Icon name="play" size={15} />
            {mixMutation.isPending ? t('生成中…', 'Rendering…') : t('生成预听', 'Generate preview')}
          </button>
        </div>
        <p className="dr-hint">
          {t(
            '使用已保存的音频配置（BGM / 音效 / 音量）生成一段混音预听；请先保存配置。',
            'Uses the saved audio config; save settings first.'
          )}
        </p>
        {mixPreview ? (
          <div className="ed-mix-result">
            <audio controls src={mixPreview.url} />
            <div className="dr-hint">
              {mixPreview.tracks.length} {t('轨', 'tracks')} · {Number(mixPreview.duration).toFixed(1)}s
              {mixPreview.placeholderVoices ? ` · ${t('包含占位音', 'includes placeholder audio')}` : ''}
            </div>
          </div>
        ) : null}
      </section>

      <SubtitleStyleCard project={project} onUpdated={onUpdated} onSaveState={onSaveState} />
    </div>
  )
}

function Lane({
  label,
  tracks,
  total,
  empty,
}: {
  label: string
  tracks: DubbingResult['audioTracks']
  total: number
  empty: string
}) {
  return (
    <div className="ed-lane">
      <span className="ed-lane-label">{label}</span>
      <div className="ed-lane-track">
        {tracks.length === 0 ? (
          <span className="ed-lane-empty">{empty}</span>
        ) : (
          tracks.map((track, index) => (
            <span
              className="ed-lane-block"
              key={`${track.startTime}-${index}`}
              style={trackBlockStyle(track, total)}
              title={track.text}
            />
          ))
        )}
      </div>
    </div>
  )
}
