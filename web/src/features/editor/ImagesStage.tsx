import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { ImageAsset, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'

type Props = {
  project: Project
  onRefresh: () => void
  onNavigateStage: (stage: string) => void
}

const STYLES = [
  { id: 'cinematic', zh: '电影感', en: 'Cinematic' },
  { id: 'realistic', zh: '写实', en: 'Realistic' },
  { id: 'anime', zh: '动漫', en: 'Anime' },
  { id: 'watercolor', zh: '水彩', en: 'Watercolor' },
  { id: 'minimal', zh: '极简', en: 'Minimal' },
]

export function ImagesStage({ project, onRefresh, onNavigateStage }: Props) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState(
    project.platform === 'portrait' ? '9:16' : '16:9'
  )
  const [style, setStyle] = useState('cinematic')
  const [count, setCount] = useState(1)

  const providersQuery = useQuery({
    queryKey: ['images', 'providers'],
    queryFn: () => api.getImageProviders(),
    staleTime: 300_000,
  })
  const assetsQuery = useQuery({
    queryKey: ['images', 'assets', project.id],
    queryFn: () => api.listImageAssets({ projectId: project.id }),
    staleTime: 5_000,
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateImages({
        projectId: project.id,
        prompt: prompt.trim(),
        aspectRatio,
        style,
        count,
      }),
    onSuccess: async (result) => {
      setPrompt('')
      await queryClient.invalidateQueries({ queryKey: ['images', 'assets', project.id] })
      const failed = result.assets.filter((asset) => asset.status === 'failed').length
      showToast(
        failed > 0
          ? t(`已生成 ${result.count} 张，其中 ${failed} 张失败`, `${failed} images failed`)
          : t(`已生成 ${result.count} 张图片`, `${result.count} images generated`),
        failed > 0 ? 'error' : 'success'
      )
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => api.deleteImageAsset(assetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['images', 'assets', project.id] })
      showToast(t('图片已删除', 'Image deleted'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const currentProvider = providersQuery.data?.models.find(
    (model) => model.id === providersQuery.data?.current
  )
  const assets = assetsQuery.data?.items ?? []
  const completedCount = assets.filter((asset) => asset.status === 'completed').length

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-image-head">
        <div>
          <strong>{t('图片生成', 'Image generation')}</strong>
          <div className="dr-hint">
            {t(
              '先生成视觉资产，再作为镜头 / 角色 / 场景参考图进入视频生成。',
              'Generate visuals, then apply them as references for shots, characters, or scenes.'
            )}
          </div>
        </div>
        <span className={`dr-status ${currentProvider?.realGeneration ? 'is-completed' : ''}`}>
          <span className="dr-dot" />
          {currentProvider?.name ?? providersQuery.data?.current ?? '—'}
          {currentProvider?.realGeneration
            ? ` · ${t('真实文生图', 'real generation')}`
            : ` · ${t('本地 Mock 渲染', 'local mock render')}`}
        </span>
      </section>

      <section className="dr-card ed-image-form">
        <div className="dr-field">
          <label className="dr-label" htmlFor="image-prompt">
            {t('画面描述', 'Prompt')}
          </label>
          <textarea
            id="image-prompt"
            className="dr-input"
            style={{ minHeight: 76, padding: '8px 10px', resize: 'vertical' }}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t('例如：雨夜霓虹街头，主角撑伞回望，电影感广角', 'e.g. Neon street in the rain, cinematic wide shot')}
          />
        </div>
        <div className="ed-image-controls">
          <div className="dr-field">
            <label className="dr-label" htmlFor="image-aspect">
              {t('比例', 'Aspect')}
            </label>
            <select
              id="image-aspect"
              className="dr-select"
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value)}
            >
              {['16:9', '9:16', '1:1', '4:3'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="image-style">
              {t('风格', 'Style')}
            </label>
            <select
              id="image-style"
              className="dr-select"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
            >
              {STYLES.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.zh, item.en)}
                </option>
              ))}
            </select>
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="image-count">
              {t('数量', 'Count')}
            </label>
            <select
              id="image-count"
              className="dr-select"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={generateMutation.isPending || !prompt.trim()}
            onClick={() => generateMutation.mutate()}
          >
            <Icon name="sparkles" size={15} />
            {generateMutation.isPending ? t('生成中…', 'Generating…') : t('生成图片', 'Generate')}
          </button>
        </div>
      </section>

      <div className="ed-section-title-row">
        <strong>
          {t('项目图片资产', 'Project assets')}{' '}
          <span className="dr-hint">{completedCount}/{assets.length}</span>
        </strong>
        <button type="button" className="dr-btn" onClick={() => assetsQuery.refetch()}>
          {t('刷新', 'Refresh')}
        </button>
      </div>

      {assetsQuery.isLoading ? (
        <div className="ed-asset-grid">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 240 }} />
          ))}
        </div>
      ) : assetsQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">{t('图片资产加载失败', 'Failed to load assets')}</div>
          <div>{(assetsQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => assetsQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : assets.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 48 }}>
          <div className="dr-state-icon">
            <Icon name="template" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有图片资产', 'No image assets yet')}</div>
          <div>{t('先生成一张图片，再应用到镜头、角色或场景。', 'Generate an image first.')}</div>
        </div>
      ) : (
        <div className="ed-asset-grid">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              project={project}
              onDelete={() => deleteMutation.mutate(asset.id)}
              onApplied={() => {
                onRefresh()
                void queryClient.invalidateQueries({ queryKey: ['images', 'assets', project.id] })
              }}
              onNavigateStage={onNavigateStage}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AssetCard({
  asset,
  project,
  onDelete,
  onApplied,
  onNavigateStage,
}: {
  asset: ImageAsset
  project: Project
  onDelete: () => void
  onApplied: () => void
  onNavigateStage: (stage: string) => void
}) {
  const { t } = useLang()
  const [targetType, setTargetType] = useState<'shot' | 'character' | 'scene'>('shot')
  const [targetId, setTargetId] = useState(
    project.shots?.[0]?.id ?? project.characters?.[0]?.id ?? project.scenes?.[0]?.id ?? ''
  )
  const [imageFailed, setImageFailed] = useState(false)

  const targets =
    targetType === 'shot'
      ? (project.shots ?? []).map((shot, index) => ({
          id: shot.id,
          label: `${t('镜头', 'Shot')} ${index + 1}：${(shot.description || '').slice(0, 16)}`,
        }))
      : targetType === 'character'
        ? (project.characters ?? []).map((character) => ({ id: character.id, label: character.name }))
        : (project.scenes ?? []).map((scene) => ({ id: scene.id, label: scene.name }))

  const applyMutation = useMutation({
    mutationFn: () =>
      api.applyImageAsset(asset.id, { targetType, targetId, projectId: project.id }),
    onSuccess: () => {
      showToast(t('已设为参考图', 'Applied as reference'))
      onApplied()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <article className="dr-card ed-asset-card">
      <div className={`ed-asset-thumb aspect-${(asset.aspectRatio ?? '16:9').replace(':', '-')}`}>
        {asset.status === 'completed' && asset.url && !imageFailed ? (
          <img
            src={asset.url}
            alt={asset.prompt}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="ed-asset-placeholder">
            {imageFailed
              ? t('媒体受保护，登录后查看', 'Protected media; sign in to view')
              : asset.status === 'failed'
                ? t('生成失败', 'Failed')
                : t('生成中…', 'Generating…')}
          </div>
        )}
        <span className={`dr-status ${asset.status === 'completed' ? 'is-completed' : asset.status === 'failed' ? 'is-failed' : 'is-generating'}`}>
          <span className="dr-dot" />
          {asset.status}
        </span>
      </div>
      <div className="ed-asset-body">
        <p className="ed-asset-prompt" title={asset.prompt}>
          {asset.prompt}
        </p>
        <div className="ed-asset-meta">
          {asset.size} · {asset.provider} · {asset.style}
        </div>
        {asset.textRendered === false ? (
          <div className="ed-asset-warning">{t('未渲染文字（字体不可用），图片本身有效', 'Text not rendered')}</div>
        ) : null}
        {asset.errorMessage ? <div className="ed-asset-warning">{asset.errorMessage}</div> : null}
      </div>
      <div className="ed-asset-actions">
        <select
          className="dr-select"
          value={targetType}
          onChange={(event) => {
            const next = event.target.value as 'shot' | 'character' | 'scene'
            setTargetType(next)
            const first =
              next === 'shot'
                ? project.shots?.[0]?.id
                : next === 'character'
                  ? project.characters?.[0]?.id
                  : project.scenes?.[0]?.id
            setTargetId(first ?? '')
          }}
          aria-label={t('应用目标类型', 'Target type')}
        >
          <option value="shot">{t('镜头参考图', 'Shot reference')}</option>
          <option value="character">{t('角色参考图', 'Character reference')}</option>
          <option value="scene">{t('场景参考图', 'Scene reference')}</option>
        </select>
        <select
          className="dr-select"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          aria-label={t('应用目标', 'Target')}
        >
          {targets.length === 0 ? <option value="">{t('暂无可选目标', 'No target')}</option> : null}
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dr-btn dr-btn-primary"
          disabled={asset.status !== 'completed' || !targetId || applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
        >
          {t('应用', 'Apply')}
        </button>
        <button type="button" className="dr-btn dr-btn-danger" onClick={onDelete}>
          {t('删除', 'Delete')}
        </button>
      </div>
      {targetType === 'character' && targets.length === 0 ? (
        <button type="button" className="dr-btn" onClick={() => onNavigateStage('characters')}>
          {t('先去创建角色', 'Create a character first')}
        </button>
      ) : null}
    </article>
  )
}
