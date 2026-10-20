import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { DashboardPage } from '../pages/Dashboard'
import { ProjectsPage } from '../pages/Projects'
import { TemplatesPage } from '../pages/Templates'
import { MorePage } from '../pages/More'
import { DocsPage } from '../pages/Docs'
import { ModerationPage } from '../pages/Moderation'
import { NotFoundPage } from '../pages/NotFound'
import { LogoutPage } from '../pages/Logout'
import { LegacyView } from '../features/legacy/LegacyView'

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
        <Routes key={routeKey}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
          <Route path="/logout" element={<LogoutPage />} />

          {/* 别名与旧链接兼容 */}
          <Route path="/project/new" element={<Navigate to="/projects?create=1" replace />} />
          <Route path="/editor/:id" element={<EditorRedirect />} />
          <Route path="/developer" element={<Navigate to="/api-console" replace />} />
          <Route path="/marketplace" element={<Navigate to="/store" replace />} />

          {/* 编辑器：legacy 桥接（Phase 2 起逐阶段迁移） */}
          <Route
            path="/project/:id"
            element={<LegacyParamRoute module="editor" renderer="renderEditor" title="项目编辑器" />}
          />

          {/* 小说剧场 */}
          <Route
            path="/novels"
            element={<LegacyView module="novels" renderer="renderNovelsPage" title="小说剧场" />}
          />
          <Route
            path="/novel/:id"
            element={<LegacyParamRoute module="novels" renderer="renderNovelsPage" title="小说工作台" />}
          />

          {/* 其余页面：渐进迁移桥 */}
          <Route path="/challenges" element={<LegacyView module="challenges" renderer="renderChallengesPage" title="创作挑战" />} />
          <Route path="/directors" element={<LegacyView module="directors" renderer="renderDirectorsPage" title="导演模式" />} />
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
          <Route path="/stats" element={<LegacyView module="stats" renderer="renderStatsPage" title="创作数据" />} />
          <Route path="/pricing" element={<LegacyView module="pricing" renderer="renderPricingPage" title="套餐与定价" />} />
          <Route path="/settings" element={<LegacyView module="settings" renderer="renderSettingsPage" title="设置" />} />
          <Route path="/recycle-bin" element={<LegacyView module="recycleBin" renderer="renderRecycleBin" title="回收站" />} />
          <Route path="/login" element={<LegacyView module="auth" renderer="renderAuthPage" title="登录" />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}
