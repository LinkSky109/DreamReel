import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'

const LEVEL_TONE: Record<string, string> = {
  pass: 'is-completed',
  warning: 'is-generating',
  reject: 'is-failed',
}

const LEVEL_LABEL: Record<string, string> = {
  pass: '通过',
  warning: '警告',
  reject: '拒绝',
}

export function ModerationPage() {
  const { t } = useLang()
  const [text, setText] = useState('')

  const statsQuery = useQuery({
    queryKey: ['moderation', 'stats'],
    queryFn: () => api.getModerationStats(),
  })
  const logsQuery = useQuery({
    queryKey: ['moderation', 'logs'],
    queryFn: () => api.getModerationLogs(50),
  })

  const checkMutation = useMutation({
    mutationFn: () => api.checkText(text),
    onSuccess: (result) => {
      showToast(
        result.passed
          ? t('审核通过', 'Passed moderation')
          : t(`需要人工复核：${result.level}`, `Needs review: ${result.level}`),
        result.passed ? 'success' : 'error'
      )
      statsQuery.refetch()
      logsQuery.refetch()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const stats = statsQuery.data
  const logs = logsQuery.data?.logs ?? []

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('内容审核', 'Moderation')}</h1>
          <p className="dr-page-sub">
            {t(
              '检查文本是否触碰违禁规则，并保留审核留痕。',
              'Check text against policy rules and keep an audit trail.'
            )}
          </p>
        </div>
      </div>

      <div className="dr-grid dr-grid-3" style={{ marginBottom: 18 }}>
        {[
          { label: t('审核总数', 'Total'), value: stats?.total ?? 0 },
          { label: t('通过', 'Passed'), value: stats?.passed ?? 0 },
          { label: t('拒绝 / 警告', 'Rejected / warning'), value: (stats?.rejected ?? 0) + (stats?.warnings ?? 0) },
        ].map((item) => (
          <div className="dr-card dr-stat" key={item.label}>
            <span className="dr-stat-value">{item.value}</span>
            <span className="dr-stat-label">{item.label}</span>
          </div>
        ))}
      </div>

      <section className="dr-card" style={{ padding: 18 }}>
        <h2 className="dr-section-title">{t('即时审核', 'Check text')}</h2>
        <div className="dr-field" style={{ marginTop: 10 }}>
          <label className="dr-label" htmlFor="moderation-text">
            {t('待审核文本', 'Text to check')}
          </label>
          <textarea
            id="moderation-text"
            className="dr-input"
            style={{ height: 96, padding: '8px 10px', resize: 'vertical' }}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('粘贴剧本、标题或评论…', 'Paste a script, title, or comment…')}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={checkMutation.isPending || !text.trim()}
            onClick={() => checkMutation.mutate()}
          >
            <Icon name="shield" size={15} />
            {checkMutation.isPending ? t('审核中…', 'Checking…') : t('审核文本', 'Check')}
          </button>
        </div>
        {checkMutation.data ? (
          <div
            className="dr-card"
            style={{ marginTop: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <span className={`dr-status ${LEVEL_TONE[checkMutation.data.level] ?? ''}`}>
              <span className="dr-dot" />
              {t(LEVEL_LABEL[checkMutation.data.level] ?? checkMutation.data.level, checkMutation.data.level)}
            </span>
            <span className="dr-hint">
              {checkMutation.data.categories.length > 0
                ? t(`命中分类：${checkMutation.data.categories.join('、')}`, `Categories: ${checkMutation.data.categories.join(', ')}`)
                : t('未命中违禁分类', 'No policy category matched')}
            </span>
          </div>
        ) : null}
      </section>

      <section className="dr-section">
        <div className="dr-section-head">
          <h2 className="dr-section-title">{t('审核留痕', 'Audit log')}</h2>
          <span className="dr-hint">{t('最近 50 条', 'Latest 50')}</span>
        </div>
        {logsQuery.isLoading ? (
          <div className="dr-card dr-state">{t('加载中…', 'Loading…')}</div>
        ) : logsQuery.isError ? (
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="alert" size={20} />
            </div>
            <div className="dr-state-title">{t('审核日志加载失败', 'Failed to load audit log')}</div>
            <div>{(logsQuery.error as Error).message}</div>
            <button type="button" className="dr-btn" onClick={() => logsQuery.refetch()}>
              {t('重试', 'Retry')}
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="shield" size={20} />
            </div>
            <div className="dr-state-title">{t('暂无审核记录', 'No moderation records')}</div>
            <div>{t('对文本执行一次审核后，这里会出现记录。', 'Run a check and the record will appear here.')}</div>
          </div>
        ) : (
          <div className="dr-card" style={{ overflow: 'auto' }}>
            <table className="dr-table">
              <thead>
                <tr>
                  <th>{t('时间', 'Time')}</th>
                  <th>{t('级别', 'Level')}</th>
                  <th>{t('上下文', 'Context')}</th>
                  <th>{t('内容摘要', 'Excerpt')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={String(log.id ?? index)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{relativeTime(String(log.timestamp ?? ''))}</td>
                    <td>
                      <span className={`dr-status ${LEVEL_TONE[String(log.level)] ?? ''}`}>
                        <span className="dr-dot" />
                        {LEVEL_LABEL[String(log.level)] ?? String(log.level ?? '—')}
                      </span>
                    </td>
                    <td>{String(log.context ?? '—')}</td>
                    <td
                      style={{
                        maxWidth: 420,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {String(log.text ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="dr-hint" style={{ marginTop: 10 }}>
          {t(
            '说明：当前后端提供审核检查与留痕；“通过 / 隐藏”处置动作尚未提供接口，因此本页暂不展示处置按钮。',
            'Note: the backend currently exposes checks and audit logs; approve/hide actions have no endpoint yet.'
          )}
        </p>
      </section>
    </div>
  )
}
