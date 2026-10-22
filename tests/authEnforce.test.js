import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuthEnforce } from '../src/config/authEnforce.js'

describe('resolveAuthEnforce', () => {
  it('生产环境未显式设置时默认开启', () => {
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'production' }), true)
  })

  it('生产环境可显式关闭（用于临时降级）', () => {
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'production', REQUIRE_AUTH: 'false' }), false)
  })

  it('开发/测试环境未设置时默认关闭', () => {
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'development' }), false)
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'test' }), false)
  })

  it('任意环境显式 true 时开启', () => {
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'development', REQUIRE_AUTH: 'true' }), true)
    assert.equal(resolveAuthEnforce({ NODE_ENV: 'test', REQUIRE_AUTH: ' TRUE ' }), true)
  })
})
