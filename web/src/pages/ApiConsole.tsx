import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { currentUserId } from '../lib/user'
import { formatNumber } from '../lib/format'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import type { ApiKeyCreated, ApiKeyRecord } from '../domain/types'
import './ApiConsole.css'

const SCOPES = [
  { id: 'project:read', zh: '查询项目', en: 'Read projects' },
  { id: 'project:write', zh: '创建项目', en: 'Create projects' },
  { id: 'video:generate', zh: '生成视频', en: 'Generate video' },
]

const ENDPOINTS = [
  { method: 'POST', path: '/api/open/v1/projects', scope: 'project:write', zh: '创建项目', en: 'Create project' },
  { method: 'GET', path: '/api/open/v1/projects/:projectId', scope: 'project:read', zh: '查询项目与镜头状态', en: 'Get project and shot status' },
  { method: 'POST', path: '/api/open/v1/videos/generate', scope: 'video:generate', zh: '生成单镜或全片视频', en: 'Generate shot or project video' },
  { method: 'GET', path: '/api/open/v1/key/info', scope: '—', zh: '查询当前 Key 信息与用量', en: 'Current key info and usage' },
]

function formatDate(value: string | null) {
  if (!value) return '—'
  return value.slice(0, 16).replace('T', ' ')
}

export function ApiConsolePage() {
  const queryClient = useQueryClient()
  const { t, lang } = useLang()
  const userId = useMemo(currentUserId, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [scopes, setScopes] = useState<string[]>(SCOPES.map((scope) => scope.id))
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  const [revoking, setRevoking] = useState<ApiKeyRecord | null>(null)
  const [copied, setCopied] = useState(false)

  const keysQuery = useQuery({
    queryKey: ['api-keys', userId],
    queryFn: () => api.listApiKeys(userId),
  })

  const keys = keysQuery.data?.items ?? []
  const totalCalls = keys.reduce((sum, key) => sum + key.callCount, 0)
  const activeScopes = new Set(keys.flatMap((key) => key.scopes)).size

  const createKey = useMutation({
    mutationFn: () => api.createApiKey({ name: keyName.trim(), scopes }),
    onSuccess: (result) => {
      setCreateOpen(false)
      setKeyName('')
      setScopes(SCOPES.map((scope) => scope.id))
      setCreated(result)
      setCopied(false)
      queryClient.invalidateQueries({ queryKey: ['api-keys', userId] })
      showToast(t('密钥已创建，仅显示一次', 'Key created — shown once'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => {
      setRevoking(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', userId] })
      showToast(t('密钥已吊销', 'Key revoked'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const copyKey = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.apiKey)
      setCopied(true)
      showToast(t('已复制到剪贴板', 'Copied to clipboard'))
    } catch {
      showToast(t('复制失败，请手动选择密钥', 'Copy failed — select the key manually'), 'error')
    }
  }

  const toggleScope = (id: string) =>
    setScopes((current) => (current.includes(id) ? current.filter((scope) => scope !== id) : [...current, id]))

  return (
    <div className="dr-page api-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Developer Platform</p>
          <h1>{t('API 开发者', 'API Console')}</h1>
          <p className="projects-lead">
            {t(
              '创建 Key、查看调用量与开放端点。基础地址 /api/open/v1，使用 Bearer 鉴权。',
              'Create keys, check usage and open endpoints. Base URL /api/open/v1 with Bearer auth.'
            )}
          </p>
        </div>
        <div className="api-head-actions">
          <Link className="dr-btn" to="/docs">
            <Icon name="file-text" size={14} />
            {t('API 文档', 'API docs')}
          </Link>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
            <Icon name="key" size={14} />
            {t('创建 Key', 'Create key')}
          </button>
        </div>
      </div>

      <div className="api-metrics">
        <div className="dr-card api-metric">
          <span>{t('请求量', 'Requests')}</span>
          <strong>{keysQuery.isLoading ? '—' : formatNumber(totalCalls, lang)}</strong>
          <small>{t('累计调用次数', 'Total calls')}</small>
        </div>
        <div className="dr-card api-metric">
          <span>{t('活跃 Key', 'Active keys')}</span>
          <strong>{keysQuery.isLoading ? '—' : keys.length}</strong>
          <small>{t('未吊销的密钥', 'Not revoked')}</small>
        </div>
        <div className="dr-card api-metric">
          <span>{t('权限范围', 'Scopes')}</span>
          <strong>{keysQuery.isLoading ? '—' : activeScopes}</strong>
          <small>{t(`可用 ${SCOPES.length} 项`, `${SCOPES.length} available`)}</small>
        </div>
      </div>

      <section className="dr-card api-panel" aria-labelledby="api-keys-title">
        <div className="api-panel-head">
          <h2 id="api-keys-title">{t('我的密钥', 'My keys')}</h2>
          <span>{t('密钥明文只在创建时显示一次', 'The full key is shown only once at creation')}</span>
        </div>

        {keysQuery.isLoading ? (
          <div className="dr-skeleton" style={{ height: 120 }} />
        ) : keysQuery.isError ? (
          <div className="api-empty">
            <p>{t('密钥加载失败', 'Failed to load keys')}：{(keysQuery.error as Error).message}</p>
            <button type="button" className="dr-btn" onClick={() => keysQuery.refetch()}>
              {t('重试', 'Retry')}
            </button>
          </div>
        ) : keys.length === 0 ? (
          <div className="api-empty">
            <Icon name="key" size={24} />
            <p>{t('还没有 API Key，创建一个开始集成。', 'No API keys yet. Create one to start integrating.')}</p>
            <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
              {t('创建 Key', 'Create key')}
            </button>
          </div>
        ) : (
          <div className="api-table-wrap">
            <table className="dr-table api-table">
              <thead>
                <tr>
                  <th>{t('名称', 'Name')}</th>
                  <th>{t('Key', 'Key')}</th>
                  <th>{t('权限', 'Scopes')}</th>
                  <th>{t('创建时间', 'Created')}</th>
                  <th>{t('最近使用', 'Last used')}</th>
                  <th>{t('调用', 'Calls')}</th>
                  <th><span className="sr-only">{t('操作', 'Actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>
                      <code>{key.keyPrefix}••••</code>
                    </td>
                    <td>
                      <div className="api-scope-list">
                        {key.scopes.map((scope) => (
                          <span key={scope}>{scope}</span>
                        ))}
                      </div>
                    </td>
                    <td className="api-mono">{formatDate(key.createdAt)}</td>
                    <td className="api-mono">{formatDate(key.lastUsedAt)}</td>
                    <td className="api-mono">{formatNumber(key.callCount, lang)}</td>
                    <td className="api-actions">
                      <button type="button" className="dr-btn dr-btn-danger" onClick={() => setRevoking(key)}>
                        {t('吊销', 'Revoke')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dr-card api-panel" aria-labelledby="api-endpoints-title">
        <div className="api-panel-head">
          <h2 id="api-endpoints-title">{t('开放端点', 'Open endpoints')}</h2>
          <span>{t('与 API 文档保持一致', 'Matches the API docs')}</span>
        </div>
        <div className="api-table-wrap">
          <table className="dr-table api-table">
            <thead>
              <tr>
                <th>{t('方法', 'Method')}</th>
                <th>{t('路径', 'Path')}</th>
                <th>{t('权限', 'Scope')}</th>
                <th>{t('说明', 'Description')}</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={`${endpoint.method}-${endpoint.path}`}>
                  <td>
                    <span className={`api-method api-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                  </td>
                  <td>
                    <code>{endpoint.path}</code>
                  </td>
                  <td>
                    <code>{endpoint.scope}</code>
                  </td>
                  <td>{t(endpoint.zh, endpoint.en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={createOpen}
        title={t('创建 API Key', 'Create API key')}
        width={480}
        onClose={() => (!createKey.isPending ? setCreateOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setCreateOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!keyName.trim() || scopes.length === 0 || createKey.isPending}
              onClick={() => createKey.mutate()}
            >
              {createKey.isPending ? t('创建中…', 'Creating…') : t('创建', 'Create')}
            </button>
          </>
        }
      >
        <div className="api-form">
          <label className="dr-field">
            <span className="dr-label">{t('密钥名称', 'Key name')}</span>
            <input
              className="dr-input"
              value={keyName}
              maxLength={40}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder={t('例如：剪辑服务', 'e.g. Editing service')}
            />
          </label>
          <fieldset className="api-scopes">
            <legend className="dr-label">{t('权限范围', 'Scopes')}</legend>
            {SCOPES.map((scope) => (
              <label key={scope.id} className="api-scope">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.id)}
                  onChange={() => toggleScope(scope.id)}
                />
                <span>
                  <strong>{t(scope.zh, scope.en)}</strong>
                  <code>{scope.id}</code>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="dr-hint">
            {t('至少选择一项权限。密钥创建后无法再次查看明文。', 'Select at least one scope. The full key cannot be viewed again.')}
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(created)}
        title={t('保存你的 API Key', 'Save your API key')}
        width={560}
        onClose={() => setCreated(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setCreated(null)}>
              {t('我已保存', 'I saved it')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" onClick={copyKey}>
              <Icon name={copied ? 'check' : 'file-text'} size={14} />
              {copied ? t('已复制', 'Copied') : t('复制密钥', 'Copy key')}
            </button>
          </>
        }
      >
        {created ? (
          <div className="api-created">
            <p className="api-warning">
              <Icon name="alert" size={14} />
              {t('这是唯一一次显示完整密钥，关闭后无法找回。', 'This is the only time the full key is shown. It cannot be recovered.')}
            </p>
            <code className="api-created-key">{created.apiKey}</code>
            <dl className="api-created-meta">
              <div>
                <dt>{t('名称', 'Name')}</dt>
                <dd>{created.name}</dd>
              </div>
              <div>
                <dt>{t('权限', 'Scopes')}</dt>
                <dd>{created.scopes.join(' · ')}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(revoking)}
        title={t('吊销 API Key', 'Revoke API key')}
        width={420}
        onClose={() => (!revokeKey.isPending ? setRevoking(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setRevoking(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-danger"
              type="button"
              disabled={revokeKey.isPending}
              onClick={() => revoking && revokeKey.mutate(revoking.id)}
            >
              {revokeKey.isPending ? t('吊销中…', 'Revoking…') : t('确认吊销', 'Revoke')}
            </button>
          </>
        }
      >
        <p className="api-warning">
          <Icon name="alert" size={14} />
          {t(
            `吊销后「${revoking?.name ?? ''}」将立即失效，正在使用它的服务会收到 401。`,
            `Revoking “${revoking?.name ?? ''}” invalidates it immediately; services using it will receive 401.`
          )}
        </p>
      </Modal>
    </div>
  )
}
