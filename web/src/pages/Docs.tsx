import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'

const ENDPOINT_GROUPS = [
  {
    title: '项目与分镜',
    endpoints: [
      ['GET', '/api/projects', '项目列表 / 筛选'],
      ['POST', '/api/projects', '创建项目'],
      ['GET', '/api/projects/:id', '项目详情（含分镜）'],
      ['PUT', '/api/projects/:id', '更新项目设置'],
      ['PUT', '/api/projects/:id/shots/order', '调整镜头顺序'],
      ['PUT', '/api/projects/:id/shots/:shotId/duration', '调整镜头时长'],
    ],
  },
  {
    title: '生成链路',
    endpoints: [
      ['POST', '/api/script/generate', '生成剧本 / 分镜'],
      ['POST', '/api/script/adapt', '小说改编为剧本'],
      ['POST', '/api/video/generate', '生成镜头'],
      ['POST', '/api/video/regenerate', '重生成镜头'],
      ['GET', '/api/video/queue/project/:projectId', '项目生成队列'],
      ['POST', '/api/dubbing/generate', '多角色配音'],
      ['POST', '/api/edit-plans/generate', '剪辑方案'],
      ['POST', '/api/export/project/:projectId', '合成导出'],
    ],
  },
  {
    title: '小说剧场',
    endpoints: [
      ['GET', '/api/novels', '书目列表'],
      ['GET', '/api/novels/:id', '章节与设定'],
      ['POST', '/api/novels/:id/ingest', '导入并切章'],
      ['POST', '/api/novels/:id/extract', '重新抽取角色 / 世界观'],
      ['PATCH', '/api/novels/:id/characters/:cid', '更新 / 审校角色卡'],
      ['GET', '/api/novels/:id/review-stats', '审校统计'],
    ],
  },
]

const ERROR_CODES = [
  ['validation_error', '400 / 422', '参数校验失败'],
  ['unauthorized', '401', '未登录或 token 失效'],
  ['forbidden', '403', '无权限'],
  ['not_found', '404', '资源不存在'],
  ['conflict', '409', '版本冲突'],
  ['quota_exceeded', '429', '额度不足'],
  ['provider_error', '502', '上游生成服务失败'],
  ['internal_error', '500', '服务内部错误'],
]

export function DocsPage() {
  const { t } = useLang()

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('API 文档', 'API docs')}</h1>
          <p className="dr-page-sub">
            {t('最小可执行接入说明。真实端点以后端为准。', 'Minimal integration guide. Real endpoints follow the backend.')}
          </p>
        </div>
        <Link className="dr-btn" to="/api-console">
          <Icon name="key" size={15} />
          {t('管理 Key', 'Manage keys')}
        </Link>
      </div>

      <section className="dr-card" style={{ padding: 18 }}>
        <h2 className="dr-section-title">{t('鉴权', 'Authentication')}</h2>
        <p className="dr-page-sub" style={{ marginTop: 6 }}>
          {t(
            '所有请求携带 Bearer token；Key 只在创建时显示一次。',
            'Send a Bearer token on every request. Keys are shown only once at creation.'
          )}
        </p>
        <pre className="dr-code">
{`Authorization: Bearer <token>
Content-Type: application/json`}
        </pre>
      </section>

      {ENDPOINT_GROUPS.map((group) => (
        <section className="dr-section" key={group.title}>
          <div className="dr-section-head">
            <h2 className="dr-section-title">{group.title}</h2>
          </div>
          <div className="dr-card" style={{ overflow: 'auto' }}>
            <table className="dr-table">
              <thead>
                <tr>
                  <th>{t('方法', 'Method')}</th>
                  <th>{t('路径', 'Path')}</th>
                  <th>{t('说明', 'Description')}</th>
                </tr>
              </thead>
              <tbody>
                {group.endpoints.map(([method, path, description]) => (
                  <tr key={path}>
                    <td>
                      <span className="dr-method">{method}</span>
                    </td>
                    <td>
                      <code>{path}</code>
                    </td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="dr-section">
        <div className="dr-section-head">
          <h2 className="dr-section-title">{t('错误码', 'Error codes')}</h2>
        </div>
        <div className="dr-card" style={{ overflow: 'auto' }}>
          <table className="dr-table">
            <thead>
              <tr>
                <th>code</th>
                <th>HTTP</th>
                <th>{t('含义', 'Meaning')}</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CODES.map(([code, http, meaning]) => (
                <tr key={code}>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td>{http}</td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
