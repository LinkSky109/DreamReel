import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, hasToken } from '../lib/api'
import { useLang } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { showToast } from '../lib/toast'
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  readWorkspacePreferences,
  saveWorkspacePreferences,
  type WorkspacePreferences,
} from '../lib/preferences'
import type { NotificationPreferences, ProviderStageStatus, WebhookEndpoint } from '../domain/types'
import { formatNumber } from '../lib/format'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Settings.css'
import { pluralize } from '../lib/format'

const NOTIFICATION_TYPES = [
  { id: 'video_completed', zh: '视频生成完成', en: 'Video completed' },
  { id: 'video_failed', zh: '视频生成失败', en: 'Video failed' },
  { id: 'script_completed', zh: '剧本生成完成', en: 'Script completed' },
  { id: 'export_completed', zh: '导出完成', en: 'Export completed' },
  { id: 'export_failed', zh: '导出失败', en: 'Export failed' },
  { id: 'analysis_completed', zh: '影评分析完成', en: 'Analysis completed' },
  { id: 'collaboration', zh: '协作与评论', en: 'Collaboration' },
  { id: 'system', zh: '系统通知', en: 'System' },
  { id: 'mention', zh: '@ 提及', en: 'Mentions' },
  { id: 'comment_reply', zh: '评论回复', en: 'Replies' },
]

const WEBHOOK_EVENT_LABELS: Record<string, { zh: string; en: string }> = {
  'video.completed': { zh: '视频生成完成', en: 'Video completed' },
  'video.failed': { zh: '视频生成失败', en: 'Video failed' },
  'script.completed': { zh: '剧本生成完成', en: 'Script completed' },
  'export.completed': { zh: '导出完成', en: 'Export completed' },
  'export.failed': { zh: '导出失败', en: 'Export failed' },
  'analysis.completed': { zh: '影评分析完成', en: 'Analysis completed' },
  'project.created': { zh: '项目创建', en: 'Project created' },
  'project.updated': { zh: '项目更新', en: 'Project updated' },
  'project.deleted': { zh: '项目删除', en: 'Project deleted' },
}

