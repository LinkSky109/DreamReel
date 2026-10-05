import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

describe('ProjectService', () => {
  let testProjectId

  beforeEach(async () => {
    // 清理：创建一个新项目用于测试
    const project = await projectService.createProject({
      name: 'Test Project',
      targetDuration: 60,
      userId: 'test-user',
    })
    testProjectId = project.id
  })

  it('should create a project', async () => {
    const project = await projectService.createProject({ name: 'New Project' })
    assert.ok(project.id)
    assert.equal(project.name, 'New Project')
  })

  it('should get a project by id', async () => {
    const project = await projectService.getProject(testProjectId)
    assert.equal(project.id, testProjectId)
    assert.equal(project.name, 'Test Project')
  })

  it('should throw when project not found', async () => {
    await assert.rejects(
      projectService.getProject('non-existent-id'),
      /Project not found/
    )
  })

  it('should update project fields', async () => {
    const updated = await projectService.updateProject(testProjectId, {
      name: 'Updated Name',
      status: 'in_progress',
    })
    assert.equal(updated.name, 'Updated Name')
    assert.equal(updated.status, 'in_progress')
  })

  it('should list projects for a user', async () => {
    const result = await projectService.listProjects({ userId: 'test-user' })
    assert.ok(result.total >= 1)
    assert.ok(result.items.some((p) => p.id === testProjectId))
  })

  it('should delete a project', async () => {
    const result = await projectService.deleteProject(testProjectId)
    assert.equal(result.success, true)
    await assert.rejects(
      projectService.getProject(testProjectId),
      /Project not found/
    )
  })
})
