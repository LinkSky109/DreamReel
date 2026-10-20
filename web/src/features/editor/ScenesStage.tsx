import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, SceneItem } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { buildShotFromScene } from './utils'

type Props = {
  project: Project
  onUpdated: (project: Project) => void
  onNavigateStage: (stage: string) => void
}

const CATEGORIES = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'scifi', zh: '科幻', en: 'Sci-fi' },
  { id: 'nature', zh: '自然', en: 'Nature' },
  { id: 'city', zh: '城市', en: 'City' },
  { id: 'indoor', zh: '室内', en: 'Indoor' },
  { id: 'fantasy', zh: '奇幻', en: 'Fantasy' },
]

export function ScenesStage({ project, onUpdated, onNavigateStage }: Props) {
  const { t } = useLang()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [newCategory, setNewCategory] = useState('indoor')
  const [loginRequired, setLoginRequired] = useState(false)

  const scenesQuery = useQuery({
    queryKey: ['scenes', category, search],
    queryFn: () => api.listScenes({ category: category === 'all' ? undefined : category, search }),
    staleTime: 60_000,
  })

  const addShotMutation = useMutation({
    mutationFn: (scene: SceneItem) => {
      const shots = project.shots ?? []
      const next = buildShotFromScene(scene, shots.length)
      return api.updateProject(project.id, { shots: [...shots, next] })
    },
    onSuccess: (updated) => {
      onUpdated(updated)
      showToast(t('已作为 5s 待生成镜头加入分镜', 'Added as a 5s pending shot'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createScene({
        name: name.trim(),
        description: description.trim() || undefined,
        category: newCategory,
      }),
    onSuccess: async () => {
      setName('')
      setDescription('')
      setCreateOpen(false)
      setLoginRequired(false)
      await scenesQuery.refetch()
      showToast(t('自定义场景已创建', 'Custom scene created'))
    },
    onError: (error: Error) => {
      if (/401|未登录|unauthorized/i.test(error.message)) setLoginRequired(true)
      showToast(error.message, 'error')
    },
  })

  const scenes = scenesQuery.data?.items ?? []

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-scene-head">
        <div>
          <strong>{t('场景库', 'Scenes')}</strong>
          <div className="dr-hint">
            {t(
              '选择场景加入分镜；场景描述会作为镜头初始画面描述。',
              'Add a scene as a pending shot with its description.'
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="dr-btn" onClick={() => onNavigateStage('images')}>
            <Icon name="template" size={15} />
            {t('生成场景图', 'Generate scene image')}
          </button>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={15} />
            {t('自定义场景', 'Custom scene')}
          </button>
        </div>
      </section>

      <div className="dr-card ed-scene-toolbar">
        <div className="ed-profile-chips" role="group" aria-label={t('场景分类', 'Scene categories')}>
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dr-chip"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {t(item.zh, item.en)}
            </button>
          ))}
        </div>
        <input
          className="dr-input"
          style={{ maxWidth: 220 }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('搜索场景…', 'Search scenes…')}
          aria-label={t('搜索场景', 'Search scenes')}
        />
      </div>

      {scenesQuery.isLoading ? (
        <div className="ed-scene-grid">
          {[0, 1, 2, 3].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 200 }} />
          ))}
        </div>
      ) : scenesQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">{t('场景加载失败', 'Failed to load scenes')}</div>
          <div>{(scenesQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => scenesQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : scenes.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 48 }}>
          <div className="dr-state-title">{t('没有匹配的场景', 'No matching scenes')}</div>
        </div>
      ) : (
        <div className="ed-scene-grid">
          {scenes.map((scene) => (
            <article className="dr-card ed-scene-card" key={scene.id}>
              <div className="ed-scene-image">
                {scene.referenceImage ? (
                  <img src={scene.referenceImage} alt="" loading="lazy" />
                ) : (
                  <Icon name="compass" size={24} />
                )}
                {scene.isBuiltin === false ? (
                  <span className="dr-status">{t('自定义', 'Custom')}</span>
                ) : null}
              </div>
              <div className="ed-scene-body">
                <div className="ed-scene-name">{scene.name}</div>
                <p className="ed-scene-desc">{scene.description || t('暂无描述', 'No description')}</p>
                {scene.tags?.length ? (
                  <div className="dr-tag-row">
                    {scene.tags.slice(0, 3).map((tag) => (
                      <span className="dr-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="ed-scene-actions">
                <button
                  type="button"
                  className="dr-btn dr-btn-primary"
                  disabled={addShotMutation.isPending}
                  onClick={() => addShotMutation.mutate(scene)}
                >
                  <Icon name="plus" size={15} />
                  {t('添加为镜头', 'Add as shot')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        title={t('自定义场景', 'Custom scene')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setCreateOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={createMutation.isPending || !name.trim()}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t('创建中…', 'Creating…') : t('创建', 'Create')}
            </button>
          </>
        }
      >
        <div className="dr-field">
          <label className="dr-label" htmlFor="scene-name">
            {t('场景名', 'Name')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="scene-name"
            className="dr-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="scene-description">
            {t('描述', 'Description')}
          </label>
          <textarea
            id="scene-description"
            className="dr-input"
            style={{ minHeight: 72, padding: '8px 10px', resize: 'vertical' }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="scene-category">
            {t('分类', 'Category')}
          </label>
          <select
            id="scene-category"
            className="dr-select"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
          >
            {CATEGORIES.filter((item) => item.id !== 'all').map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.zh, item.en)}
              </option>
            ))}
          </select>
        </div>
        {loginRequired ? (
          <p className="dr-error">
            {t('创建自定义场景需要登录。', 'Sign in to create custom scenes.')}{' '}
            <a href="#/login" style={{ textDecoration: 'underline' }}>
              {t('去登录', 'Sign in')}
            </a>
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
