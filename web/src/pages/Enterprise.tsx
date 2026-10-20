import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import type { EnterpriseConfig } from '../domain/types'
import './Enterprise.css'

type PolicyState = {
  sso: boolean
  watermark: boolean
  ipAllowlist: boolean
  disablePublicSharing: boolean
}

function policyFromConfig(config?: EnterpriseConfig): PolicyState {
  return {
    sso: config?.sso.enabled ?? false,
    watermark: config?.security.exportWatermark ?? false,
    ipAllowlist: config?.security.enforceIpAllowlist ?? false,
    disablePublicSharing: config?.security.disablePublicSharing ?? false,
  }
}

function formatTime(value: string) {
  return value.slice(0, 19).replace('T', ' ')
}

export function EnterprisePage() {
  const queryClient = useQueryClient()
  const { t } = useLang()

  const [policy, setPolicy] = useState<PolicyState>(policyFromConfig())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const overviewQuery = useQuery({
    queryKey: ['enterprise', 'overview'],
    queryFn: () => api.getEnterpriseOverview(),
  })
  const configQuery = useQuery({
    queryKey: ['enterprise', 'config'],
    queryFn: () => api.getEnterpriseConfig(),
  })
  const auditQuery = useQuery({
    queryKey: ['enterprise', 'audit'],
    queryFn: () => api.getEnterpriseAudit({ limit: 50 }),
  })
  const deploymentQuery = useQuery({
    queryKey: ['enterprise', 'deployment'],
    queryFn: () => api.getEnterpriseDeployment(),
  })

  useEffect(() => {
    if (configQuery.data) setPolicy(policyFromConfig(configQuery.data))
  }, [configQuery.data])

  const config = configQuery.data
  const overview = overviewQuery.data
  const audit = auditQuery.data
  const deployment = deploymentQuery.data

  const savePolicy = useMutation({
    mutationFn: () =>
      api.updateEnterpriseConfig({
        sso: { ...(config?.sso ?? { provider: 'saml', enabled: false }), enabled: policy.sso },
        security: {
          ...(config?.security ?? { ipAllowlist: [] }),
          exportWatermark: policy.watermark,
          enforceIpAllowlist: policy.ipAllowlist,
          disablePublicSharing: policy.disablePublicSharing,
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['enterprise', 'config'], updated)
      setPolicy(policyFromConfig(updated))
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'audit'] })
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'overview'] })
      showToast(t('安全策略已保存并记录审计', 'Security policy saved and audited'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const exportAudit = () => {
    if (!audit) return
    const blob = new Blob([JSON.stringify(audit.items, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dreamreel-audit-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast(t('审计日志已导出', 'Audit log exported'))
  }

  const toggles: { key: keyof PolicyState; zh: string; en: string; hintZh: string; hintEn: string }[] = [
    { key: 'sso', zh: '单点登录 (SSO)', en: 'Single sign-on', hintZh: `当前协议 ${config?.sso.provider?.toUpperCase() ?? 'SAML'}`, hintEn: `Current protocol ${config?.sso.provider?.toUpperCase() ?? 'SAML'}` },
    { key: 'watermark', zh: '导出文件加水印', en: 'Watermark exports', hintZh: '导出视频附带企业水印', hintEn: 'Attach company watermark to exports' },
    { key: 'ipAllowlist', zh: 'IP 白名单', en: 'IP allowlist', hintZh: '仅允许白名单地址访问', hintEn: 'Restrict access to allowlisted IPs' },
    { key: 'disablePublicSharing', zh: '禁止公开分享', en: 'Disable public sharing', hintZh: '关闭作品广场与分享链接', hintEn: 'Disable gallery and share links' },
  ]

  const dirty =
    JSON.stringify(policy) !== JSON.stringify(policyFromConfig(config))

  const loading = overviewQuery.isLoading || configQuery.isLoading || auditQuery.isLoading || deploymentQuery.isLoading
  const failedQuery = [overviewQuery, configQuery, auditQuery, deploymentQuery].find((query) => query.isError)

  if (loading) {
    return (
      <div className="dr-page enterprise-page">
        <div className="dr-skeleton" style={{ height: 72 }} />
        <div className="enterprise-metrics" style={{ marginTop: 16 }}>
          {[0, 1, 2, 3].map((key) => (
            <div className="dr-skeleton enterprise-metric" key={key} />
          ))}
        </div>
        <div className="dr-skeleton" style={{ height: 240, marginTop: 16 }} />
      </div>
    )
  }

  if (failedQuery || !overview || !config || !audit || !deployment) {
    return (
      <div className="dr-page enterprise-page">
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('企业管理未加载', 'Enterprise console failed to load')}</div>
          <div style={{ fontSize: 12 }}>{(failedQuery?.error as Error | undefined)?.message ?? ''}</div>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            onClick={() => {
              overviewQuery.refetch()
              configQuery.refetch()
              auditQuery.refetch()
              deploymentQuery.refetch()
            }}
          >
            {t('重试', 'Retry')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dr-page enterprise-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Enterprise</p>
          <h1>{t('企业管理', 'Enterprise')}</h1>
          <p className="projects-lead">
            {t('统一管理团队、安全策略、审计与私有化部署。', 'Manage teams, security policies, audit and self-hosted deployment.')}
          </p>
        </div>
        <Link className="dr-btn dr-btn-primary" to="/pricing">
          <Icon name="building" size={14} />
          {t('升级企业版', 'Upgrade')}
        </Link>
      </div>

      <div className="enterprise-metrics">
        {[
          { labelZh: '团队', labelEn: 'Teams', value: overview.teams },
          { labelZh: '成员', labelEn: 'Members', value: overview.members },
          { labelZh: '项目', labelEn: 'Projects', value: overview.projects },
          { labelZh: '审计事件', labelEn: 'Audit events', value: overview.auditEvents },
        ].map((item) => (
          <div className="dr-card enterprise-metric" key={item.labelEn}>
            <span>{t(item.labelZh, item.labelEn)}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <section className="dr-card enterprise-panel" aria-labelledby="enterprise-policy-title">
        <div className="enterprise-panel-head">
          <div>
            <h2 id="enterprise-policy-title">{t('安全与单点登录策略', 'Security & SSO policies')}</h2>
            <p>{t('修改后需保存，操作会写入审计日志。', 'Changes require saving and are written to the audit log.')}</p>
          </div>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={!dirty || savePolicy.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {savePolicy.isPending ? t('保存中…', 'Saving…') : t('保存策略', 'Save policy')}
          </button>
        </div>

        <div className="enterprise-toggles">
          {toggles.map((item) => (
            <label className="enterprise-toggle" key={item.key}>
              <span>
                <strong>{t(item.zh, item.en)}</strong>
                <small>{t(item.hintZh, item.hintEn)}</small>
              </span>
              <input
                type="checkbox"
                checked={policy[item.key]}
                onChange={(event) =>
                  setPolicy((current) => ({ ...current, [item.key]: event.target.checked }))
                }
              />
            </label>
          ))}
        </div>

        <dl className="enterprise-config-meta">
          <div>
            <dt>{t('SSO 入口', 'SSO entry point')}</dt>
            <dd>{config.sso.entryPoint || t('未配置', 'Not configured')}</dd>
          </div>
          <div>
            <dt>{t('数据驻留', 'Data residency')}</dt>
            <dd>
              {config.dataResidency.region} · {t(`保留 ${config.dataResidency.retentionDays} 天`, `${config.dataResidency.retentionDays} days retention`)}
            </dd>
          </div>
          <div>
            <dt>{t('密码策略', 'Password policy')}</dt>
            <dd>
              {t(
                `至少 ${config.passwordPolicy.minLength} 位 · 会话 ${config.passwordPolicy.sessionTimeoutHours} 小时`,
                `Min ${config.passwordPolicy.minLength} chars · ${config.passwordPolicy.sessionTimeoutHours}h session`
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="dr-card enterprise-panel" aria-labelledby="enterprise-audit-title">
        <div className="enterprise-panel-head">
          <div>
            <h2 id="enterprise-audit-title">
              {t('审计日志', 'Audit log')} <span className="enterprise-count">{audit.total}</span>
            </h2>
            <p>{t('最近 50 条记录，按时间倒序。', 'Latest 50 entries, newest first.')}</p>
          </div>
          <button type="button" className="dr-btn" onClick={exportAudit} disabled={audit.items.length === 0}>
            <Icon name="download" size={14} />
            {t('导出日志', 'Export log')}
          </button>
        </div>

        {audit.items.length === 0 ? (
          <div className="enterprise-empty">
            <Icon name="shield" size={22} />
            <p>{t('还没有审计事件。保存安全策略或团队操作后会出现在这里。', 'No audit events yet. Security saves and team actions appear here.')}</p>
          </div>
        ) : (
          <div className="enterprise-table-wrap">
            <table className="dr-table enterprise-table">
              <thead>
                <tr>
                  <th>{t('时间', 'Time')}</th>
                  <th>{t('操作者', 'Actor')}</th>
                  <th>{t('动作', 'Action')}</th>
                  <th>{t('资源', 'Resource')}</th>
                  <th>{t('结果', 'Result')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="enterprise-mono">{formatTime(entry.timestamp)}</td>
                    <td>{entry.actor}</td>
                    <td>
                      <code>{entry.action}</code>
                    </td>
                    <td>{entry.resourceType || '—'}</td>
                    <td>
                      <span className={`enterprise-result enterprise-result-${entry.result}`}>
                        {entry.result === 'success' ? t('成功', 'Success') : t('失败', 'Failure')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dr-card enterprise-panel" aria-labelledby="enterprise-deploy-title">
        <div className="enterprise-panel-head">
          <div>
            <h2 id="enterprise-deploy-title">{t('私有化部署', 'Self-hosted deployment')}</h2>
            <p>{t('当前安装版本与支持能力。', 'Current installation and support coverage.')}</p>
          </div>
        </div>
        <dl className="enterprise-deploy">
          <div>
            <dt>{t('版本', 'Version')}</dt>
            <dd className="enterprise-mono">{deployment.version}</dd>
          </div>
          <div>
            <dt>{t('部署模式', 'Deployment')}</dt>
            <dd className="enterprise-mono">{deployment.deployment}</dd>
          </div>
          <div>
            <dt>{t('SLA', 'SLA')}</dt>
            <dd>{deployment.support.sla}</dd>
          </div>
          <div>
            <dt>{t('支持渠道', 'Support channel')}</dt>
            <dd>{deployment.support.channel}</dd>
          </div>
        </dl>
        <div className="enterprise-features">
          {deployment.features.map((feature) => (
            <code key={feature}>{feature}</code>
          ))}
        </div>
      </section>

      <Modal
        open={confirmOpen}
        title={t('保存安全策略', 'Save security policy')}
        width={440}
        onClose={() => (!savePolicy.isPending ? setConfirmOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setConfirmOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={savePolicy.isPending}
              onClick={() => savePolicy.mutate()}
            >
              {savePolicy.isPending ? t('保存中…', 'Saving…') : t('确认保存', 'Save')}
            </button>
          </>
        }
      >
        <p className="enterprise-confirm">
          {t(
            '策略会立即对整个企业空间生效，并写入审计日志。确认保存这些变更？',
            'Policies take effect for the whole enterprise immediately and are written to the audit log. Save these changes?'
          )}
        </p>
        <ul className="enterprise-confirm-list">
          {toggles.map((item) => (
            <li key={item.key}>
              <span>{t(item.zh, item.en)}</span>
              <strong>{policy[item.key] ? t('开启', 'On') : t('关闭', 'Off')}</strong>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
