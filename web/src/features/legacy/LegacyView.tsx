import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../lib/i18n'
import { Icon } from '../../components/Icon'

type LegacyViewProps = {
  module: string
  renderer: string
  param?: string
  title?: string
}

/**
 * 渐进迁移桥：把尚未迁移的 legacy 视图挂载到 React 外壳内。
 * 视图模块仍是原生 ESM，位于 `web/public/legacy/js`（构建后由静态服务器托管），
 * 不参与 Vite 打包；前后端分离后不再依赖 Express。
 */
export function LegacyView({ module, renderer, param, title }: LegacyViewProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const { t } = useLang()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError('')

    const load = async () => {
      try {
        const mod = (await import(
          /* @vite-ignore */ `${import.meta.env.BASE_URL}legacy/js/views/${module}.js`
        )) as Record<
          string,
          unknown
        >
        if (cancelled) return
        const fn = mod[renderer]
        if (typeof fn !== 'function') {
          throw new Error(`legacy renderer not found: ${module}.${renderer}`)
        }
        await (fn as (container: HTMLElement, param?: string) => unknown)(mountRef.current!, param)
        if (!cancelled) setStatus('ready')
      } catch (loadError) {
        if (cancelled) return
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        console.error('[legacy-bridge]', module, loadError)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [module, renderer, param])

  return (
    <div className="dr-page">
      {status === 'loading' ? (
        <div className="dr-legacy-loading" role="status">
          {t('正在加载页面…', 'Loading page…')}
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">
            {title ?? module} {t('加载失败', 'failed to load')}
          </div>
          <div style={{ fontSize: 12 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="dr-btn" onClick={() => window.location.reload()}>
              {t('重试', 'Retry')}
            </button>
            <Link className="dr-btn" to="/">
              {t('返回工作台', 'Back to dashboard')}
            </Link>
          </div>
        </div>
      ) : null}
      <div
        id="app"
        ref={mountRef}
        className="dr-legacy"
        hidden={status !== 'ready'}
        aria-busy={status === 'loading'}
      />
    </div>
  )
}
