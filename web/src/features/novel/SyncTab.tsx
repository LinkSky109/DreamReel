import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { NovelDetail, NovelSyncResult } from '../../domain/types'
import { VoicePanel } from './VoicePanel'
import './SyncTab.css'
import { pluralize } from '../../lib/format'

type BusyKey = 'style' | 'local-plan' | 'local' | 'webdav-plan' | 'webdav' | 'quark-plan' | 'quark' | 'drive' | 'qr' | 'logout' | null

function summarize(result: NovelSyncResult, backend: string, t: (zh: string, en: string) => string) {
  const parts: string[] = []
  if (backend === 'local') {
    parts.push(`${t('已复制', 'Copied')} ${result.copied ?? 0}`)
    parts.push(`${t('跳过', 'Skipped')} ${result.skipped ?? 0}`)
  } else {
    parts.push(`${t('上传', 'Uploaded')} ${result.uploaded ?? 0}`)
    parts.push(`${t('跳过', 'Skipped')} ${result.skipped ?? 0}`)
  }
  if (result.failed?.length) parts.push(`${t('失败', 'Failed')} ${result.failed.length}`)
  if (result.remoteCheck?.ok === false) {
    parts.push(`${t('远端缺失', 'Remote missing')} ${result.remoteCheck.missing?.length ?? '?'}`)
  }
  return parts.join(' / ')
}

const SCOPE_LABELS: Record<string, { zh: string; en: string }> = {
  deliverables: { zh: '产物 + 文档', en: 'Deliverables + docs' },
  media: { zh: '仅产物', en: 'Media only' },
  all: { zh: '全部', en: 'All' },
}

