import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { NovelDetail, NovelStoryboardShot } from '../../domain/types'
import { Icon } from '../../components/Icon'
import './StoryboardTab.css'

const SHOT_TYPES = ['远景', '全景', '中景', '近景', '特写']
const CAMERAS = ['固定', '推', '拉', '摇', '移', '跟']

export function StoryboardTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const marks = novel.marks ?? []

  const dataQuery = useQuery({
    queryKey: ['novel-storyboard', novel.id],
    queryFn: () => api.getNovelStoryboard(novel.id),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-storyboard', novel.id] })
    onChanged()
  }

  const generate = useMutation({
    mutationFn: () => api.createNovelStoryboardFromMarks(novel.id),
    onSuccess: (result) => {
      showToast(
        result.created
          ? t(`已从标记生成 ${result.created} 个分镜草稿`, `Created ${result.created} storyboard drafts`)
          : t('标记对应的分镜已存在', 'Drafts already exist for these marks'),
        result.created ? 'success' : 'info'
      )
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (sid: string) => api.deleteNovelStoryboardShot(novel.id, sid),
    onSuccess: () => {
      showToast(t('已删除分镜', 'Shot deleted'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const shots = dataQuery.data ?? []

  const exportJson = () => {
    const payload = {
      novel: { id: novel.id, title: novel.title },
      shots: shots.map((shot, index) => ({
        index: index + 1,
        chapter: shot.chapter + 1,
        chapterTitle: shot.chapterTitle,
        text: shot.text,
        duration: shot.duration,
        shotType: shot.shotType,
        camera: shot.camera,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${novel.title}-storyboard.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (dataQuery.isLoading) return <div className="dr-skeleton" style={{ height: 240 }} />

  return (
    <>
      <div className="dr-storyboard-head">
        <div>
          <h2>{t('改编分镜板', 'Storyboard board')}</h2>
          <p className="dr-novel-note">
            {t(
              '把章节里标记的段落变成可编辑分镜草稿；后续可导出清单或送入制作。',
              'Turn marked paragraphs into editable storyboard drafts, then export or produce.'
            )}
          </p>
        </div>
        <div className="dr-storyboard-actions">
          <span>
            {t('标记', 'Marks')} {marks.length} · {t('分镜', 'Shots')} {shots.length}
          </span>
          <button className="dr-btn dr-btn-primary" type="button" disabled={!marks.length || generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? t('生成中…', 'Generating…') : t('从标记生成', 'Generate from marks')}
          </button>
          <button className="dr-btn" type="button" disabled={!shots.length} onClick={exportJson}>
            <Icon name="download" size={14} />
            {t('导出 JSON', 'Export JSON')}
          </button>
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="dr-card dr-state dr-storyboard-empty">
          <Icon name="film" size={24} />
          <h3>{t('还没有分镜草稿', 'No storyboard drafts yet')}</h3>
          <p>
            {marks.length
              ? t(`已标记 ${marks.length} 段，点「从标记生成」创建分镜草稿。`, `${marks.length} marks ready. Generate drafts.`)
              : t('先在章节阅读器里点击段落，标记为分镜素材。', 'Mark paragraphs in the chapter reader first.')}
          </p>
        </div>
      ) : (
        <div className="dr-storyboard-list">
          {shots.map((shot, index) => (
            <StoryboardCard
              key={shot.id}
              index={index}
              shot={shot}
              onSave={async (patch) => {
                await api.updateNovelStoryboardShot(novel.id, shot.id, patch)
                refresh()
                showToast(t('已保存', 'Saved'), 'success')
              }}
              onDelete={() => remove.mutate(shot.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function StoryboardCard({
  shot,
  index,
  onSave,
  onDelete,
}: {
  shot: NovelStoryboardShot
  index: number
  onSave: (patch: { text: string; duration: number; shotType: string; camera: string }) => Promise<void>
  onDelete: () => void
}) {
  const { t } = useLang()
  const [text, setText] = useState(shot.text)
  const [duration, setDuration] = useState(shot.duration)
  const [shotType, setShotType] = useState(shot.shotType)
  const [camera, setCamera] = useState(shot.camera)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setText(shot.text)
    setDuration(shot.duration)
    setShotType(shot.shotType)
    setCamera(shot.camera)
  }, [shot])

  const save = async () => {
    setBusy(true)
    try {
      await onSave({ text, duration, shotType, camera })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="dr-card dr-storyboard-card">
      <div className="dr-storyboard-card-head">
        <div>
          <strong>#{index + 1}</strong>
          <span>
            {t('第', 'Ch')} {shot.chapter + 1} {t('章', '')} · {t('第', 'Para')} {shot.para + 1} {t('段', '')}
            {shot.chapterTitle ? ` · ${shot.chapterTitle}` : ''}
          </span>
        </div>
        <button className="dr-icon-btn" type="button" aria-label={t('删除分镜', 'Delete shot')} onClick={onDelete}>
          <Icon name="trash" size={14} />
        </button>
      </div>
      <textarea
        className="dr-input dr-storyboard-text"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="dr-storyboard-fields">
        <label>
          <span>{t('时长', 'Duration')}</span>
          <input
            className="dr-input"
            type="number"
            min={1}
            max={60}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </label>
        <label>
          <span>{t('景别', 'Shot')}</span>
          <select className="dr-input" value={shotType} onChange={(event) => setShotType(event.target.value)}>
            {SHOT_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('运镜', 'Camera')}</span>
          <select className="dr-input" value={camera} onChange={(event) => setCamera(event.target.value)}>
            {CAMERAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="dr-btn" type="button" disabled={busy} onClick={save}>
          {busy ? t('保存中…', 'Saving…') : t('保存', 'Save')}
        </button>
      </div>
    </article>
  )
}
