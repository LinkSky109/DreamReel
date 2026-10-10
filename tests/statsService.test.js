import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statsService } from '../src/services/statsService.js'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_USER = 'stats_test_user'

// 清理可能残留的测试数据
if (storageService.data.usage && storageService.data.usage[TEST_USER]) {
  delete storageService.data.usage[TEST_USER]
}
if (storageService.data.exports && storageService.data.exports[TEST_USER]) {
  delete storageService.data.exports[TEST_USER]
}

test('statsService: getOverview should return correct counts', async () => {
  // 创建测试项目
  const project = await projectService.createProject({ name: '统计测试', userId: TEST_USER })
  project.addShot({ description: '镜头1', status: 'completed' })
  project.addShot({ description: '镜头2', status: 'pending' })
  project.addCharacter({ name: '角色1' })
  await projectService.updateProject(project.id, { shots: project.shots, characters: project.characters })

  const overview = statsService.getOverview(TEST_USER)
  assert.ok(overview.totalProjects >= 1)
  assert.ok(overview.totalShots >= 2)
  assert.ok(overview.completedShots >= 1)
  assert.ok(overview.totalCharacters >= 1)
  assert.equal(typeof overview.completionRate, 'number')
})

test('statsService: getTrend should return daily data', () => {
  const trend = statsService.getTrend(TEST_USER, 7)
  assert.equal(trend.length, 7)
  assert.ok(trend[0].date)
  assert.equal(typeof trend[0].videoGenerations, 'number')
  assert.equal(typeof trend[0].projectsCreated, 'number')
  assert.equal(typeof trend[0].exports, 'number')
})

test('statsService: getStyleDistribution should return sorted styles', async () => {
  const project = await projectService.createProject({ name: '风格测试', userId: TEST_USER, style: 'nolan' })
  await projectService.updateProject(project.id, { style: 'nolan' })

  const distribution = statsService.getStyleDistribution(TEST_USER)
  assert.ok(Array.isArray(distribution))
  assert.ok(distribution.length > 0)
  // 应该按 count 降序排列
  for (let i = 1; i < distribution.length; i++) {
    assert.ok(distribution[i - 1].count >= distribution[i].count)
  }
})

test('statsService: getQuotaUsage should return quota status', () => {
  const quota = statsService.getQuotaUsage(TEST_USER)
  assert.ok(quota.video)
  assert.ok(quota.video.daily)
  assert.equal(quota.video.daily.limit, 5)
  assert.ok(quota.dubbing)
  assert.ok(quota.dubbing.monthly)
})

test('statsService: getRecentProjects should return sorted projects', async () => {
  const recent = statsService.getRecentProjects(TEST_USER, 3)
  assert.ok(recent.length <= 3)
  // 应该按 updatedAt 降序排列
  for (let i = 1; i < recent.length; i++) {
    assert.ok(new Date(recent[i - 1].updatedAt) >= new Date(recent[i].updatedAt))
  }
})

test('statsService: getDashboard should return complete data', () => {
  const dashboard = statsService.getDashboard(TEST_USER)
  assert.ok(dashboard.overview)
  assert.ok(dashboard.trend)
  assert.ok(dashboard.styleDistribution)
  assert.ok(dashboard.platformDistribution)
  assert.ok(dashboard.quotaUsage)
  assert.ok(dashboard.recentProjects)
})

test('statsService: getPlatformDistribution should return platform counts', async () => {
  await projectService.createProject({ name: '平台测试', userId: TEST_USER, platform: 'portrait' })
  const distribution = statsService.getPlatformDistribution(TEST_USER)
  assert.ok(Array.isArray(distribution))
  assert.ok(distribution.length > 0)
})
