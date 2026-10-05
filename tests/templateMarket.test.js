import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { templateService } from '../src/services/templateService.js'
import { projectService } from '../src/services/projectService.js'

describe('TemplateMarket', () => {
  let testProjectId

  beforeEach(async () => {
    templateService.userTemplates.clear()
    // 创建测试项目
    const project = await projectService.createProject({
      name: '模板测试项目',
      description: '用于测试模板功能',
      targetDuration: 30,
      style: 'cinematic',
      platform: 'landscape',
      userId: 'test-user',
    })
    testProjectId = project.id
  })

  after(async () => {
    templateService.userTemplates.clear()
    if (testProjectId) {
      await projectService.deleteProject(testProjectId)
    }
  })

  it('should list builtin templates', () => {
    const templates = templateService.listTemplates({ type: 'builtin' })
    assert.ok(templates.length >= 10)
    templates.forEach((t) => {
      assert.equal(t.isBuiltin, true)
      assert.equal(t.type, 'builtin')
    })
  })

  it('should list all templates (builtin + user)', () => {
    const allTemplates = templateService.listTemplates()
    assert.ok(allTemplates.length >= 10)
  })

  it('should create template from project', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      name: '我的模板',
      description: '测试模板',
      category: '创意',
      icon: '🎬',
      userId: 'test-user',
    })

    assert.ok(template)
    assert.ok(template.id.startsWith('user-'))
    assert.equal(template.name, '我的模板')
    assert.equal(template.category, '创意')
    assert.equal(template.createdBy, 'test-user')
    assert.ok(template.projectSnapshot)
    assert.ok(template.createdAt)
    assert.equal(template.useCount, 0)
  })

  it('should create template with default values', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      userId: 'test-user',
    })

    assert.ok(template)
    assert.ok(template.name.length > 0)
    assert.ok(template.name.includes('模板'))
    assert.equal(template.category, '自定义')
    assert.equal(template.icon, '🎬')
  })

  it('should reject creating template from null project', () => {
    assert.throws(
      () => templateService.createTemplateFromProject(null, { userId: 'test-user' }),
      /项目不能为空/
    )
  })

  it('should get user template', () => {
    const project = projectService.getProject(testProjectId)
    const created = templateService.createTemplateFromProject(project, {
      name: '获取测试',
      userId: 'test-user',
    })

    const fetched = templateService.getTemplate(created.id)
    assert.equal(fetched.id, created.id)
    assert.equal(fetched.name, '获取测试')
    assert.equal(fetched.isBuiltin, false)
    assert.equal(fetched.type, 'user')
  })

  it('should get builtin template', () => {
    const template = templateService.getTemplate('product-ad')
    assert.equal(template.id, 'product-ad')
    assert.equal(template.isBuiltin, true)
  })

  it('should throw for non-existent template', () => {
    assert.throws(
      () => templateService.getTemplate('non-existent-template'),
      /Template not found/
    )
  })

  it('should list user templates by user', () => {
    const project = projectService.getProject(testProjectId)
    templateService.createTemplateFromProject(project, { name: '用户A模板', userId: 'user-a' })
    templateService.createTemplateFromProject(project, { name: '用户B模板', userId: 'user-b' })

    const userATemplates = templateService.getUserTemplates('user-a')
    assert.equal(userATemplates.length, 1)
    assert.equal(userATemplates[0].name, '用户A模板')

    const userBTemplates = templateService.getUserTemplates('user-b')
    assert.equal(userBTemplates.length, 1)
    assert.equal(userBTemplates[0].name, '用户B模板')
  })

  it('should delete user template', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      name: '待删除',
      userId: 'test-user',
    })

    const result = templateService.deleteUserTemplate(template.id, 'test-user')
    assert.equal(result.success, true)

    assert.throws(
      () => templateService.getTemplate(template.id),
      /Template not found/
    )
  })

  it('should reject deleting template by non-owner', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      name: '他人模板',
      userId: 'owner',
    })

    assert.throws(
      () => templateService.deleteUserTemplate(template.id, 'other-user'),
      /无权删除/
    )
  })

  it('should increment use count when building project from user template', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      name: '使用计数测试',
      userId: 'test-user',
    })

    assert.equal(template.useCount, 0)

    templateService.buildProjectFromTemplate(template.id)
    const updated = templateService.getTemplate(template.id)
    assert.equal(updated.useCount, 1)

    templateService.buildProjectFromTemplate(template.id)
    const updated2 = templateService.getTemplate(template.id)
    assert.equal(updated2.useCount, 2)
  })

  it('should include project snapshot when building from user template', () => {
    const project = projectService.getProject(testProjectId)
    const template = templateService.createTemplateFromProject(project, {
      name: '快照测试',
      userId: 'test-user',
    })

    const params = templateService.buildProjectFromTemplate(template.id)
    assert.ok(params.projectSnapshot)
    assert.ok(params.projectSnapshot.script !== undefined)
    assert.ok(params.projectSnapshot.characters !== undefined)
    assert.ok(params.projectSnapshot.shots !== undefined)
  })

  it('should not include project snapshot for builtin template', () => {
    const params = templateService.buildProjectFromTemplate('product-ad')
    assert.equal(params.projectSnapshot, undefined)
  })

  it('should filter templates by category', () => {
    const commercial = templateService.listTemplates({ category: '商业', type: 'builtin' })
    assert.ok(commercial.length > 0)
    commercial.forEach((t) => assert.equal(t.category, '商业'))
  })

  it('should search templates', () => {
    const results = templateService.listTemplates({ search: '产品', type: 'builtin' })
    assert.ok(results.length > 0)
    results.forEach((t) => {
      const match = t.name.includes('产品') || t.description.includes('产品') || (t.tags && t.tags.some((tag) => tag.includes('产品')))
      assert.ok(match)
    })
  })

  it('should list categories with counts', () => {
    const categories = templateService.listCategories()
    assert.ok(categories.length >= 4)
    categories.forEach((c) => {
      assert.ok(c.name)
      assert.ok(c.count > 0)
    })
  })
})
