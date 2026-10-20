import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'
import { NAV_GROUPS } from '../app/nav'
import { Icon } from '../components/Icon'

const EXTRA_LINKS = [
  { path: '/pricing', label: '套餐与定价', labelEn: 'Pricing', icon: 'shield' },
  { path: '/docs', label: 'API 文档', labelEn: 'API docs', icon: 'file-text' },
  { path: '/moderation', label: '内容审核', labelEn: 'Moderation', icon: 'alert' },
  { path: '/login', label: '登录 / 注册', labelEn: 'Sign in', icon: 'user' },
]

export function MorePage() {
  const { t, navLabel, navGroupTitle, lang } = useLang()

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('全部功能', 'All features')}</h1>
          <p className="dr-page-sub">{t('与侧栏一致的完整入口索引。', 'Complete index of all entries.')}</p>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <section className="dr-section" key={group.title} style={{ marginTop: 20 }}>
          <div className="dr-section-head">
            <h2 className="dr-section-title">{navGroupTitle(group.title)}</h2>
          </div>
          <div className="dr-grid dr-grid-3">
            {group.items.map((item) => (
              <Link className="dr-card dr-card-hover dr-template-card" key={item.path} to={item.path}>
                <div className="dr-template-icon">
                  <Icon name={item.icon} size={17} />
                </div>
                <div className="dr-template-name">{navLabel(item)}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="dr-section" style={{ marginTop: 20 }}>
        <div className="dr-section-head">
          <h2 className="dr-section-title">{t('账户与支持', 'Account & support')}</h2>
        </div>
        <div className="dr-grid dr-grid-3">
          {EXTRA_LINKS.map((item) => (
            <Link className="dr-card dr-card-hover dr-template-card" key={item.path} to={item.path}>
              <div className="dr-template-icon">
                <Icon name={item.icon} size={17} />
              </div>
              <div className="dr-template-name">{lang === 'en' ? item.labelEn : item.label}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
