import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'

export function NotFoundPage() {
  const { t } = useLang()
  return (
    <div className="dr-page">
      <div className="dr-card dr-state" style={{ padding: 72 }}>
        <div className="dr-state-icon">
          <Icon name="alert" size={22} />
        </div>
        <div className="dr-state-title">{t('页面不存在', 'Page not found')}</div>
        <div>
          {t('这个地址没有对应的页面，可能已被移动或删除。', 'No page matches this URL. It may have moved or been removed.')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="dr-btn dr-btn-primary" to="/">
            {t('返回工作台', 'Back to dashboard')}
          </Link>
          <button type="button" className="dr-btn" onClick={() => window.location.reload()}>
            {t('重新加载', 'Reload')}
          </button>
        </div>
      </div>
    </div>
  )
}
