import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { NotFoundPage } from '../pages/NotFound'
import { LogoutPage } from '../pages/Logout'
import { LegacyView } from '../features/legacy/LegacyView'

const DashboardPage = lazy(() =>
  import('../pages/Dashboard').then((module) => ({ default: module.DashboardPage }))
)
const ProjectsPage = lazy(() =>
  import('../pages/Projects').then((module) => ({ default: module.ProjectsPage }))
)
const TemplatesPage = lazy(() =>
  import('../pages/Templates').then((module) => ({ default: module.TemplatesPage }))
)
const MorePage = lazy(() =>
  import('../pages/More').then((module) => ({ default: module.MorePage }))
)
const DocsPage = lazy(() =>
  import('../pages/Docs').then((module) => ({ default: module.DocsPage }))
)
const ModerationPage = lazy(() =>
  import('../pages/Moderation').then((module) => ({ default: module.ModerationPage }))
)
const DirectorsPage = lazy(() =>
  import('../pages/Directors').then((module) => ({ default: module.DirectorsPage }))
)
const ChallengesPage = lazy(() =>
  import('../pages/Challenges').then((module) => ({ default: module.ChallengesPage }))
)
const PricingPage = lazy(() =>
  import('../pages/Pricing').then((module) => ({ default: module.PricingPage }))
)
const StatsPage = lazy(() =>
  import('../pages/Stats').then((module) => ({ default: module.StatsPage }))
)
const RecycleBinPage = lazy(() =>
  import('../pages/RecycleBin').then((module) => ({ default: module.RecycleBinPage }))
)
const LoginPage = lazy(() =>
  import('../pages/Login').then((module) => ({ default: module.LoginPage }))
)
const ShotsPage = lazy(() =>
  import('../pages/ShotsPage').then((module) => ({ default: module.ShotsPage }))
)
const NovelDetailPage = lazy(() =>
  import('../pages/NovelDetail').then((module) => ({ default: module.NovelDetailPage }))
)
const NovelsPage = lazy(() =>
  import('../pages/Novels').then((module) => ({ default: module.NovelsPage }))
)
const SettingsPage = lazy(() =>
  import('../pages/Settings').then((module) => ({ default: module.SettingsPage }))
)
const SharedProjectPage = lazy(() =>
  import('../pages/SharedProject').then((module) => ({ default: module.SharedProjectPage }))
)
const EditorPage = lazy(() =>
  import('../features/editor/EditorPage').then((module) => ({ default: module.EditorPage }))
)

function RouteFallback() {
  return (
    <div className="dr-page">
      <div className="dr-card dr-state" style={{ padding: 48 }}>
        加载中…
      </div>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

function LegacyParamRoute({
  module,
  renderer,
  title,
}: {
  module: string
  renderer: string
  title: string
}) {
  const { id, name } = useParams()
  return <LegacyView module={module} renderer={renderer} param={id ?? name} title={title} />
}

function EditorRedirect() {
  const { id } = useParams()
  return <Navigate to={`/project/${id ?? ''}`} replace />
}

export function App() {
  const [routeKey, setRouteKey] = useState(0)

  useEffect(() => {
    const rerender = () => setRouteKey((key) => key + 1)
    window.addEventListener('dreamreel:rerender', rerender)
    return () => window.removeEventListener('dreamreel:rerender', rerender)
  }, [])

  return (
    <AppShell>
      <ScrollToTop />
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
        <Routes key={routeKey}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/share/:token" element={<SharedProjectPage />} />

          {/* 别名与旧链接兼容 */}
          <Route path="/project/new" element={<Navigate to="/projects?create=1" replace />} />
          <Route path="/editor/:id" element={<EditorRedirect />} />
          <Route path="/developer" element={<Navigate to="/api-console" replace />} />
          <Route path="/marketplace" element={<Navigate to="/store" replace />} />

          {/* 编辑器：React Shell + 剧本 / 分镜 / 生成；其余阶段 legacy 桥接 */}
          <Route path="/project/:id" element={<EditorPage />} />

          {/* 小说剧场 */}
          <Route
            path="/novels"
            element={<NovelsPage />}
          />
          <Route path="/novel/:id" element={<NovelDetailPage />} />
          <Route path="/novel/:id/shots/:eid" element={<ShotsPage />} />

          {/* 其余页面：渐进迁移桥 */}
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/directors" element={<DirectorsPage />} />
          <Route path="/title-sequences" element={<LegacyView module="titleSequences" renderer="renderTitleSequencesPage" title="创意片头" />} />
          <Route path="/studios" element={<LegacyView module="studios" renderer="renderStudiosPage" title="剧场计划" />} />
          <Route
            path="/studio/:id"
            element={<LegacyParamRoute module="studios" renderer="renderStudiosPage" title="剧场计划" />}
          />
          <Route path="/community" element={<LegacyView module="community" renderer="renderCommunityPage" title="影评社区" />} />
          <Route path="/store" element={<LegacyView module="store" renderer="renderStorePage" title="素材商城" />} />
          <Route path="/teams" element={<LegacyView module="teams" renderer="renderTeamsPage" title="团队协作" />} />
          <Route
            path="/team/:id"
            element={<LegacyParamRoute module="teams" renderer="renderTeamsPage" title="团队协作" />}
          />
          <Route path="/enterprise" element={<LegacyView module="enterprise" renderer="renderEnterprise" title="企业管理" />} />
          <Route path="/api-console" element={<LegacyView module="apiConsole" renderer="renderApiConsole" title="API 开发者" />} />
          <Route path="/gallery" element={<LegacyView module="gallery" renderer="renderGalleryPage" title="作品广场" />} />
          <Route
            path="/creator/:name"
            element={<LegacyParamRoute module="creator" renderer="renderCreatorPage" title="创作者主页" />}
          />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/system-settings"
            element={<LegacyView module="settings" renderer="renderSettingsPage" title="系统监控" />}
          />
          <Route path="/recycle-bin" element={<RecycleBinPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}
