export type NavItem = {
  path: string
  label: string
  labelEn: string
  icon: string
  core?: boolean
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

// 规范 §4.1：四组，不新增一级入口
export const NAV_GROUPS: NavGroup[] = [
  {
    title: '创作',
    items: [
      { path: '/', label: '工作台', labelEn: 'Dashboard', icon: 'home' },
      { path: '/novels', label: '小说剧场', labelEn: 'Novel Theater', icon: 'book', core: true },
      { path: '/projects', label: '项目库', labelEn: 'Projects', icon: 'folder' },
      { path: '/templates', label: '模板库', labelEn: 'Templates', icon: 'template' },
      { path: '/challenges', label: '创作挑战', labelEn: 'Challenges', icon: 'trophy' },
    ],
  },
  {
    title: '创作工具',
    items: [
      { path: '/directors', label: '导演模式', labelEn: 'Directors', icon: 'film' },
      { path: '/title-sequences', label: '创意片头', labelEn: 'Title Sequences', icon: 'clapper' },
      { path: '/studios', label: '剧场计划', labelEn: 'Studios', icon: 'theater' },
      { path: '/community', label: '影评社区', labelEn: 'Community', icon: 'message' },
    ],
  },
  {
    title: '商业与团队',
    items: [
      { path: '/store', label: '素材商城', labelEn: 'Store', icon: 'store' },
      { path: '/teams', label: '团队协作', labelEn: 'Teams', icon: 'users' },
      { path: '/enterprise', label: '企业管理', labelEn: 'Enterprise', icon: 'building' },
      { path: '/api-console', label: 'API 开发者', labelEn: 'API Console', icon: 'plug' },
    ],
  },
  {
    title: '发现与账户',
    items: [
      { path: '/gallery', label: '作品广场', labelEn: 'Gallery', icon: 'compass' },
      { path: '/stats', label: '创作数据', labelEn: 'Analytics', icon: 'chart' },
      { path: '/settings', label: '设置', labelEn: 'Settings', icon: 'settings' },
      { path: '/recycle-bin', label: '回收站', labelEn: 'Recycle Bin', icon: 'trash' },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export const EXTRA_LABELS: Record<string, string> = {
  '/pricing': '套餐与定价',
  '/docs': 'API 文档',
  '/system-settings': '系统监控',
  '/moderation': '内容审核',
  '/login': '登录',
  '/more': '全部功能',
  '/logout': '退出登录',
}

export function labelForPath(pathname: string): string {
  const navItem = NAV_ITEMS.find((item) => item.path === pathname)
  if (navItem) return navItem.label
  if (EXTRA_LABELS[pathname]) return EXTRA_LABELS[pathname]
  if (pathname.startsWith('/project/')) return '项目编辑器'
  if (pathname.startsWith('/novel/') || pathname.startsWith('/novel-legacy/')) return '小说工作台'
  if (pathname.startsWith('/creator/')) return '创作者主页'
  if (pathname.startsWith('/studio/')) return '剧场计划'
  if (pathname.startsWith('/team/')) return '团队协作'
  return '页面'
}
