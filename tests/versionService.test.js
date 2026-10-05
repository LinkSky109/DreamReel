import { test } from 'node:test'
import assert from 'node:assert/strict'
import { versionService } from '../src/services/versionService.js'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_PROJECT = 'version_test_project'

// 清理可能残留的测试数据
if (storageService.data.versions && storageService.data.versions[TEST_PROJECT]) {
  delete storageService.data.versions[TEST_PROJECT]
  storageService.save()
}

test('versionService: saveVersion should create a version snapshot', async () => {
  // 先创建测试项目
  const project = await projectService.createProject({ name: '版本测试项目', userId: 'default' })
  const version = await versionService.saveVersion(project.id, {
    label: '初始版本',
    description: '测试版本',
    auto: false,
  })
  assert.ok(version.id)
  assert.equal(version.label, '初始版本')
  assert.equal(version.versionNumber, 1)
  assert.equal(version.auto, false)
  assert.ok(version.snapshot)
  assert.equal(version.snapshot.name, '版本测试项目')
})

test('versionService: getVersions should return sorted versions', async () => {
  const project = await projectService.createProject({ name: '版本列表测试', userId: 'default' })
  await versionService.saveVersion(project.id, { label: 'v1', auto: true })
  await versionService.saveVersion(project.id, { label: 'v2', auto: true })
  const result = versionService.getVersions(project.id)
  assert.equal(result.total, 2)
  // 按时间倒序
  assert.equal(result.items[0].label, 'v2')
  assert.equal(result.items[1].label, 'v1')
})

test('versionService: getVersion should return specific version', async () => {
  const project = await projectService.createProject({ name: '版本详情测试', userId: 'default' })
  const v = await versionService.saveVersion(project.id, { label: '详情测试' })
  const found = versionService.getVersion(project.id, v.id)
  assert.equal(found.id, v.id)
  assert.equal(found.label, '详情测试')
})

test('versionService: getVersion should throw for nonexistent', () => {
  assert.throws(() => {
    versionService.getVersion(TEST_PROJECT, 'nonexistent-id')
  }, /Version not found/)
})

test('versionService: rollback should restore project state', async () => {
  const project = await projectService.createProject({ name: '回滚测试', userId: 'default' })
  // 保存初始版本
  const v1 = await versionService.saveVersion(project.id, { label: '初始' })
  // 修改项目
  await projectService.updateProject(project.id, { name: '修改后的名字' })
  // 保存修改后版本
  await versionService.saveVersion(project.id, { label: '修改后' })
  // 回滚到 v1
  const result = await versionService.rollback(project.id, v1.id)
  assert.equal(result.success, true)
  assert.ok(result.backupVersion)
  // 验证项目已恢复
  const restored = await projectService.getProject(project.id)
  assert.equal(restored.name, '回滚测试')
})

test('versionService: deleteVersion should remove version', async () => {
  const project = await projectService.createProject({ name: '删除测试', userId: 'default' })
  const v = await versionService.saveVersion(project.id, { label: '待删除' })
  versionService.deleteVersion(project.id, v.id)
  const result = versionService.getVersions(project.id)
  assert.ok(!result.items.find((item) => item.id === v.id))
})

test('versionService: compareVersions should detect differences', async () => {
  const project = await projectService.createProject({ name: '对比测试', userId: 'default' })
  const v1 = await versionService.saveVersion(project.id, { label: 'v1' })
  await projectService.updateProject(project.id, { name: '对比修改' })
  const v2 = await versionService.saveVersion(project.id, { label: 'v2' })
  const comparison = versionService.compareVersions(project.id, v1.id, v2.id)
  assert.equal(comparison.differences.name, true)
})

test('versionService: cleanupProject should remove all versions', async () => {
  const project = await projectService.createProject({ name: '清理测试', userId: 'default' })
  await versionService.saveVersion(project.id, { label: 'v1' })
  await versionService.saveVersion(project.id, { label: 'v2' })
  versionService.cleanupProject(project.id)
  const result = versionService.getVersions(project.id)
  assert.equal(result.total, 0)
})
