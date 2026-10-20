import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
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
import type { NotificationPreferences, ProviderStageStatus } from '../domain/types'
import { Icon } from '../components/Icon'
import './Settings.css'

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
  const [preferences, setPreferences] = useState<WorkspacePreferences>(readWorkspacePreferences)
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({})

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
              <Link className="dr-btn" to="/system-settings">
                <Icon name="chart" size={15} />
                {t('旧版系统设置（性能 / Webhook）', 'Legacy system tools (performance / webhooks)')}
              </Link>
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
                <Link to="/login">{t('去登录', 'Sign in')}</Link>
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
    </div>
  )
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
