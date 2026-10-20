import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, hasToken } from '../lib/api'
import { useTheme } from '../lib/theme'
import { useLang } from '../lib/i18n'
import { NAV_GROUPS, labelForPath } from '../app/nav'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { showToast } from '../lib/toast'
import { relativeTime } from '../lib/format'

const CommandPalette = lazy(() =>
  import('../components/CommandPalette').then((module) => ({ default: module.CommandPalette }))
)

function isActivePath(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(hasToken)

  useEffect(() => {
    const sync = () => setAuthed(hasToken())
    window.addEventListener('dreamreel:auth', sync)
    return () => window.removeEventListener('dreamreel:auth', sync)
  }, [])
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme, toggleTheme } = useTheme()
  const { lang, toggleLang, t, navLabel, navGroupTitle } = useLang()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const pathname = location.pathname

  useEffect(() => {
    setMobileOpen(false)
    setNotifOpen(false)
  }, [pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isInput =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.isContentEditable)

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (key === '?' && !isInput) {
        event.preventDefault()
        setHelpOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const quotaQuery = useQuery({
    queryKey: ['quota'],
    queryFn: () => api.getQuota(),
    staleTime: 60_000,
    retry: false,
  })

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    enabled: authed,
    retry: false,
    staleTime: 120_000,
  })

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(20),
    enabled: notifOpen,
    staleTime: 10_000,
  })

  const markAllRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      showToast(t('已全部标记为已读', 'All notifications marked as read'))
    },
  })

  const clearNotifications = useMutation({
    mutationFn: () => api.clearNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      showToast(t('通知已清空', 'Notifications cleared'))
    },
  })

  const openPalette = useCallback(() => setPaletteOpen(true), [])

  // 规范 §4.3：同 hash 点击也必须重渲染（React Router 对同路径是 no-op）
  const handleSamePath = useCallback(
    (path: string) => {
      if (pathname === path && !location.search) {
        window.dispatchEvent(new CustomEvent('dreamreel:rerender'))
      }
    },
    [pathname, location.search]
  )

  const remaining = quotaQuery.data?.video.daily.remaining
  const limit = quotaQuery.data?.video.daily.limit
  const user = meQuery.data?.user
  const unread = notificationsQuery.data?.unreadCount ?? 0

  // 公开分享页独立布局：不渲染侧栏 / 顶栏 / 命令面板
  if (pathname.startsWith('/share/')) return <>{children}</>

  return (
    <div className="dr-app">
      <a
        className="dr-skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        {t('跳到主内容', 'Skip to content')}
      </a>
      <aside className={`dr-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label={t('侧栏导航', 'Sidebar')}>
        <NavLink to="/" className="dr-brand">
          <span className="dr-brand-mark">
            <Icon name="clapper" size={18} />
          </span>
          <span className="dr-brand-name">DreamReel</span>
          <span className="dr-brand-sub">梦卷</span>
        </NavLink>

        <nav className="dr-nav">
          {NAV_GROUPS.map((group) => (
            <div className="dr-nav-group" key={group.title}>
              <div className="dr-nav-title">{navGroupTitle(group.title)}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="dr-nav-link"
                  aria-current={isActivePath(pathname, item.path) ? 'page' : undefined}
                  onClick={() => handleSamePath(item.path)}
                >
                  <Icon name={item.icon} size={17} />
                  <span>{navLabel(item)}</span>
                  {item.core ? <span className="dr-nav-badge">{t('核心', 'CORE')}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="dr-sidebar-foot">
          <span>v0.1.0</span>
          <NavLink to="/docs">{t('API 文档', 'API Docs')}</NavLink>
          <NavLink to="/pricing">{t('套餐', 'Pricing')}</NavLink>
        </div>
      </aside>

      <div
        className={`dr-scrim-mobile${mobileOpen ? ' is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <header className="dr-topbar">
        <button
          type="button"
          className="dr-icon-btn dr-mobile-toggle"
          aria-label={t('展开导航', 'Open navigation')}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Icon name="menu" size={20} />
        </button>

        <nav className="dr-breadcrumb" aria-label={t('面包屑', 'Breadcrumb')}>
          <NavLink to="/" onClick={() => handleSamePath('/')}>
            {t('工作台', 'Dashboard')}
          </NavLink>
          {pathname !== '/' ? (
            <>
              <span className="dr-breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <span className="dr-breadcrumb-current">{navBreadcrumb(pathname, lang)}</span>
            </>
          ) : null}
        </nav>

        <button
          type="button"
          className="dr-command-trigger"
          onClick={openPalette}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Icon name="search" size={15} />
          <span>{t('搜索或跳转…', 'Search or jump to…')}</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="dr-topbar-actions">
          <div
            className={`dr-quota${remaining !== undefined && remaining <= 1 ? ' is-low' : ''}`}
            title={t('今日剩余视频生成额度', 'Remaining video generations today')}
          >
            <Icon name="film" size={13} />
            <span>
              {remaining === undefined || limit === undefined ? '--/--' : `${remaining}/${limit}`}
            </span>
          </div>

          <button
            type="button"
            className="dr-icon-btn"
            aria-label={t('帮助', 'Help')}
            title={t('帮助与快捷键（?）', 'Help & shortcuts (?)')}
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="help" size={18} />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="dr-icon-btn"
              aria-label={t('通知', 'Notifications')}
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((open) => !open)}
            >
              <Icon name="bell" size={18} />
              {unread > 0 ? (
                <span className="dr-notif-badge">{unread > 99 ? '99+' : unread}</span>
              ) : null}
            </button>
            {notifOpen ? (
              <div className="dr-notif-panel" role="dialog" aria-label={t('通知', 'Notifications')}>
                <div className="dr-notif-head">
                  <strong>{t('通知', 'Notifications')}</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="dr-btn dr-btn-ghost"
                      style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      onClick={() => markAllRead.mutate()}
                      disabled={markAllRead.isPending}
                    >
                      {t('全部已读', 'Mark all read')}
                    </button>
                    <button
                      type="button"
                      className="dr-btn dr-btn-ghost"
                      style={{ height: 26, padding: '0 8px', fontSize: 12 }}
                      onClick={() => clearNotifications.mutate()}
                      disabled={clearNotifications.isPending}
                    >
                      {t('清空', 'Clear')}
                    </button>
                  </div>
                </div>
                <div className="dr-notif-list">
                  {notificationsQuery.isLoading ? (
                    <div className="dr-state" style={{ padding: 24 }}>
                      {t('加载中…', 'Loading…')}
                    </div>
                  ) : notificationsQuery.isError ? (
                    <div className="dr-state" style={{ padding: 24 }}>
                      {t('通知加载失败', 'Failed to load notifications')}
                    </div>
                  ) : (notificationsQuery.data?.items.length ?? 0) === 0 ? (
                    <div className="dr-state" style={{ padding: 24 }}>
                      {t('暂无通知', 'No notifications')}
                    </div>
                  ) : (
                    notificationsQuery.data?.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`dr-notif-item${item.read ? '' : ' is-unread'}`}
                        onClick={() => {
                          if (item.projectId) navigate(`/project/${item.projectId}`)
                          setNotifOpen(false)
                        }}
                      >
                        <div className="dr-notif-title">{item.title}</div>
                        <div className="dr-notif-msg">{item.message}</div>
                        <div className="dr-notif-time">{relativeTime(item.createdAt, lang)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="dr-icon-btn"
            aria-label={t('切换主题', 'Toggle theme')}
            title={theme === 'light' ? t('切换到深色', 'Switch to dark') : t('切换到浅色', 'Switch to light')}
            onClick={() => {
              toggleTheme()
              showToast(t('主题已切换', 'Theme changed'))
            }}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
          </button>

          <button
            type="button"
            className="dr-icon-btn dr-hide-sm"
            aria-label={t('切换语言', 'Toggle language')}
            title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
            onClick={toggleLang}
          >
            <span className="dr-lang-label">{lang === 'zh' ? '中' : 'EN'}</span>
          </button>

          <button
            type="button"
            className="dr-btn dr-btn-primary dr-hide-sm"
            onClick={() => navigate('/projects?create=1')}
          >
            <Icon name="plus" size={15} />
            {t('新建项目', 'New project')}
          </button>

          {user ? (
            <div className="dr-user">
              <span className="dr-avatar">
                <Icon name="user" size={15} />
              </span>
              <span className="dr-user-name">{user.username}</span>
              <button
                type="button"
                className="dr-icon-btn"
                aria-label={t('退出登录', 'Sign out')}
                title={t('退出登录', 'Sign out')}
                onClick={() => navigate('/logout')}
              >
                <Icon name="logout" size={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="dr-btn" onClick={() => navigate('/login')}>
              {t('登录', 'Sign in')}
            </button>
          )}
        </div>
      </header>

      <main className="dr-main" id="main-content" tabIndex={-1}>
        {children}
      </main>

      <nav className="dr-mobile-nav" aria-label={t('移动端导航', 'Mobile navigation')}>
        {[
          { path: '/', label: t('工作台', 'Home'), icon: 'home' },
          { path: '/novels', label: t('小说', 'Novels'), icon: 'book' },
          { path: '/projects?create=1', label: t('新建', 'New'), icon: 'plus' },
          { path: '/projects', label: t('项目', 'Projects'), icon: 'folder' },
          { path: '/more', label: t('更多', 'More'), icon: 'more' },
        ].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            aria-current={isActivePath(pathname, item.path) ? 'page' : undefined}
            onClick={() => {
              if (!item.path.includes('?')) handleSamePath(item.path)
            }}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={null}>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </Suspense>

      <Modal
        open={helpOpen}
        title={t('帮助与快捷键', 'Help & shortcuts')}
        onClose={() => setHelpOpen(false)}
        footer={
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setHelpOpen(false)}>
            {t('知道了', 'Got it')}
          </button>
        }
      >
        <div className="dr-shortcuts">
          {[
            ['⌘K / Ctrl+K', t('打开命令面板', 'Command palette')],
            ['?', t('打开帮助', 'Open help')],
            ['Esc', t('关闭弹层', 'Close overlays')],
            [t('（编辑器内）← / →', '(Editor) ← / →'), t('切换镜头', 'Previous / next shot')],
            [t('（编辑器内）⌘S', '(Editor) ⌘S'), t('保存版本', 'Save version')],
          ].map(([keys, label]) => (
            <div className="dr-shortcut-row" key={keys}>
              <kbd>{keys}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function navBreadcrumb(pathname: string, lang: string): string {
  const label = labelForPath(pathname)
  if (lang !== 'en') return label
  const map: Record<string, string> = {
    工作台: 'Dashboard',
    项目库: 'Projects',
    模板库: 'Templates',
    小说剧场: 'Novel Theater',
    项目编辑器: 'Project editor',
    小说工作台: 'Novel workbench',
    全部功能: 'All features',
    'API 文档': 'API docs',
    内容审核: 'Moderation',
    套餐与定价: 'Pricing',
    设置: 'Settings',
    回收站: 'Recycle bin',
    创作数据: 'Analytics',
    作品广场: 'Gallery',
    创作者主页: 'Creator',
  }
  return map[label] ?? label
}
