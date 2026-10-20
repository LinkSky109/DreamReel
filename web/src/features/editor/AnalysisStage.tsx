import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { FilmAnalysis, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { relativeTime } from '../../lib/format'

type Props = {
  project: Project
}

const DIMENSIONS: { key: keyof NonNullable<FilmAnalysis['dimensions']>; zh: string; en: string }[] = [
  { key: 'cinematography', zh: '镜头语言', en: 'Cinematography' },
  { key: 'narrative', zh: '叙事结构', en: 'Narrative' },
  { key: 'pacing', zh: '节奏控制', en: 'Pacing' },
  { key: 'characterConsistency', zh: '角色一致性', en: 'Character consistency' },
]

export function AnalysisStage({ project }: Props) {
  const { t, lang } = useLang()
  const [polling, setPolling] = useState(false)

  const analysisQuery = useQuery({
    queryKey: ['analysis', project.id],
    queryFn: () => api.getAnalysis(project.id),
    retry: false,
    refetchInterval: polling ? 2000 : false,
  })

  const analysis = analysisQuery.data
  const notFound = analysisQuery.error instanceof ApiError && analysisQuery.error.status === 404

  useEffect(() => {
    if (polling && analysis) setPolling(false)
  }, [polling, analysis])

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyzeProject(project.id),
    onSuccess: () => {
      showToast(t('AI 影评分析已启动', 'Analysis started'))
      setPolling(true)
      void analysisQuery.refetch()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const shotMap = useMemo(
    () => new Map((project.shots ?? []).map((shot) => [shot.index + 1, shot.description])),
    [project.shots]
  )

  if (analysisQuery.isLoading) {
    return (
      <div className="dr-card dr-state" style={{ padding: 48 }}>
        {t('加载分析结果…', 'Loading analysis…')}
      </div>
    )
  }

  if (!analysis && !notFound) {
    return (
      <div className="dr-card dr-state">
        <div className="dr-state-icon">
          <Icon name="alert" size={20} />
        </div>
        <div className="dr-state-title">{t('分析结果加载失败', 'Failed to load analysis')}</div>
        <div>{(analysisQuery.error as Error | null)?.message}</div>
        <button type="button" className="dr-btn" onClick={() => analysisQuery.refetch()}>
          {t('重试', 'Retry')}
        </button>
      </div>
    )
  }

  const overall = analysis?.overallScore ?? 0

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-analysis-head">
        <div>
          <strong>{t('AI 影评', 'AI review')}</strong>
          <div className="dr-hint">
            {analysis
              ? `${t('最近分析', 'Analyzed')} ${relativeTime(analysis.analyzedAt, lang)}${
                  analysis.note ? ` · ${analysis.note}` : ''
                }`
              : t(
                  '从镜头语言、叙事、节奏、角色一致性四个维度给出专业反馈。',
                  'Review cinematography, narrative, pacing and character consistency.'
                )}
          </div>
        </div>
        <button
          type="button"
          className="dr-btn dr-btn-primary"
          disabled={analyzeMutation.isPending || polling || (project.shots?.length ?? 0) === 0}
          onClick={() => analyzeMutation.mutate()}
        >
          <Icon name="sparkles" size={15} />
          {polling || analyzeMutation.isPending
            ? t('分析中…', 'Analyzing…')
            : analysis
              ? t('重新分析', 'Re-analyze')
              : t('生成影评', 'Analyze')}
        </button>
      </section>

      {!analysis ? (
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="chart" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有分析结果', 'No analysis yet')}</div>
          <div>
            {(project.shots?.length ?? 0) === 0
              ? t('先生成剧本与分镜，再让 AI 分析。', 'Create a storyboard first.')
              : t('点击“生成影评”，分析完成后会自动刷新。', 'Run the analysis; results refresh automatically.')}
          </div>
        </div>
      ) : (
        <>
          <div className="ed-analysis-top">
            <section className="dr-card ed-score-card">
              <span className="ed-score-value">{Math.round(overall)}</span>
              <span className="ed-score-label">{t('综合评分 / 100', 'Overall / 100')}</span>
              <div className="ed-score-bar">
                <span style={{ width: `${Math.min(100, Math.max(0, overall))}%` }} />
              </div>
            </section>

            <section className="dr-card ed-dimension-card">
              {DIMENSIONS.map((dimension) => {
                const value = analysis.dimensions?.[dimension.key] ?? 0
                return (
                  <div className="ed-dimension" key={dimension.key}>
                    <span className="ed-dimension-label">{t(dimension.zh, dimension.en)}</span>
                    <div className="ed-dimension-bar">
                      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                    </div>
                    <span className="ed-dimension-value">{Math.round(value)}</span>
                  </div>
                )
              })}
            </section>
          </div>

          <div className="ed-analysis-lists">
            <ListCard title={t('优点', 'Strengths')} items={analysis.strengths} tone="success" />
            <ListCard title={t('问题', 'Weaknesses')} items={analysis.weaknesses} tone="danger" />
            <ListCard title={t('建议', 'Suggestions')} items={analysis.suggestions} tone="accent" />
          </div>

          {(analysis.shotByShot?.length ?? 0) > 0 ? (
            <section className="dr-card" style={{ overflow: 'auto' }}>
              <table className="dr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('镜头', 'Shot')}</th>
                    <th>{t('点评', 'Comment')}</th>
                    <th>{t('评分', 'Score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.shotByShot?.map((shot) => (
                    <tr key={shot.index}>
                      <td>S{String(shot.index).padStart(2, '0')}</td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="ed-generate-desc">{shotMap.get(shot.index) ?? '—'}</div>
                      </td>
                      <td>{shot.comment}</td>
                      <td>{shot.score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {analysis.objectiveMetrics ? (
            <section className="dr-card ed-objective">
              <strong>{t('客观指标', 'Objective metrics')}</strong>
              <div className="dr-tag-row">
                {Object.entries(analysis.objectiveMetrics).map(([key, value]) => (
                  <span className="dr-tag" key={key}>
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string
  items?: string[]
  tone: 'success' | 'danger' | 'accent'
}) {
  return (
    <section className="dr-card ed-list-card">
      <strong>{title}</strong>
      {items?.length ? (
        <ul className={`ed-list ed-list-${tone}`}>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <span className="dr-hint">—</span>
      )}
    </section>
  )
}
