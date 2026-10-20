import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project } from '../../domain/types'
import { Icon } from '../../components/Icon'

type Props = {
  project: Project
  selectedBgm: string
  onSelectBgm: (id: string) => void
  selectedSfx: string[]
  onToggleSfx: (id: string) => void
}

export function AudioLibrary({
  project,
  selectedBgm,
  onSelectBgm,
  selectedSfx,
  onToggleSfx,
}: Props) {
  const { t } = useLang()
  const [bgmEmotion, setBgmEmotion] = useState('all')
  const [bgmSearch, setBgmSearch] = useState('')
  const [sfxCategory, setSfxCategory] = useState('all')
  const [sfxSearch, setSfxSearch] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  const bgmQuery = useQuery({
    queryKey: ['audio', 'bgm', bgmEmotion, bgmSearch],
    queryFn: () => api.listBgm({ emotion: bgmEmotion, search: bgmSearch }),
    staleTime: 60_000,
  })
  const sfxQuery = useQuery({
    queryKey: ['audio', 'sfx', sfxCategory, sfxSearch],
    queryFn: () => api.listSfx({ category: sfxCategory, search: sfxSearch }),
    staleTime: 60_000,
  })

  const recommendMutation = useMutation({
    mutationFn: () => api.recommendBgm(project.script?.synopsis || project.name),
    onSuccess: (result) => {
      setBgmEmotion(result.emotion)
      const first = result.recommendations[0]
      if (first) onSelectBgm(first.id)
      showToast(t(`AI 推荐情绪：${result.emotionName}`, `Recommended: ${result.emotionName}`))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const emotions = bgmQuery.data?.emotions ?? []
  const categories = sfxQuery.data?.categories ?? []
  const bgmItems = bgmQuery.data?.items ?? []
  const sfxItems = sfxQuery.data?.items ?? []
  const sfxSelected = useMemo(() => new Set(selectedSfx), [selectedSfx])

  return (
    <section className="dr-card ed-audio-library">
      <div className="ed-section-title-row">
        <strong>{t('BGM 与音效', 'BGM & SFX')}</strong>
        <button
          type="button"
          className="dr-btn"
          onClick={() => recommendMutation.mutate()}
          disabled={recommendMutation.isPending}
        >
          <Icon name="sparkles" size={15} />
          {recommendMutation.isPending ? t('推荐中…', 'Recommending…') : t('AI 推荐 BGM', 'Recommend BGM')}
        </button>
      </div>

      <div className="ed-library-block">
        <div className="ed-library-head">
          <span className="dr-label">{t('背景音乐', 'BGM')}</span>
          <span className="dr-hint">
            {selectedBgm ? t('已选择 1 首', '1 selected') : t('未选择', 'None selected')}
          </span>
        </div>
        <div className="ed-library-filters">
          <select
            className="dr-select"
            value={bgmEmotion}
            onChange={(event) => setBgmEmotion(event.target.value)}
            aria-label={t('BGM 情绪', 'BGM emotion')}
          >
            <option value="all">{t('全部情绪', 'All emotions')}</option>
            {emotions.map((emotion) => (
              <option key={emotion.id} value={emotion.id}>
                {emotion.name}
              </option>
            ))}
          </select>
          <input
            className="dr-input"
            value={bgmSearch}
            onChange={(event) => setBgmSearch(event.target.value)}
            placeholder={t('搜索 BGM…', 'Search BGM…')}
            aria-label={t('搜索 BGM', 'Search BGM')}
          />
        </div>
        {bgmQuery.isLoading ? (
          <div className="dr-hint">{t('加载中…', 'Loading…')}</div>
        ) : (
          <div className="ed-library-chips">
            {bgmItems.map((item) => (
              <span className="ed-library-chip" key={item.id}>
                <button
                  type="button"
                  className="dr-chip"
                  aria-pressed={selectedBgm === item.id}
                  disabled={item.available === false}
                  title={item.available === false ? t('文件缺失', 'File missing') : item.name}
                  onClick={() => onSelectBgm(selectedBgm === item.id ? '' : item.id)}
                >
                  {item.name}
                  {item.available === false ? ' ×' : ''}
                </button>
                {item.available !== false && item.url ? (
                  <button
                    type="button"
                    className="dr-icon-btn ed-library-play"
                    aria-label={t(`试听 ${item.name}`, `Preview ${item.name}`)}
                    onClick={() => setPreviewUrl(item.url ?? '')}
                  >
                    <Icon name="play" size={13} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ed-library-block">
        <div className="ed-library-head">
          <span className="dr-label">{t('音效', 'SFX')}</span>
          <span className="dr-hint">
            {t(`已选 ${selectedSfx.length} 个`, `${selectedSfx.length} selected`)}
          </span>
        </div>
        <div className="ed-library-filters">
          <select
            className="dr-select"
            value={sfxCategory}
            onChange={(event) => setSfxCategory(event.target.value)}
            aria-label={t('音效分类', 'SFX category')}
          >
            <option value="all">{t('全部分类', 'All categories')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <input
            className="dr-input"
            value={sfxSearch}
            onChange={(event) => setSfxSearch(event.target.value)}
            placeholder={t('搜索音效…', 'Search SFX…')}
            aria-label={t('搜索音效', 'Search SFX')}
          />
        </div>
        {sfxQuery.isLoading ? (
          <div className="dr-hint">{t('加载中…', 'Loading…')}</div>
        ) : (
          <div className="ed-library-chips">
            {sfxItems.map((item) => (
              <span className="ed-library-chip" key={item.id}>
                <button
                  type="button"
                  className="dr-chip"
                  aria-pressed={sfxSelected.has(item.id)}
                  disabled={item.available === false}
                  title={item.available === false ? t('文件缺失', 'File missing') : item.name}
                  onClick={() => onToggleSfx(item.id)}
                >
                  {item.name}
                </button>
                {item.available !== false && item.url ? (
                  <button
                    type="button"
                    className="dr-icon-btn ed-library-play"
                    aria-label={t(`试听 ${item.name}`, `Preview ${item.name}`)}
                    onClick={() => setPreviewUrl(item.url ?? '')}
                  >
                    <Icon name="play" size={13} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>

      {previewUrl ? (
        <div className="ed-library-preview">
          <audio src={previewUrl} controls autoPlay />
          <button type="button" className="dr-btn" onClick={() => setPreviewUrl('')}>
            {t('停止', 'Stop')}
          </button>
        </div>
      ) : null}
    </section>
  )
}
