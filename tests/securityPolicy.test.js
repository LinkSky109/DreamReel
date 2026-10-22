import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import config from '../src/config/index.js'
import { permissionsForRoles, PERMISSIONS } from '../src/security/roles.js'
import { authContextFromUser, can } from '../src/security/policy.js'
import { requirePermission } from '../src/middleware/authorize.js'
import { isPublicApiRequest } from '../src/middleware/authGate.js'

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('RBAC 策略', () => {
  it('owner 拥有全部权限', () => {
    const perms = permissionsForRoles(['owner'])
    for (const p of Object.values(PERMISSIONS)) assert.ok(perms.has(p), p)
  })

  it('viewer 只读，billing 只管账单', () => {
    const viewer = permissionsForRoles(['viewer'])
    assert.ok(viewer.has(PERMISSIONS.PROJECT_READ))
    assert.equal(viewer.has(PERMISSIONS.PROJECT_WRITE), false)
    const billing = permissionsForRoles(['billing'])
    assert.ok(billing.has(PERMISSIONS.BILLING_MANAGE))
    assert.equal(billing.has(PERMISSIONS.PROJECT_WRITE), false)
  })

  it('scopes 可直接授予权限', () => {
    const auth = authContextFromUser({ id: 'u1', role: 'viewer', scopes: [PERMISSIONS.API_KEY_MANAGE] })
    assert.equal(can(auth, PERMISSIONS.API_KEY_MANAGE), true)
    assert.equal(can(auth, PERMISSIONS.NOVEL_DELETE), false)
  })

  it('requirePermission：关闭强制时放行，开启后 401/403', () => {
    const original = config.auth.enforce
    try {
      config.auth.enforce = false
      let called = false
      requirePermission(PERMISSIONS.NOVEL_DELETE)({}, fakeRes(), () => {
        called = true
      })
      assert.equal(called, true)

      config.auth.enforce = true
      const noAuth = fakeRes()
      requirePermission(PERMISSIONS.NOVEL_DELETE)({}, noAuth, () => assert.fail('should not pass'))
      assert.equal(noAuth.statusCode, 401)

      const viewer = fakeRes()
      requirePermission(PERMISSIONS.NOVEL_DELETE)(
        { auth: authContextFromUser({ id: 'u2', role: 'viewer' }) },
        viewer,
        () => assert.fail('should not pass')
      )
      assert.equal(viewer.statusCode, 403)

      let allowed = false
      requirePermission(PERMISSIONS.NOVEL_DELETE)(
        { auth: authContextFromUser({ id: 'u3', role: 'owner' }) },
        fakeRes(),
        () => {
          allowed = true
        }
      )
      assert.equal(allowed, true)
    } finally {
      config.auth.enforce = original
    }
  })
})

describe('authGate 公开白名单', () => {
  it('登录与开放 API 公开', () => {
    assert.equal(isPublicApiRequest({ method: 'POST', baseUrl: '/api', path: '/auth/login' }), true)
    assert.equal(isPublicApiRequest({ method: 'GET', baseUrl: '/api', path: '/gallery/123' }), true)
    assert.equal(isPublicApiRequest({ method: 'POST', baseUrl: '/api', path: '/open/v1/foo' }), true)
  })

  it('/api/v1 与 /api 共用同一份白名单', () => {
    assert.equal(
      isPublicApiRequest({ method: 'POST', baseUrl: '/api', path: '/v1/auth/login' }),
      true
    )
    assert.equal(
      isPublicApiRequest({ method: 'POST', baseUrl: '/api', path: '/v1/auth/register' }),
      true
    )
    assert.equal(
      isPublicApiRequest({ method: 'GET', baseUrl: '/api', path: '/v1/gallery/123' }),
      true
    )
    assert.equal(
      isPublicApiRequest({ method: 'POST', baseUrl: '/api', path: '/v1/projects' }),
      false
    )
  })

  it('小说写接口不公开', () => {
    assert.equal(isPublicApiRequest({ method: 'DELETE', baseUrl: '/api', path: '/novels/1' }), false)
  })

  it('管理面（含 v1）不在公开白名单', () => {
    const cases = [
      { method: 'GET', baseUrl: '/api', path: '/enterprise/overview' },
      { method: 'GET', baseUrl: '/api', path: '/v1/enterprise/overview' },
      { method: 'GET', baseUrl: '/api', path: '/system/info' },
      { method: 'GET', baseUrl: '/api', path: '/v1/system/info' },
      { method: 'GET', baseUrl: '/api', path: '/webhooks' },
      { method: 'GET', baseUrl: '/api', path: '/v1/webhooks' },
      { method: 'GET', baseUrl: '/api', path: '/teams' },
      { method: 'GET', baseUrl: '/api', path: '/v1/teams' },
      { method: 'POST', baseUrl: '/api', path: '/cloud-drive/quark/qr' },
      { method: 'GET', baseUrl: '/api', path: '/v1/api-keys' },
    ]
    for (const req of cases) {
      assert.equal(isPublicApiRequest(req), false, `${req.method} ${req.baseUrl}${req.path}`)
    }
  })
})
