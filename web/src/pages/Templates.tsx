import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'

export function TemplatesPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.listTemplates(),
    staleTime: 120_000,
  })

  const templates = templatesQuery.data?.items ?? []
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(templates.map((item) => item.category)))],
    [templates]
  )
  const filtered = templates.filter((template) => {
    const matchesCategory = category === 'all' || template.category === category
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      template.name.toLowerCase().includes(term) ||
      template.description.toLowerCase().includes(term)
    return matchesCategory && matchesSearch
  })

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('模板库', 'Templates')}</h1>
          <p className="dr-page-sub">
            {t('用结构启动项目，而不是套版。模板只预填创意、时长与画幅。', 'Start with structure, not a fixed look.')}
          </p>
        </div>
        <div style={{ position: 'relative', minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 9, top: 9, color: 'var(--meta)' }}>
            <Icon name="search" size={15} />
          </span>
          <input
            className="dr-input"
            style={{ width: '100%', paddingLeft: 30 }}
            placeholder={t('搜索模板…', 'Search templates…')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('搜索模板', 'Search templates')}
          />
        </div>
      </div>

      <div className="dr-chips" role="group" aria-label={t('模板分类', 'Template categories')}>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className="dr-chip"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item === 'all' ? t('全部', 'All') : item}
          </button>
        ))}
      </div>

      {templatesQuery.isLoading ? (
        <div className="dr-grid dr-grid-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 180 }} />
          ))}
        </div>
      ) : templatesQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">{t('模板加载失败', 'Failed to load templates')}</div>
          <div>{(templatesQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => templatesQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="template" size={20} />
          </div>
          <div className="dr-state-title">{t('没有匹配的模板', 'No matching templates')}</div>
          <div>{t('换一个分类或关键词。', 'Try another category or keyword.')}</div>
        </div>
      ) : (
        <div className="dr-grid dr-grid-3">
          {filtered.map((template) => (
            <article className="dr-card dr-card-hover dr-template-card" key={template.id}>
              <div className="dr-template-icon">
                <Icon name="template" size={17} />
              </div>
              <div className="dr-template-name">{template.name}</div>
              <div className="dr-template-desc">{template.description}</div>
              <div className="dr-tag-row">
                <span className="dr-tag">{template.category}</span>
                {template.config?.targetDuration ? (
                  <span className="dr-tag">{template.config.targetDuration}s</span>
                ) : null}
                {template.config?.platform ? (
                  <span className="dr-tag">
                    {template.config.platform === 'portrait' ? '9:16' : '16:9'}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onClick={() => navigate(`/projects?template=${encodeURIComponent(template.id)}&create=1`)}
              >
                {t('使用模板', 'Use template')}
                <Icon name="arrow-right" size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
