import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { studioService, StudioService } from '../src/services/studioService.js'

const TEST_USER = 'r30-studio-test'

describe('R30 剧场计划厂牌体系', () => {
  let studioId
  let projectId1
  let projectId2
  let showId

  before(async () => {
    projectId1 = (await projectService.createProject({ name: '厂牌作品A', userId: TEST_USER })).id
    projectId2 = (await projectService.createProject({ name: '厂牌作品B', userId: TEST_USER })).id
  })

  after(async () => {
    try {
      await projectService.deleteProject(projectId1)
      await projectService.deleteProject(projectId2)
    } catch { /* ignore */ }
    // 清理本测试创建的 studio，避免 db.json 累积残留厂牌
    if (studioId) {
      try {
        const studios = storageService.get('studios') || {}
        delete studios[studioId]
        storageService.set('studios', studios)
      } catch { /* ignore */ }
    }
    storageService._flush()
  })

  it('创建厂牌并持久化（返回真 id）', async () => {
    const studio = await studioService.createStudio({
      name: '暗夜制片厂',
      description: '专注黑色电影',
      logo: '🎞️',
      stylePositioning: '冷峻悬疑',
      curatorName: '主理人甲',
      ownerId: TEST_USER,
    })
    studioId = studio.id
    assert.ok(studio.id && studio.id.length > 0)
    assert.equal(studio.name, '暗夜制片厂')
    assert.equal(studio.members.length, 0)
  })

  it('name 为空抛错', async () => {
    await assert.rejects(() => studioService.createStudio({ name: '  ' }), /不能为空/)
  })

  it('广场列出厂牌', async () => {
    const result = await studioService.listStudios()
    assert.ok(result.total >= 1)
    assert.ok(result.items.find((s) => s.id === studioId))
  })

  it('更新厂牌字段', async () => {
    const studio = await studioService.updateStudio(studioId, {
      description: '更新后的描述',
      stylePositioning: '冷峻悬疑升级',
    })
    assert.equal(studio.description, '更新后的描述')
    assert.equal(studio.stylePositioning, '冷峻悬疑升级')
  })

  it('签约成员，重复签约抛错', async () => {
    await studioService.signMember(studioId, { userId: 'u1', name: '创作者一', role: 'creator' })
    await assert.rejects(
      () => studioService.signMember(studioId, { userId: 'u1', name: '重复' }),
      /创作者已签约/
    )
    const studio = await studioService.getStudio(studioId)
    assert.equal(studio.members.length, 1)
  })

  it('移除不存在成员抛错', async () => {
    await assert.rejects(
      () => studioService.removeMember(studioId, 'no-such-user'),
      /成员不存在/
    )
  })

  it('移除成员成功', async () => {
    await studioService.signMember(studioId, { userId: 'u2', name: '临时' })
    await studioService.removeMember(studioId, 'u2')
    const studio = await studioService.getStudio(studioId)
    assert.ok(!studio.getMember('u2'))
  })

  it('建剧集，title 空抛错', async () => {
    await assert.rejects(
      () => studioService.createShow(studioId, { title: '   ' }),
      /不能为空/
    )
    const show = await studioService.createShow(studioId, {
      title: '雨夜三部曲',
      synopsis: '三个雨夜的故事',
    })
    showId = show.id
    assert.ok(show.id)
    assert.equal(show.title, '雨夜三部曲')
    assert.deepEqual(show.projectIds, [])
  })

  it('作品归入厂牌后 project.studioId 回写且作品可见', async () => {
    await studioService.addProject(studioId, projectId1)
    // project.studioId 回写
    const proj = await projectService.getProject(projectId1)
    assert.equal(proj.studioId, studioId)
    // 厂牌作品列表可见
    const works = await studioService.listStudioWorks(studioId)
    assert.ok(works.find((w) => w.id === projectId1))
  })

  it('归入不存在 project 抛错', async () => {
    await assert.rejects(
      () => studioService.addProject(studioId, 'ghost-project'),
      /Project not found/
    )
  })

  it('作品归入剧集后同时出现在厂牌与该剧集、不重复', async () => {
    await studioService.addProjectToShow(studioId, showId, projectId2)
    // 厂牌作品列表含 projectId2
    const studio = await studioService.getStudio(studioId)
    assert.ok(studio.projectIds.includes(projectId2))
    // project.studioId 也被回写
    const proj2 = await projectService.getProject(projectId2)
    assert.equal(proj2.studioId, studioId)
    // 剧集作品列表含 projectId2
    const showWorks = await studioService.listShowWorks(studioId, showId)
    assert.ok(showWorks.find((w) => w.id === projectId2))
    // 不重复：再次添加同一 project 不产生重复
    await studioService.addProjectToShow(studioId, showId, projectId2)
    const show = studio.getShow(showId)
    assert.equal(show.projectIds.filter((p) => p === projectId2).length, 1, '不应重复')
  })

  it('厂牌详情聚合 counts 正确', async () => {
    const detail = await studioService.getStudioDetail(studioId)
    assert.equal(detail.memberCount, 1) // u1
    assert.equal(detail.showCount, 1)
    assert.equal(detail.projectCount, 2) // projectId1 + projectId2
    assert.ok(Array.isArray(detail.works))
    assert.equal(detail.works.length, 2)
    // 每个 show 的 works 也被 hydrate
    assert.equal(detail.shows[0].works.length, 1)
    assert.equal(detail.shows[0].works[0].id, projectId2)
  })

  it('未知厂牌/剧集抛错', async () => {
    await assert.rejects(() => studioService.getStudio('nope'), /Studio not found/)
    await assert.rejects(
      () => studioService.getShow(studioId, 'nope-show'),
      /Show not found/
    )
  })

  it('重启后 studios 数据不丢', async () => {
    storageService._flush()
    const restarted = new StudioService()
    const studio = await restarted.getStudio(studioId)
    assert.equal(studio.name, '暗夜制片厂')
    assert.equal(studio.members.length, 1)
    assert.equal(studio.shows.length, 1)
    assert.equal(studio.projectIds.length, 2)
    assert.ok(studio.getMember('u1'), '签约成员重启后不丢')
    const show = studio.getShow(showId)
    assert.ok(show, '剧集重启后不丢')
    assert.ok(show.projectIds.includes(projectId2))
  })
})
