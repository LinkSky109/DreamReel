import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { NotFoundPage } from '../pages/NotFound'
import { LogoutPage } from '../pages/Logout'

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
const StorePage = lazy(() =>
  import('../pages/Store').then((module) => ({ default: module.StorePage }))
)
const StudiosPage = lazy(() =>
  import('../pages/Studios').then((module) => ({ default: module.StudiosPage }))
)
const CommunityPage = lazy(() =>
  import('../pages/Community').then((module) => ({ default: module.CommunityPage }))
)
const TitleSequencesPage = lazy(() =>
  import('../pages/TitleSequences').then((module) => ({ default: module.TitleSequencesPage }))
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
const TeamsPage = lazy(() =>
  import('../pages/Teams').then((module) => ({ default: module.TeamsPage }))
)
const EnterprisePage = lazy(() =>
  import('../pages/Enterprise').then((module) => ({ default: module.EnterprisePage }))
)
const ApiConsolePage = lazy(() =>
  import('../pages/ApiConsole').then((module) => ({ default: module.ApiConsolePage }))
)
const GalleryPage = lazy(() =>
  import('../pages/Gallery').then((module) => ({ default: module.GalleryPage }))
)
const CreatorPage = lazy(() =>
  import('../pages/Creator').then((module) => ({ default: module.CreatorPage }))
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

function EditorRedirect() {
  const { id } = useParams()
  return <Navigate to={`/project/${id ?? ''}`} replace />
}

export function App() {
  const [routeKey, setRouteKey] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const rerender = () => setRouteKey((key) => key + 1)
    window.addEventListener('dreamreel:rerender', rerender)
    return () => window.removeEventListener('dreamreel:rerender', rerender)
  }, [])

  useEffect(() => {
    const onUnauthorized = () => navigate('/login', { replace: true })
    window.addEventListener('dreamreel:unauthorized', onUnauthorized)
    return () => window.removeEventListener('dreamreel:unauthorized', onUnauthorized)
  }, [navigate])

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
          <Route path="/title-sequences" element={<TitleSequencesPage />} />
          <Route path="/studios" element={<StudiosPage />} />
          <Route path="/studio/:id" element={<StudiosPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/team/:id" element={<TeamsPage />} />
          <Route path="/enterprise" element={<EnterprisePage />} />
          <Route path="/api-console" element={<ApiConsolePage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/creator/:name" element={<CreatorPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/recycle-bin" element={<RecycleBinPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}
