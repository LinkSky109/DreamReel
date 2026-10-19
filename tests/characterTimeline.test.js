import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { storageService } from '../src/services/storageService.js'
import { createNovelProject, deleteNovelProject } from '../src/services/novelProjectService.js'
import {
  upsertState,
  listStates,
  getCharacterStateAt,
  buildAppearanceDirective,
  missingStatesForEpisode,
  buildTimeline,
} from '../src/services/characterGrowthService.js'

let novelId
let cid

describe('角色形象时间线 characterGrowthService', () => {
  before(() => {
    const p = createNovelProject({ title: '时间线测试' })
    novelId = p.id
    const c = storageService.createNovelCharacter({ id: 'c-timeline-1', novelId, name: '血瞳', aliases: ['一号实验体'], card: {}, description: '' })
    cid = c.id
  })
  after(() => {
    deleteNovelProject(novelId)
  })

  it('按集 upsert，并取 ≤ 该集的最近状态', () => {
    upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷', equipment: '生锈铁片', abilities: '普通' }, { source: 'manual' })
    upsertState(novelId, cid, 5, { appearance: '青年，皮甲', equipment: '猎枪', abilities: '强化' }, { source: 'manual' })
    assert.equal(listStates(novelId, cid).length, 2)

    assert.equal(getCharacterStateAt(novelId, cid, 1).equipment, '生锈铁片')
    assert.equal(getCharacterStateAt(novelId, cid, 3).equipment, '生锈铁片') // 沿用第 1 集
    assert.equal(getCharacterStateAt(novelId, cid, 5).equipment, '猎枪')
    assert.equal(getCharacterStateAt(novelId, cid, 9).equipment, '猎枪') // 沿用第 5 集
  })

  it('同集重复 upsert 覆盖而非新增', () => {
    upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷（修订）' }, { source: 'manual' })
    const s1 = listStates(novelId, cid).filter((s) => s.episodeNo === 1)
    assert.equal(s1.length, 1)
    assert.match(s1[0].appearance, /修订/)
  })

  it('buildAppearanceDirective 只输出 ≤ 该集的状态', () => {
    const d3 = buildAppearanceDirective(novelId, 3, ['血瞳'])
    assert.match(d3, /第3集/)
    assert.match(d3, /生锈铁片/)
    assert.doesNotMatch(d3, /猎枪/) // 第 5 集的装备不得出现在第 3 集

    const d6 = buildAppearanceDirective(novelId, 6, ['血瞳'])
    assert.match(d6, /猎枪/)
  })

  it('missingStatesForEpisode 识别缺失角色', () => {
    assert.deepEqual(missingStatesForEpisode(novelId, 1, ['血瞳']), [])
    const other = storageService.createNovelCharacter({ id: 'c-timeline-2', novelId, name: '丽儿', aliases: [], card: {}, description: '' })
    assert.deepEqual(missingStatesForEpisode(novelId, 1, ['丽儿']), ['丽儿'])
    storageService.deleteNovelCharacterStates(novelId, other.id, null)
  })

  it('buildTimeline 按角色聚合', () => {
    const tl = buildTimeline(novelId)
    const hero = tl.find((x) => x.name === '血瞳')
    assert.ok(hero)
    assert.equal(hero.states.length, 2)
    assert.deepEqual(
      hero.states.map((s) => s.episodeNo),
      [1, 5]
    )
  })
})