export function SyncTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState('deliverables')
  const [localDir, setLocalDir] = useState('')
  const [remoteDir, setRemoteDir] = useState('')
  const [conflict, setConflict] = useState('overwrite')
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState<BusyKey>(null)
  const [report, setReport] = useState('')
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState('')
  const [qrMsg, setQrMsg] = useState('')
  const [driveMsg, setDriveMsg] = useState('')

  const scopesQuery = useQuery({
    queryKey: ['novel-sync-scopes', novel.id],
    queryFn: () => api.getNovelSyncScopes(novel.id),
  })
  const manifestQuery = useQuery({
    queryKey: ['novel-manifest', novel.id, scope],
    queryFn: () => api.getNovelManifest(novel.id, scope),
  })
  const ledgerQuery = useQuery({
    queryKey: ['novel-sync-ledger', novel.id],
    queryFn: () => api.getNovelSyncLedger(novel.id),
  })
  const driveQuery = useQuery({
    queryKey: ['cloud-drive-status'],
    queryFn: () => api.getCloudDriveStatus(false),
    staleTime: 30_000,
  })

  const scopes = scopesQuery.data ?? [
    { key: 'deliverables', label: t('产物 + 文档', 'Deliverables + docs') },
    { key: 'media', label: t('仅产物', 'Media only') },
    { key: 'all', label: t('全部', 'All') },
  ]
  const manifest = manifestQuery.data
  const ledger = ledgerQuery.data

  const refreshSync = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-sync-ledger', novel.id] })
    queryClient.invalidateQueries({ queryKey: ['novel-manifest', novel.id] })
    onChanged()
  }

  const generateStyle = async () => {
    setBusy('style')
    try {
      await api.generateNovelStyle(novel.id)
      showToast(t('风格已生成', 'Style generated'), 'success')
      queryClient.invalidateQueries({ queryKey: ['novel', novel.id] })
      onChanged()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const runSync = async (
    backend: 'local' | 'webdav' | 'quark',
    dryRun: boolean,
    key: BusyKey
  ) => {
    if (backend === 'local' && !localDir.trim()) {
      showToast(t('请填目标目录', 'Enter a target directory'), 'error')
      return
    }
    setBusy(key)
    try {
      const result = await api.syncNovel(novel.id, {
        backend,
        dryRun,
        targetDir: backend === 'local' ? localDir.trim() : undefined,
        remoteDir: backend === 'local' ? undefined : remoteDir.trim() || undefined,
        onConflict: conflict,
        force,
        scope,
      })
      setReport(JSON.stringify(result, null, 2))
      if (dryRun) {
        showToast(
          t(
            `待传输 ${result.changed ?? 0}/${result.fileCount ?? 0} 个文件`,
            `${result.changed ?? 0}/${result.fileCount ?? 0} files to transfer`
          ),
          'success'
        )
      } else {
        const ok = !result.failed?.length && result.remoteCheck?.ok !== false
        showToast(summarize(result, backend, t), ok ? 'success' : 'error')
        refreshSync()
      }
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const checkDrive = async () => {
    setBusy('drive')
    setDriveMsg(t('校验中…', 'Checking…'))
    try {
      const status = await api.getCloudDriveStatus(true)
      setDriveMsg(status.verified ? t('✅ 登录态有效', '✅ Session valid') : `❌ ${status.error ?? t('登录态无效', 'Invalid session')}`)
    } catch (error) {
      setDriveMsg(`❌ ${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const startQuarkLogin = async () => {
    setBusy('qr')
    setQrMsg(t('正在生成二维码…', 'Creating QR code…'))
    try {
      const session = await api.createQuarkQr()
      setQrSvg(session.svg)
      setQrToken(session.token)
      setQrMsg(t(`等待扫码…（约 ${Math.round(session.expiresInSec / 60)} 分钟有效）`, `Waiting for scan (valid ~${Math.round(session.expiresInSec / 60)} min)`))
    } catch (error) {
      setQrMsg(`❌ ${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const logoutDrive = async () => {
    setBusy('logout')
    try {
      await api.logoutCloudDrive()
      showToast(t('已退出夸克登录', 'Logged out of Quark'), 'success')
      setQrToken(null)
      setQrSvg('')
      setDriveMsg('')
      queryClient.invalidateQueries({ queryKey: ['cloud-drive-status'] })
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!qrToken) return undefined
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const status = await api.getQuarkQrStatus(qrToken)
        if (!active) return
        if (status.state === 'success') {
          setQrToken(null)
          setQrSvg('')
          setQrMsg(t('✅ 登录成功', '✅ Login successful'))
          showToast(t('夸克登录成功', 'Quark login successful'), 'success')
          queryClient.invalidateQueries({ queryKey: ['cloud-drive-status'] })
        } else if (status.state === 'failed') {
          setQrToken(null)
          setQrSvg('')
          setQrMsg(`❌ ${status.message ?? t('二维码已失效', 'QR expired')}`)
        }
      } catch (error) {
        if (!active) return
        setQrToken(null)
        setQrSvg('')
        setQrMsg(`❌ ${(error as Error).message}`)
      }
    }, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [qrToken, queryClient, t])

  const drive = driveQuery.data
  const style = novel.style
  const disabled = Boolean(busy)

  return (
    <>
      <section className="dr-card dr-style-card">
        <div className="dr-style-head">
          <h2>{t('全书风格', 'Book style')}</h2>
          <button className="dr-btn dr-btn-primary" type="button" disabled={disabled} onClick={generateStyle}>
            {busy === 'style' ? t('生成中…', 'Generating…') : style?.name ? t('重新生成风格（LLM）', 'Regenerate style') : t('生成风格（LLM）', 'Generate style')}
          </button>
        </div>
        <p className="dr-novel-note">
          {t('贯穿设定图集 → 剧本 → 分镜/资产，生成一次后自动沿用。', 'Used across art → script → shots/assets once generated.')}
        </p>
        {style?.name ? (
          <dl className="dr-style-list">
            <div><dt>{t('风格名', 'Name')}</dt><dd>{style.name}</dd></div>
            <div><dt>{t('画面/色调', 'Visual')}</dt><dd>{style.visual || '—'}</dd></div>
            <div><dt>{t('叙事基调', 'Narration')}</dt><dd>{style.narration || '—'}</dd></div>
            <div><dt>{t('配乐情绪', 'Music')}</dt><dd>{style.music || '—'}</dd></div>
            <div><dt>{t('来源', 'Source')}</dt><dd>{style.provider || '—'}{style.scope ? ` · ${style.scope}` : ''}</dd></div>
          </dl>
        ) : (
          <p className="dr-novel-note">{t('（未生成）', '(not generated)')}</p>
        )}
      </section>

      <VoicePanel novelId={novel.id} />

      <section className="dr-card dr-quark-card">
        <div className="dr-quark-head">
          <h2>{t('网盘登录（夸克）', 'Cloud drive (Quark)')}</h2>
          <span className="dr-quark-state">
            {drive?.configured
              ? drive.source === 'env'
                ? t('已配置（环境变量 QUARK_COOKIE）', 'Configured via QUARK_COOKIE')
                : t('已登录（扫码保存）', 'Logged in (QR)')
              : t('未登录', 'Not logged in')}
          </span>
        </div>
        <p className="dr-novel-note">
          {t(
            '扫码用夸克 App 授权；cookie 只保存在服务端。二维码本地生成，不经过第三方服务。',
            'Scan with the Quark app; cookie stays server-side. QR is generated locally.'
          )}
        </p>
        <div className="dr-quark-actions">
          <button className="dr-btn" type="button" disabled={disabled} onClick={startQuarkLogin}>
            {t('扫码登录', 'Scan to log in')}
          </button>
          <button className="dr-btn" type="button" disabled={disabled} onClick={checkDrive}>
            {t('校验登录态', 'Verify session')}
          </button>
          <button className="dr-btn" type="button" disabled={disabled || drive?.source !== 'file'} onClick={logoutDrive}>
            {t('退出登录', 'Log out')}
          </button>
          {driveMsg ? <span className="dr-quark-msg">{driveMsg}</span> : null}
          {qrMsg ? <span className="dr-quark-msg">{qrMsg}</span> : null}
        </div>
        {qrSvg ? (
          <div className="dr-quark-qr">
            <img
              alt={t('夸克登录二维码', 'Quark login QR')}
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
            />
          </div>
        ) : null}
      </section>

      <section className="dr-card dr-sync-card">
        <div className="dr-sync-head">
          <h2>{t('剧集包 / 同步', 'Package / sync')}</h2>
          <div className="dr-sync-scope">
            <label>
              {t('同步范围', 'Scope')}
              <select className="dr-input" value={scope} onChange={(event) => setScope(event.target.value)}>
                {scopes.map((item) => (
                  <option key={item.key} value={item.key}>
                    {SCOPE_LABELS[item.key] ? t(SCOPE_LABELS[item.key].zh, SCOPE_LABELS[item.key].en) : item.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="dr-sync-count">
              {manifestQuery.isLoading
                ? t('统计中…', 'Counting…')
                : t(`${manifest?.fileCount ?? 0} 个文件（增量同步）`, `${manifest?.fileCount ?? 0} ${pluralize(manifest?.fileCount ?? 0, 'file')} (incremental)`)}
            </span>
          </div>
        </div>

        <p className="dr-novel-note">
          {ledger?.last
            ? t(
                `上次同步：${ledger.last.backend} → ${ledger.last.targetDir || ledger.last.url || ''}${
                  ledger.last.remoteDir ? ` / ${ledger.last.remoteDir}` : ''
                } · ${new Date(ledger.last.at).toLocaleString()} · 上传 ${ledger.last.uploaded ?? ledger.last.copied ?? 0} · 跳过 ${ledger.last.skipped ?? 0}${
                  ledger.last.failed ? ` · 失败 ${ledger.last.failed}` : ''
                }`,
                `Last sync: ${ledger.last.backend} · ${new Date(ledger.last.at).toLocaleString()}`
              )
            : t('尚无同步记录', 'No sync records yet')}
        </p>

        <div className="dr-sync-block">
          <h3>{t('本地目录', 'Local folder')}</h3>
          <div className="dr-sync-row">
            <input
              className="dr-input"
              placeholder={t('本地同步目标目录（如 /Users/link/out）', 'Local target folder')}
              value={localDir}
              disabled={disabled}
              onChange={(event) => setLocalDir(event.target.value)}
            />
            <button className="dr-btn" type="button" disabled={disabled} onClick={() => runSync('local', true, 'local-plan')}>
              {t('预览变更', 'Preview')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={disabled} onClick={() => runSync('local', false, 'local')}>
              {t('同步到本地', 'Sync to local')}
            </button>
          </div>
        </div>

        <div className="dr-sync-block">
          <h3>{t('网盘（WebDAV / NAS / 夸克）', 'Cloud (WebDAV / NAS / Quark)')}</h3>
          <div className="dr-sync-row">
            <input
              className="dr-input"
              placeholder={t(`远端子目录（默认用作品 id：${novel.id}）`, `Remote subfolder (default ${novel.id})`)}
              value={remoteDir}
              disabled={disabled}
              onChange={(event) => setRemoteDir(event.target.value)}
            />
            <select className="dr-input dr-sync-conflict" value={conflict} disabled={disabled} onChange={(event) => setConflict(event.target.value)}>
              <option value="overwrite">{t('覆盖同名', 'Overwrite')}</option>
              <option value="skip">{t('跳过已存在', 'Skip existing')}</option>
            </select>
            <label className="dr-sync-force">
              <input type="checkbox" checked={force} disabled={disabled} onChange={(event) => setForce(event.target.checked)} />
              {t('完整重传', 'Force upload')}
            </label>
          </div>
          <div className="dr-sync-row dr-sync-row-actions">
            <button className="dr-btn" type="button" disabled={disabled} onClick={() => runSync('webdav', true, 'webdav-plan')}>
              {t('WebDAV 预览', 'WebDAV preview')}
            </button>
            <button className="dr-btn" type="button" disabled={disabled} onClick={() => runSync('webdav', false, 'webdav')}>
              {t('同步到 WebDAV', 'Sync to WebDAV')}
            </button>
            <button className="dr-btn" type="button" disabled={disabled} onClick={() => runSync('quark', true, 'quark-plan')}>
              {t('夸克预览', 'Quark preview')}
            </button>
            <button className="dr-btn" type="button" disabled={disabled} onClick={() => runSync('quark', false, 'quark')}>
              {t('同步到夸克', 'Sync to Quark')}
            </button>
          </div>
          <p className="dr-novel-note">
            {t(
              'WebDAV 连接在 .env 配置；夸克需配置 QUARK_COOKIE。同步完成后会核对远端文件数，缺失会明确提示。',
              'WebDAV is configured in .env; Quark needs QUARK_COOKIE. Remote counts are verified after sync.'
            )}
          </p>
        </div>

        {report ? <pre className="dr-sync-report">{report}</pre> : null}
      </section>
    </>
  )
}
