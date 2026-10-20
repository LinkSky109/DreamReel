import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../lib/i18n'
import { Icon } from '../../components/Icon'
import { showToast } from '../../lib/toast'

type Props = {
  projectId: string
  tab: string
}

/**
 * Phase 2 过渡：尚未迁移的阶段（配音 / 剪辑 / 图片 / 角色 / 场景 / 影评 / 协作 / 版本 / 设置）
 * 继续复用 legacy 编辑器能力，但隐藏其自带页头与标签栏，由 React Shell 统一承载。
 */
export function LegacyEditorStage({ projectId, tab }: Props) {
  const { t } = useLang()
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setStatus('loading')
      try {
        const legacyPath = '/js/views/editor.js'
        const mod = (await import(/* @vite-ignore */ legacyPath)) as {
          renderEditor?: (container: HTMLElement, id: string) => Promise<void>
        }
        if (cancelled || !mountRef.current) return
        if (typeof mod.renderEditor !== 'function') throw new Error('legacy renderEditor not found')

        if (!mountRef.current.dataset.mounted) {
          await mod.renderEditor(mountRef.current, projectId)
          if (cancelled || !mountRef.current) return
          mountRef.current.dataset.mounted = '1'
        }

        document.dispatchEvent(new CustomEvent(`editor-tab-${tab}`))
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        console.error('[legacy-editor]', error)
        setStatus('error')
        showToast((error as Error).message, 'error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, tab])

  return (
    <div className="ed-legacy-wrap">
      {status === 'loading' ? (
        <div className="dr-legacy-loading">{t('正在加载阶段…', 'Loading stage…')}</div>
      ) : null}
      {status === 'error' ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">{t('阶段加载失败', 'Stage failed to load')}</div>
          <button type="button" className="dr-btn" onClick={() => window.location.reload()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : null}
      <div ref={mountRef} className="ed-legacy-embed" hidden={status !== 'ready'} />
    </div>
  )
}
