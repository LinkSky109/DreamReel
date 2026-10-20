import { Link } from 'react-router-dom'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'

type Endpoint = [method: string, path: string, zh: string, en: string]

const ENDPOINT_GROUPS: { zh: string; en: string; endpoints: Endpoint[] }[] = [
  {
    zh: '项目与分镜',
    en: 'Projects & shots',
    endpoints: [
      ['GET', '/api/projects', '项目列表 / 筛选', 'List / filter projects'],
      ['POST', '/api/projects', '创建项目', 'Create project'],
      ['GET', '/api/projects/:id', '项目详情（含分镜）', 'Project detail with shots'],
      ['PUT', '/api/projects/:id', '更新项目设置', 'Update project settings'],
      ['PUT', '/api/projects/:id/shots/order', '调整镜头顺序', 'Reorder shots'],
      ['PUT', '/api/projects/:id/shots/:shotId/duration', '调整镜头时长', 'Update shot duration'],
    ],
  },
  {
    zh: '生成链路',
    en: 'Generation pipeline',
    endpoints: [
      ['POST', '/api/script/generate', '生成剧本 / 分镜', 'Generate script / shots'],
      ['POST', '/api/script/adapt', '小说改编为剧本', 'Adapt novel into script'],
      ['POST', '/api/video/generate', '生成镜头', 'Generate shot'],
      ['POST', '/api/video/regenerate', '重生成镜头', 'Regenerate shot'],
      ['GET', '/api/video/queue/project/:projectId', '项目生成队列', 'Project generation queue'],
      ['POST', '/api/dubbing/generate', '多角色配音', 'Multi-character dubbing'],
      ['POST', '/api/edit-plans/generate', '剪辑方案', 'Generate edit plan'],
      ['POST', '/api/export/project/:projectId', '合成导出', 'Compose and export'],
    ],
  },
  {
    zh: '账户与额度',
    en: 'Account & quota',
    endpoints: [
      ['POST', '/api/auth/register', '注册', 'Register'],
      ['POST', '/api/auth/login', '登录', 'Log in'],
      ['GET', '/api/auth/me', '当前用户', 'Current user'],
      ['GET', '/api/quota/me', '当前额度', 'Current quota'],
      ['GET', '/api/subscription/plans', '套餐列表', 'List plans'],
      ['GET', '/api/subscription/current', '当前订阅', 'Current subscription'],
    ],
  },
  {
    zh: '资产与协作',
    en: 'Assets & collaboration',
    endpoints: [
      ['POST', '/api/images/generate', '生成图片', 'Generate image'],
      ['GET', '/api/images/assets', '图片资产', 'List image assets'],
      ['GET', '/api/scenes', '场景列表', 'List scenes'],
      ['POST', '/api/scenes', '创建场景', 'Create scene'],
      ['GET', '/api/characters', '角色列表', 'List characters'],
      ['POST', '/api/characters', '创建角色', 'Create character'],
      ['GET', '/api/collab/:projectId/comments', '评论列表', 'List comments'],
      ['POST', '/api/collab/:projectId/comments', '发表评论', 'Post comment'],
      ['GET', '/api/collab/:projectId/share', '分享设置', 'Share settings'],
      ['PUT', '/api/collab/:projectId/share', '更新分享设置', 'Update share settings'],
      ['GET', '/api/collab/shared/:token', '通过 token 访问分享', 'Access shared project'],
      ['GET', '/api/notifications', '通知列表', 'List notifications'],
      ['POST', '/api/notifications/read-all', '全部标记已读', 'Mark all read'],
    ],
  },
  {
    zh: '小说剧场',
    en: 'Novel theater',
    endpoints: [
      ['GET', '/api/novels', '书目列表', 'List novels'],
      ['GET', '/api/novels/:id', '章节与设定', 'Chapters and settings'],
      ['POST', '/api/novels/:id/ingest', '导入并切章', 'Import and split chapters'],
      ['POST', '/api/novels/:id/extract', '重新抽取角色 / 世界观', 'Re-extract characters / world'],
      ['PATCH', '/api/novels/:id/characters/:cid', '更新 / 审校角色卡', 'Update / review character card'],
      ['GET', '/api/novels/:id/review-stats', '审校统计', 'Review statistics'],
    ],
  },
]

const ERROR_CODES: [code: string, http: string, zh: string, en: string][] = [
  ['validation_error', '400 / 422', '参数校验失败', 'Validation failed'],
  ['unauthorized', '401', '未登录或 token 失效', 'Missing or expired token'],
  ['forbidden', '403', '无权限', 'Forbidden'],
  ['not_found', '404', '资源不存在', 'Resource not found'],
  ['conflict', '409', '版本冲突', 'Version conflict'],
  ['quota_exceeded', '429', '额度不足', 'Quota exceeded'],
  ['provider_error', '502', '上游生成服务失败', 'Upstream provider failed'],
  ['internal_error', '500', '服务内部错误', 'Internal server error'],
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
        <section className="dr-section" key={group.en}>
          <div className="dr-section-head">
            <h2 className="dr-section-title">{t(group.zh, group.en)}</h2>
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
                {group.endpoints.map(([method, path, zh, en]) => (
                  <tr key={`${method}-${path}`}>
                    <td>
                      <span className="dr-method">{method}</span>
                    </td>
                    <td>
                      <code>{path}</code>
                    </td>
                    <td>{t(zh, en)}</td>
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
              {ERROR_CODES.map(([code, http, zh, en]) => (
                <tr key={code}>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td>{http}</td>
                  <td>{t(zh, en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