const PROVIDERS = [
  { key: 'video' as const, zh: '视频生成', en: 'Video' },
  { key: 'llm' as const, zh: '剧本 / 影评', en: 'LLM' },
  { key: 'tts' as const, zh: '配音字幕', en: 'TTS' },
  { key: 'image' as const, zh: '图片生成', en: 'Image' },
]

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function SettingsPage() {
  const { t, lang, toggleLang } = useLang()
  const { theme, toggleTheme } = useTheme()
  const queryClient = useQueryClient()
  const [preferences, setPreferences] = useState<WorkspacePreferences>(readWorkspacePreferences)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({})

  const [webhookOpen, setWebhookOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null)
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>([])
  const [webhookSecret, setWebhookSecret] = useState('')
  const [deletingWebhook, setDeletingWebhook] = useState<WebhookEndpoint | null>(null)
  const [logsWebhook, setLogsWebhook] = useState<WebhookEndpoint | null>(null)

  const systemQuery = useQuery({ queryKey: ['settings', 'system'], queryFn: () => api.getSystemInfo() })
  const providersQuery = useQuery({
    queryKey: ['settings', 'providers'],
    queryFn: () => api.getProviderStatus(),
  })
  const quotaQuery = useQuery({ queryKey: ['quota'], queryFn: () => api.getQuota(), retry: false })
  const stylesQuery = useQuery({
    queryKey: ['styles'],
    queryFn: () => api.listStyles(),
    staleTime: 300_000,
    retry: false,
  })
  const voicesQuery = useQuery({
    queryKey: ['dubbing', 'voices'],
    queryFn: () => api.getVoices(),
    staleTime: 300_000,
    retry: false,
  })
  const notifQuery = useQuery({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.getNotificationPreferences(),
    retry: false,
  })
  const plansQuery = useQuery({ queryKey: ['settings', 'plans'], queryFn: () => api.getPlans() })
  const performanceQuery = useQuery({
    queryKey: ['settings', 'performance'],
    queryFn: () => api.getPerformance(),
    retry: false,
  })
  const webhooksQuery = useQuery({
    queryKey: ['settings', 'webhooks'],
    queryFn: () => api.listWebhooks(),
    retry: false,
  })
  const webhookEventsQuery = useQuery({
    queryKey: ['settings', 'webhook-events'],
    queryFn: () => api.getWebhookEvents(),
    staleTime: 300_000,
    retry: false,
  })
  const webhookDeliveriesQuery = useQuery({
    queryKey: ['settings', 'webhook-deliveries', logsWebhook?.id],
    queryFn: () => api.getWebhookDeliveries(logsWebhook!.id),
    enabled: Boolean(logsWebhook?.id),
    retry: false,
  })
  const subscriptionQuery = useQuery({
    queryKey: ['settings', 'subscription'],
    queryFn: () => api.getCurrentSubscription(),
    enabled: hasToken(),
    retry: false,
  })

  useEffect(() => {
    if (notifQuery.data) setNotificationPrefs(notifQuery.data.preferences ?? {})
  }, [notifQuery.data])

  const notificationMutation = useMutation({
    mutationFn: () => api.updateNotificationPreferences(notificationPrefs),
    onSuccess: (result) => {
      setNotificationPrefs(result.preferences ?? {})
      showToast(t('通知偏好已保存', 'Notification preferences saved'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const openWebhookForm = (webhook?: WebhookEndpoint) => {
    setEditingWebhook(webhook ?? null)
    setWebhookName(webhook?.name ?? '')
    setWebhookUrl(webhook?.url ?? '')
    setWebhookEvents(webhook?.events ?? [])
    setWebhookSecret('')
    setWebhookOpen(true)
  }

  const saveWebhook = useMutation({
    mutationFn: () => {
      const payload = {
        name: webhookName.trim() || webhookUrl.trim(),
        url: webhookUrl.trim(),
        events: webhookEvents,
        ...(webhookSecret.trim() ? { secret: webhookSecret.trim() } : {}),
      }
      return editingWebhook ? api.updateWebhook(editingWebhook.id, payload) : api.createWebhook(payload)
    },
    onSuccess: () => {
      showToast(editingWebhook ? t('Webhook 已更新', 'Webhook updated') : t('Webhook 已创建', 'Webhook created'))
      setWebhookOpen(false)
      queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const toggleWebhook = useMutation({
    mutationFn: (webhook: WebhookEndpoint) => api.updateWebhook(webhook.id, { active: !webhook.active }),
    onSuccess: (updated) => {
      showToast(updated.active ? t('Webhook 已启用', 'Webhook enabled') : t('Webhook 已停用', 'Webhook disabled'))
      queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const testWebhook = useMutation({
    mutationFn: (webhook: WebhookEndpoint) => api.testWebhook(webhook.id),
    onSuccess: (result) => {
      if (result.success) {
        showToast(t('Webhook 测试成功', 'Webhook test succeeded'))
      } else {
        showToast(t(`测试失败：${result.error ?? '未知错误'}`, `Test failed: ${result.error ?? 'unknown'}`), 'error')
      }
      queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteWebhook = useMutation({
    mutationFn: (webhook: WebhookEndpoint) => api.deleteWebhook(webhook.id),
    onSuccess: () => {
      showToast(t('Webhook 已删除', 'Webhook deleted'))
      setDeletingWebhook(null)
      queryClient.invalidateQueries({ queryKey: ['settings', 'webhooks'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const savePreferences = () => {
    saveWorkspacePreferences(preferences)
    showToast(
      t(
        '已保存到本机（后端工作区接口待接入）',
        'Saved locally (workspace API pending)'
      )
    )
  }

  const patchPreferences = (patch: Partial<WorkspacePreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }))

  const providerCards = useMemo(
    () =>
      PROVIDERS.map((provider) => ({
        ...provider,
        status: providersQuery.data?.[provider.key],
      })).filter((item) => Boolean(item.status)),
    [providersQuery.data]
  )

  const system = systemQuery.data
  const plans = plansQuery.data?.plans ?? []
  const currentPlanId = subscriptionQuery.data?.planId ?? subscriptionQuery.data?.plan?.id ?? 'free'

  const navItems = [
    { id: 'workspace', zh: '工作区', en: 'Workspace' },
    { id: 'defaults', zh: '创作默认值', en: 'Defaults' },
    { id: 'notifications', zh: '通知', en: 'Notifications' },
    { id: 'models', zh: '模型与系统', en: 'Models & system' },
    { id: 'runtime', zh: '运行与性能', en: 'Runtime' },
    { id: 'webhooks', zh: 'Webhook', en: 'Webhooks' },
    { id: 'billing', zh: '套餐与额度', en: 'Plan & quota' },
  ]

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('设置', 'Settings')}</h1>
          <p className="dr-page-sub">
            {t('工作区、创作默认值、通知、模型与套餐。', 'Workspace, defaults, notifications, models, and plan.')}
          </p>
        </div>
      </div>

      <div className="dr-settings-layout">
        <nav className="dr-settings-nav" aria-label={t('设置分区', 'Settings sections')}>
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {t(item.zh, item.en)}
            </a>
          ))}
        </nav>

        <div className="dr-settings-sections">
          <section className="dr-card dr-settings-section" id="workspace">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('工作区', 'Workspace')}</h2>
            </div>
            <div className="dr-settings-grid">
              <div className="dr-field">
                <label className="dr-label" htmlFor="workspace-name">
                  {t('工作区名称', 'Workspace name')}
                </label>
                <input
                  id="workspace-name"
                  className="dr-input"
                  value={preferences.workspaceName}
                  onChange={(event) => patchPreferences({ workspaceName: event.target.value })}
                />
              </div>
              <div className="dr-field">
                <label className="dr-label" htmlFor="workspace-slug">
                  {t('工作区地址', 'Workspace slug')}
                </label>
                <input
                  id="workspace-slug"
                  className="dr-input"
                  value={preferences.workspaceSlug}
                  onChange={(event) => patchPreferences({ workspaceSlug: event.target.value })}
                />
              </div>
              <div className="dr-field">
                <label className="dr-label" htmlFor="workspace-aspect">
                  {t('默认画幅', 'Default aspect')}
                </label>
                <select
                  id="workspace-aspect"
                  className="dr-select"
                  value={preferences.defaultAspect}
                  onChange={(event) =>
                    patchPreferences({ defaultAspect: event.target.value as '16:9' | '9:16' })
                  }
                >
                  <option value="16:9">{t('横屏 16:9', 'Landscape 16:9')}</option>
                  <option value="9:16">{t('竖屏 9:16', 'Portrait 9:16')}</option>
                </select>
              </div>
            </div>
            <label className="dr-check-inline">
              <input
                type="checkbox"
                checked={preferences.autosave}
                onChange={(event) => patchPreferences({ autosave: event.target.checked })}
              />
              {t('编辑时自动保存', 'Autosave while editing')}
            </label>
            <div className="dr-settings-actions">
              <button type="button" className="dr-btn" onClick={() => setPreferences({ ...DEFAULT_WORKSPACE_PREFERENCES })}>
                {t('恢复默认', 'Reset')}
              </button>
              <button type="button" className="dr-btn dr-btn-primary" onClick={savePreferences}>
                {t('保存工作区设置', 'Save workspace')}
              </button>
            </div>
          </section>

          <section className="dr-card dr-settings-section" id="defaults">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('创作默认值', 'Creation defaults')}</h2>
            </div>
            <div className="dr-settings-grid">
              <div className="dr-field">
                <label className="dr-label" htmlFor="default-style">
                  {t('默认视觉风格', 'Default style')}
                </label>
                <select
                  id="default-style"
                  className="dr-select"
                  value={preferences.defaultStyle}
                  onChange={(event) => patchPreferences({ defaultStyle: event.target.value })}
                >
                  <option value="none">{t('无风格', 'No style')}</option>
                  {stylesQuery.data?.items.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dr-field">
                <label className="dr-label" htmlFor="default-voice">
                  {t('默认音色', 'Default voice')}
                </label>
                <select
                  id="default-voice"
                  className="dr-select"
                  value={preferences.defaultVoice}
                  onChange={(event) => patchPreferences({ defaultVoice: event.target.value })}
                >
                  <option value="">{t('跟随系统默认', 'System default')}</option>
                  {voicesQuery.data?.voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="dr-settings-checks">
              <label className="dr-check-inline">
                <input
                  type="checkbox"
                  checked={preferences.lockCharacters}
                  onChange={(event) => patchPreferences({ lockCharacters: event.target.checked })}
                />
                {t('默认锁定角色一致性', 'Lock character consistency by default')}
              </label>
              <label className="dr-check-inline">
                <input
                  type="checkbox"
                  checked={preferences.subtitles}
                  onChange={(event) => patchPreferences({ subtitles: event.target.checked })}
                />
                {t('默认生成字幕', 'Generate subtitles by default')}
              </label>
            </div>
            <div className="dr-settings-actions">
              <button type="button" className="dr-btn dr-btn-primary" onClick={savePreferences}>
                {t('保存默认值', 'Save defaults')}
              </button>
            </div>
          </section>

          <section className="dr-card dr-settings-section" id="notifications">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('通知', 'Notifications')}</h2>
              <span className="dr-hint">{t('按类型开关站内通知', 'Toggle in-app notifications')}</span>
            </div>
            {notifQuery.isLoading ? (
              <div className="dr-hint">{t('加载中…', 'Loading…')}</div>
            ) : notifQuery.isError ? (
              <div className="dr-state" style={{ padding: 20 }}>
                {(notifQuery.error as Error).message}
              </div>
            ) : (
              <div className="dr-settings-notifications">
                {NOTIFICATION_TYPES.map((item) => (
                  <label className="dr-check-inline" key={item.id}>
                    <input
                      type="checkbox"
                      checked={notificationPrefs[item.id] !== false}
                      onChange={(event) =>
                        setNotificationPrefs((current) => ({
                          ...current,
                          [item.id]: event.target.checked,
                        }))
                      }
                    />
                    {t(item.zh, item.en)}
                  </label>
                ))}
              </div>
            )}
            <div className="dr-settings-actions">
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                disabled={notificationMutation.isPending}
                onClick={() => notificationMutation.mutate()}
              >
                {t('保存通知偏好', 'Save notifications')}
              </button>
            </div>
          </section>

          <section className="dr-card dr-settings-section" id="models">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('模型与系统', 'Models & system')}</h2>
              <span className="dr-hint">
                {t('Provider 通过环境变量切换，修改后需重启服务', 'Providers are configured via env vars')}
              </span>
            </div>

            {providersQuery.isLoading ? (
              <div className="dr-hint">{t('加载 Provider 状态…', 'Loading providers…')}</div>
            ) : providersQuery.isError ? (
              <div className="dr-state" style={{ padding: 20 }}>
                {(providersQuery.error as Error).message}
              </div>
            ) : (
              <div className="dr-provider-grid">
                {providerCards.map((provider) => (
                  <ProviderCard
                    key={provider.key}
                    title={t(provider.zh, provider.en)}
                    status={provider.status as ProviderStageStatus}
                  />
                ))}
              </div>
            )}

            <div className="dr-settings-system">
              {system ? (
                <>
                  <InfoItem label={t('应用版本', 'Version')} value={`v${system.app.version}`} />
                  <InfoItem label={t('运行环境', 'Environment')} value={system.app.env} />
                  <InfoItem label={t('运行时长', 'Uptime')} value={formatUptime(system.app.uptime)} />
                  <InfoItem label="Node" value={system.system.nodeVersion} />
                  <InfoItem
                    label={t('操作系统', 'Platform')}
                    value={`${system.system.platform} / ${system.system.arch}`}
                  />
                  <InfoItem label="CPU" value={`${system.system.cpuCount} cores`} />
                  <InfoItem
                    label={t('内存', 'Memory')}
                    value={`${formatMB(system.system.freeMemory)} free / ${formatMB(system.system.totalMemory)}`}
                  />
                  <InfoItem
                    label={t('存储', 'Storage')}
                    value={`${system.storage.usedMB} MB · ${system.storage.fileCount} files`}
                  />
                  <InfoItem label={t('端口', 'Port')} value={String(system.config.port)} />
                </>
              ) : (
                <div className="dr-hint">{t('系统信息加载失败', 'System info unavailable')}</div>
              )}
            </div>

            <div className="dr-settings-toggles">
              <button type="button" className="dr-btn" onClick={toggleTheme}>
                <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
                {theme === 'light' ? t('切换到深色', 'Switch to dark') : t('切换到浅色', 'Switch to light')}
              </button>
              <button type="button" className="dr-btn" onClick={toggleLang}>
                <Icon name="globe" size={15} />
                {lang === 'zh' ? 'Switch to English' : '切换到中文'}
              </button>
            </div>
          </section>

          <section className="dr-card dr-settings-section" id="runtime">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('运行与性能', 'Runtime & performance')}</h2>
              <button
                type="button"
                className="dr-btn"
                onClick={() => performanceQuery.refetch()}
                disabled={performanceQuery.isFetching}
              >
                <Icon name="refresh" size={14} />
                {performanceQuery.isFetching ? t('刷新中…', 'Refreshing…') : t('刷新', 'Refresh')}
              </button>
            </div>
            {performanceQuery.isLoading ? (
              <div className="dr-hint">{t('加载性能数据…', 'Loading performance data…')}</div>
            ) : performanceQuery.isError ? (
              <div className="dr-state" style={{ padding: 20 }}>
                {t('性能数据不可用', 'Performance data unavailable')}：{(performanceQuery.error as Error).message}
              </div>
            ) : performanceQuery.data ? (
              <>
                <div className="dr-perf-grid">
                  <div className="dr-card dr-perf-card">
                    <span>{t('CPU 使用率', 'CPU')}</span>
                    <strong className={perfTone(performanceQuery.data.system.cpu.usagePercent)}>
                      {performanceQuery.data.system.cpu.usagePercent}%
                    </strong>
                    <small>
                      {performanceQuery.data.system.cpu.cores} {t('核', pluralize(performanceQuery.data.system.cpu.cores, 'core'))} ·{' '}
                      {t('负载', 'load')} {performanceQuery.data.system.cpu.loadAvg1m.toFixed(2)}
                    </small>
                  </div>
                  <div className="dr-card dr-perf-card">
                    <span>{t('内存使用率', 'Memory')}</span>
                    <strong className={perfTone(performanceQuery.data.system.memory.usagePercent)}>
                      {performanceQuery.data.system.memory.usagePercent}%
                    </strong>
                    <small>
                      {performanceQuery.data.system.memory.usedMB} / {performanceQuery.data.system.memory.totalMB} MB
                    </small>
                  </div>
                  <div className="dr-card dr-perf-card">
                    <span>{t('总请求数', 'Requests')}</span>
                    <strong>{formatNumber(performanceQuery.data.requests.total, lang)}</strong>
                    <small>
                      {t('错误', 'Errors')} {formatNumber(performanceQuery.data.requests.errors, lang)} ·{' '}
                      {performanceQuery.data.requests.errorRate}%
                    </small>
                  </div>
                  <div className="dr-card dr-perf-card">
                    <span>{t('平均响应时间', 'Avg response')}</span>
                    <strong>{performanceQuery.data.requests.avgResponseTime} ms</strong>
                    <small>
                      {t('运行时长', 'Uptime')} {formatUptime(performanceQuery.data.system.uptime)}
                    </small>
                  </div>
                </div>

                <div className="dr-perf-tables">
                  <div>
                    <h3 className="dr-perf-subtitle">{t('最慢端点 Top 5', 'Slowest endpoints')}</h3>
                    {performanceQuery.data.requests.slowestEndpoints.length === 0 ? (
                      <p className="dr-hint">{t('暂无请求数据。', 'No request data yet.')}</p>
                    ) : (
                      <div className="dr-perf-table-wrap">
                        <table className="dr-table dr-perf-table">
                          <thead>
                            <tr>
                              <th>{t('端点', 'Endpoint')}</th>
                              <th>{t('请求', 'Count')}</th>
                              <th>{t('平均', 'Avg')}</th>
                              <th>{t('错误率', 'Errors')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceQuery.data.requests.slowestEndpoints.map((item) => (
                              <tr key={`slow-${item.endpoint}`}>
                                <td>
                                  <code>{item.endpoint}</code>
                                </td>
                                <td>{item.count}</td>
                                <td>{item.avgTime} ms</td>
                                <td>{item.errorRate}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="dr-perf-subtitle">{t('最频繁端点 Top 5', 'Busiest endpoints')}</h3>
                    {performanceQuery.data.requests.busiestEndpoints.length === 0 ? (
                      <p className="dr-hint">{t('暂无请求数据。', 'No request data yet.')}</p>
                    ) : (
                      <div className="dr-perf-table-wrap">
                        <table className="dr-table dr-perf-table">
                          <thead>
                            <tr>
                              <th>{t('端点', 'Endpoint')}</th>
                              <th>{t('请求', 'Count')}</th>
                              <th>{t('平均', 'Avg')}</th>
                              <th>{t('错误', 'Errors')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceQuery.data.requests.busiestEndpoints.map((item) => (
                              <tr key={`busy-${item.endpoint}`}>
                                <td>
                                  <code>{item.endpoint}</code>
                                </td>
                                <td>{item.count}</td>
                                <td>{item.avgTime} ms</td>
                                <td>{item.errors}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </section>

          <section className="dr-card dr-settings-section" id="webhooks">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('Webhook', 'Webhooks')}</h2>
              <button type="button" className="dr-btn dr-btn-primary" onClick={() => openWebhookForm()}>
                <Icon name="plus" size={14} />
                {t('添加 Webhook', 'Add webhook')}
              </button>
            </div>
            <p className="dr-hint">
              {t(
                '在事件发生时向你的服务发送 HTTP POST；支持 HMAC 签名与投递统计。',
                'Send HTTP POST notifications to your service; supports HMAC signatures and delivery stats.'
              )}
            </p>

            {webhooksQuery.isLoading ? (
              <div className="dr-hint">{t('加载 Webhook…', 'Loading webhooks…')}</div>
            ) : webhooksQuery.isError ? (
              <div className="dr-state" style={{ padding: 20 }}>
                {t('Webhook 加载失败', 'Failed to load webhooks')}：{(webhooksQuery.error as Error).message}
              </div>
            ) : (webhooksQuery.data?.webhooks.length ?? 0) === 0 ? (
              <div className="dr-state" style={{ padding: 24 }}>
                <Icon name="bell" size={22} />
                <p>{t('还没有 Webhook。添加一个接收生成与导出事件。', 'No webhooks yet. Add one to receive generation and export events.')}</p>
                <button type="button" className="dr-btn" onClick={() => openWebhookForm()}>
                  {t('添加 Webhook', 'Add webhook')}
                </button>
              </div>
            ) : (
              <ul className="dr-webhook-list">
                {webhooksQuery.data!.webhooks.map((webhook) => (
                  <li className="dr-webhook-card" key={webhook.id}>
                    <div className="dr-webhook-head">
                      <div>
                        <strong>{webhook.name}</strong>
                        <span className={`dr-webhook-state ${webhook.active ? 'is-active' : ''}`}>
                          {webhook.active ? t('已启用', 'Active') : t('已停用', 'Disabled')}
                        </span>
                      </div>
                      <div className="dr-webhook-actions">
                        <button
                          type="button"
                          className="dr-btn"
                          disabled={testWebhook.isPending}
                          onClick={() => testWebhook.mutate(webhook)}
                        >
                          {t('测试', 'Test')}
                        </button>
                        <button type="button" className="dr-btn" onClick={() => setLogsWebhook(webhook)}>
                          {t('投递日志', 'Deliveries')}
                        </button>
                        <button
                          type="button"
                          className="dr-btn"
                          disabled={toggleWebhook.isPending}
                          onClick={() => toggleWebhook.mutate(webhook)}
                        >
                          {webhook.active ? t('停用', 'Disable') : t('启用', 'Enable')}
                        </button>
                        <button type="button" className="dr-btn" onClick={() => openWebhookForm(webhook)}>
                          {t('编辑', 'Edit')}
                        </button>
                        <button type="button" className="dr-btn dr-btn-danger" onClick={() => setDeletingWebhook(webhook)}>
                          {t('删除', 'Delete')}
                        </button>
                      </div>
                    </div>
                    <code className="dr-webhook-url">{webhook.url}</code>
                    <div className="dr-webhook-events">
                      {webhook.events.map((event) => (
                        <span key={event}>{eventLabel(event, t)}</span>
                      ))}
                    </div>
                    <div className="dr-webhook-stats">
                      <span>{t('成功', 'Success')} {webhook.successCount}</span>
                      <span>{t('失败', 'Failed')} {webhook.failureCount}</span>
                      {webhook.lastTriggeredAt ? (
                        <span>{t('最近触发', 'Last triggered')} {webhook.lastTriggeredAt.slice(0, 16).replace('T', ' ')}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dr-card dr-settings-section" id="billing">
            <div className="dr-section-head">
              <h2 className="dr-section-title">{t('套餐与额度', 'Plan & quota')}</h2>
              <Link className="dr-btn" to="/pricing">
                {t('查看套餐', 'View plans')}
              </Link>
            </div>

            <div className="dr-settings-quota">
              <QuotaCard
                label={t('视频生成 / 今日', 'Video today')}
                value={
                  quotaQuery.data
                    ? `${quotaQuery.data.video.daily.remaining}/${quotaQuery.data.video.daily.limit}`
                    : '—'
                }
              />
              <QuotaCard
                label={t('图片生成 / 今日', 'Images today')}
                value={
                  quotaQuery.data
                    ? `${quotaQuery.data.image.daily.remaining}/${quotaQuery.data.image.daily.limit}`
                    : '—'
                }
              />
              <QuotaCard
                label={t('当前套餐', 'Current plan')}
                value={plans.find((plan) => plan.id === currentPlanId)?.name ?? currentPlanId}
              />
            </div>

            {!hasToken() ? (
              <p className="dr-hint">
                {t('未登录时显示免费额度；登录后可看到订阅状态。', 'Sign in to see subscription status.')}{' '}
                <Link className="dr-inline-link" to="/login">{t('去登录', 'Sign in')}</Link>
              </p>
            ) : null}

            <div className="dr-plan-grid">
              {plans.map((plan) => (
                <div
                  className={`dr-card dr-plan-card${plan.id === currentPlanId ? ' is-current' : ''}`}
                  key={plan.id}
                >
                  <strong>{plan.name}</strong>
                  <span className="dr-plan-price">
                    ¥{plan.priceMonthly ?? plan.price ?? 0}
                    <small>/{t('月', 'mo')}</small>
                  </span>
                  {plan.id === currentPlanId ? (
                    <span className="dr-status is-completed">
                      <span className="dr-dot" />
                      {t('当前套餐', 'Current')}
                    </span>
                  ) : (
                    <Link className="dr-btn" to="/pricing">
                      {t('查看详情', 'Details')}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={webhookOpen}
        title={editingWebhook ? t('编辑 Webhook', 'Edit webhook') : t('添加 Webhook', 'Add webhook')}
        width={520}
        onClose={() => (!saveWebhook.isPending ? setWebhookOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setWebhookOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!webhookUrl.trim() || webhookEvents.length === 0 || saveWebhook.isPending}
              onClick={() => saveWebhook.mutate()}
            >
              {saveWebhook.isPending ? t('保存中…', 'Saving…') : t('保存', 'Save')}
            </button>
          </>
        }
      >
        <div className="dr-webhook-form">
          <label className="dr-field">
            <span className="dr-label">{t('名称', 'Name')}</span>
            <input
              className="dr-input"
              value={webhookName}
              maxLength={60}
              onChange={(event) => setWebhookName(event.target.value)}
              placeholder={t('例如：我的通知服务', 'e.g. My notification service')}
            />
          </label>
          <label className="dr-field">
            <span className="dr-label">{t('URL', 'URL')}</span>
            <input
              className="dr-input"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://example.com/webhook"
            />
          </label>
          <fieldset className="dr-webhook-event-field">
            <legend className="dr-label">{t('事件类型', 'Events')}</legend>
            {(webhookEventsQuery.data?.events ?? Object.keys(WEBHOOK_EVENT_LABELS)).map((event) => (
              <label className="dr-check-inline" key={event}>
                <input
                  type="checkbox"
                  checked={webhookEvents.includes(event)}
                  onChange={() =>
                    setWebhookEvents((current) =>
                      current.includes(event)
                        ? current.filter((value) => value !== event)
                        : [...current, event]
                    )
                  }
                />
                <code>{event}</code> {eventLabel(event, t)}
              </label>
            ))}
          </fieldset>
          <label className="dr-field">
            <span className="dr-label">{t('签名密钥（可选）', 'Signing secret (optional)')}</span>
            <input
              className="dr-input"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder={editingWebhook ? t('留空则不修改', 'Leave blank to keep current') : t('用于 HMAC 签名验证', 'Used for HMAC signature')}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(deletingWebhook)}
        title={t('删除 Webhook', 'Delete webhook')}
        width={420}
        onClose={() => (!deleteWebhook.isPending ? setDeletingWebhook(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setDeletingWebhook(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-danger"
              type="button"
              disabled={deleteWebhook.isPending}
              onClick={() => deletingWebhook && deleteWebhook.mutate(deletingWebhook)}
            >
              {deleteWebhook.isPending ? t('删除中…', 'Deleting…') : t('确认删除', 'Delete')}
            </button>
          </>
        }
      >
        <p className="dr-webhook-confirm">
          {t(
            `删除「${deletingWebhook?.name ?? ''}」后，该地址将不再收到事件通知。`,
            `After deleting “${deletingWebhook?.name ?? ''}”, this endpoint will stop receiving events.`
          )}
        </p>
      </Modal>

      <Modal
        open={Boolean(logsWebhook)}
        title={logsWebhook ? t(`投递日志 · ${logsWebhook.name}`, `Deliveries · ${logsWebhook.name}`) : ''}
        width={760}
        onClose={() => setLogsWebhook(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setLogsWebhook(null)}>
              {t('关闭', 'Close')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={webhookDeliveriesQuery.isFetching}
              onClick={() => webhookDeliveriesQuery.refetch()}
            >
              <Icon name="refresh" size={14} />
              {webhookDeliveriesQuery.isFetching ? t('刷新中…', 'Refreshing…') : t('刷新', 'Refresh')}
            </button>
          </>
        }
      >
        {webhookDeliveriesQuery.isLoading ? (
          <div className="dr-hint">{t('加载投递日志…', 'Loading deliveries…')}</div>
        ) : webhookDeliveriesQuery.isError ? (
          <div className="dr-state" style={{ padding: 20 }}>
            {t('投递日志加载失败', 'Failed to load deliveries')}：{(webhookDeliveriesQuery.error as Error).message}
          </div>
        ) : (webhookDeliveriesQuery.data?.deliveries.length ?? 0) === 0 ? (
          <div className="dr-webhook-delivery-empty">
            <Icon name="bell" size={22} />
            <p>{t('还没有投递记录。点击「测试」会产生一条记录。', 'No deliveries yet. Use “Test” to create one.')}</p>
          </div>
        ) : (
          <div className="dr-perf-table-wrap">
            <table className="dr-table dr-webhook-delivery-table">
              <thead>
                <tr>
                  <th>{t('时间', 'Time')}</th>
                  <th>{t('事件', 'Event')}</th>
                  <th>{t('结果', 'Result')}</th>
                  <th>HTTP</th>
                  <th>{t('尝试', 'Attempt')}</th>
                </tr>
              </thead>
              <tbody>
                {webhookDeliveriesQuery.data!.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="dr-webhook-delivery-time">{delivery.timestamp.slice(0, 19).replace('T', ' ')}</td>
                    <td>
                      <code>{delivery.event}</code>
                    </td>
                    <td>
                      <span className={`dr-webhook-delivery-status ${delivery.success ? 'is-success' : 'is-failure'}`}>
                        {delivery.success ? t('成功', 'Success') : t('失败', 'Failure')}
                      </span>
                    </td>
                    <td className="dr-webhook-delivery-time">{delivery.statusCode || '—'}</td>
                    <td className="dr-webhook-delivery-time">{delivery.attempt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}

function perfTone(percent: number): string {
  if (percent >= 80) return 'is-danger'
  if (percent >= 50) return 'is-warning'
  return 'is-ok'
}

function eventLabel(event: string, t: (zh: string, en: string) => string): string {
  const item = WEBHOOK_EVENT_LABELS[event]
  return item ? t(item.zh, item.en) : event
}

function ProviderCard({ title, status }: { title: string; status: ProviderStageStatus }) {
  const { t } = useLang()
  const configured = Object.values(status.configured ?? {}).filter(Boolean).length
  const total = Object.keys(status.configured ?? {}).length
  return (
    <article className="dr-card dr-provider-card">
      <div className="dr-provider-head">
        <strong>{title}</strong>
        <span className="dr-status">
          <span className="dr-dot" />
          {status.current}
        </span>
      </div>
      {status.model ? <div className="dr-hint">{status.model}</div> : null}
      <div className="dr-tag-row">
        {(status.available ?? []).map((provider) => (
          <span className={`dr-tag${provider === status.current ? ' is-active' : ''}`} key={provider}>
            {provider}
          </span>
        ))}
      </div>
      <div className="dr-hint">
        {t('API Key', 'API keys')}: {total > 0 ? `${configured}/${total}` : '—'}
      </div>
    </article>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="dr-info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function QuotaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="dr-card dr-stat">
      <span className="dr-stat-value">{value}</span>
      <span className="dr-stat-label">{label}</span>
    </div>
  )
}
