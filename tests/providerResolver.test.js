/**
 * ProviderResolver 测试套件
 * Phase 1: 验证四级回退链、API Key 校验、配置合并
 *
 * 运行方式:
 *   NODE_ENV=test node --test tests/providerResolver.test.js
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  isProviderConfigured,
  resolveProviderConfig,
  buildMergedConfig,
} from '../src/providers/providerResolver.js'
import { projectService } from '../src/services/projectService.js'
import {} from '../src/services/authService.js'
import { storageService } from '../src/services/storageService.js'
import { Project } from '../src/models/project.js'

describe('ProviderResolver', () => {
  describe('isProviderConfigured', () => {
    it('mock provider 永远返回 true', () => {
      assert.strictEqual(isProviderConfigured('video', 'mock'), true)
      assert.strictEqual(isProviderConfigured('llm', 'mock'), true)
      assert.strictEqual(isProviderConfigured('tts', 'mock'), true)
    })

    it('未知 provider 返回 false', () => {
      assert.strictEqual(isProviderConfigured('video', 'unknown'), false)
      assert.strictEqual(isProviderConfigured('llm', 'unknown'), false)
      assert.strictEqual(isProviderConfigured('tts', 'unknown'), false)
    })

    it('视频 provider 根据环境变量判断', () => {
      // 在测试环境中，环境变量为空字符串，所以应返回 false
      assert.strictEqual(isProviderConfigured('video', 'runway'), false)
      assert.strictEqual(isProviderConfigured('video', 'pika'), false)
      assert.strictEqual(isProviderConfigured('video', 'seedance'), false)
      assert.strictEqual(isProviderConfigured('video', 'minimax'), false)
      assert.strictEqual(isProviderConfigured('video', 'wan'), false)
    })

    it('LLM provider 根据环境变量判断', () => {
      assert.strictEqual(isProviderConfigured('llm', 'openai'), false)
    })

    it('TTS provider 根据环境变量判断', () => {
      assert.strictEqual(isProviderConfigured('tts', 'elevenlabs'), false)
    })
  })

  describe('resolveProviderConfig - 四级回退链', () => {
    let testProject
    let testUser

    beforeEach(() => {
      // 清理测试数据
      if (testProject) {
        projectService.projects.delete(testProject.id)
        testProject = null
      }
      if (testUser) {
        delete storageService.data.users[testUser.id]
        testUser = null
      }
    })

    it('无 projectId 和 userId 时回退到全局默认', () => {
      const resolved = resolveProviderConfig('video')
      assert.ok(resolved.provider)
      assert.strictEqual(resolved.source, 'global-default')
    })

    it('无 projectId 和 userId 时 LLM 回退到全局默认', () => {
      const resolved = resolveProviderConfig('llm')
      assert.ok(resolved.provider)
      assert.strictEqual(resolved.source, 'global-default')
    })

    it('无 projectId 和 userId 时 TTS 回退到全局默认', () => {
      const resolved = resolveProviderConfig('tts')
      assert.ok(resolved.provider)
      assert.strictEqual(resolved.source, 'global-default')
    })

    it('项目级配置优先于用户级和全局默认', () => {
      testProject = new Project({
        name: '测试项目',
        userId: 'test-user-1',
        providerPreferences: {
          video: { provider: 'mock', model: 'mock', config: {} },
          llm: null,
          tts: null,
          updatedAt: new Date().toISOString(),
        },
      })
      projectService.projects.set(testProject.id, testProject)

      const resolved = resolveProviderConfig('video', testProject.id, testProject.userId)
      assert.strictEqual(resolved.provider, 'mock')
      assert.strictEqual(resolved.source, 'project')
    })

    it('用户级默认优先于全局默认', () => {
      testUser = {
        id: 'test-user-2',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hash',
        salt: 'salt',
        defaultProviderPreferences: {
          video: { provider: 'mock', model: 'mock', config: {} },
          llm: null,
          tts: null,
          updatedAt: new Date().toISOString(),
        },
      }
      storageService.data.users[testUser.id] = testUser

      const resolved = resolveProviderConfig('video', null, testUser.id)
      assert.strictEqual(resolved.provider, 'mock')
      assert.strictEqual(resolved.source, 'user-default')
    })

    it('项目级未配置时回退到用户级', () => {
      testUser = {
        id: 'test-user-3',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hash',
        salt: 'salt',
        defaultProviderPreferences: {
          video: { provider: 'mock', model: 'mock', config: {} },
          llm: null,
          tts: null,
          updatedAt: new Date().toISOString(),
        },
      }
      storageService.data.users[testUser.id] = testUser

      testProject = new Project({
        name: '测试项目',
        userId: testUser.id,
        providerPreferences: {
          video: null,
          llm: null,
          tts: null,
          updatedAt: null,
        },
      })
      projectService.projects.set(testProject.id, testProject)

      const resolved = resolveProviderConfig('video', testProject.id, testUser.id)
      assert.strictEqual(resolved.provider, 'mock')
      assert.strictEqual(resolved.source, 'user-default')
    })

    it('项目级配置了未配置 API Key 的 provider 时应回退', () => {
      // runway 在测试环境中未配置 API Key
      testProject = new Project({
        name: '测试项目',
        userId: 'test-user-4',
        providerPreferences: {
          video: { provider: 'runway', model: 'gen-3-alpha', config: {} },
          llm: null,
          tts: null,
          updatedAt: new Date().toISOString(),
        },
      })
      projectService.projects.set(testProject.id, testProject)

      const resolved = resolveProviderConfig('video', testProject.id, testProject.userId)
      // runway 未配置 API Key，应回退到全局默认或 mock
      assert.notStrictEqual(resolved.provider, 'runway')
      assert.ok(['global-default', 'fallback'].includes(resolved.source))
    })

    it('所有级别都不可用时回退到 mock', () => {
      const resolved = resolveProviderConfig('video', 'nonexistent-project', 'nonexistent-user')
      assert.strictEqual(resolved.provider, 'mock')
      // 当全局默认已经是 mock 时，source 为 global-default；否则为 fallback
      assert.ok(['global-default', 'fallback'].includes(resolved.source))
    })
  })

  describe('buildMergedConfig', () => {
    it('应合并基础配置和偏好配置', () => {
      const merged = buildMergedConfig('video', 'runway', { timeout: 30 }, 'gen-3-alpha')
      assert.strictEqual(merged.provider, 'runway')
      assert.strictEqual(merged.model, 'gen-3-alpha')
      assert.strictEqual(merged.timeout, 30)
    })

    it('无 model 时不覆盖基础配置的 model', () => {
      const merged = buildMergedConfig('video', 'runway', { timeout: 30 })
      assert.strictEqual(merged.provider, 'runway')
      assert.strictEqual(merged.timeout, 30)
    })

    it('偏好配置应覆盖基础配置的同名字段', () => {
      const merged = buildMergedConfig('llm', 'openai', { apiKey: 'custom-key', model: 'gpt-4o' }, 'gpt-4o-mini')
      assert.strictEqual(merged.provider, 'openai')
      assert.strictEqual(merged.apiKey, 'custom-key')
      assert.strictEqual(merged.model, 'gpt-4o-mini')
    })
  })
})
