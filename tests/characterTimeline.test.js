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
  deriveCharacterStages,
  buildTimelineFrom,
} from '../src/services/characterGrowthService.js'

let novelId
let cid

describe('角色形象时间线 characterGrowthService', () => {
  before(async () => {
    const p = await createNovelProject({ title: '时间线测试' })
    novelId = p.id
    const c = storageService.createNovelCharacter({ id: 'c-timeline-1', novelId, name: '血瞳', aliases: ['一号实验体'], card: {}, description: '' })
    cid = c.id
  })
  after(async () => {
    await deleteNovelProject(novelId)
  })

  it('按集 upsert，并取 ≤ 该集的最近状态', async () => {
    await upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷', equipment: '生锈铁片', abilities: '普通' }, { source: 'manual' })
    await upsertState(novelId, cid, 5, { appearance: '青年，皮甲', equipment: '猎枪', abilities: '强化' }, { source: 'manual' })
    assert.equal(listStates(novelId, cid).length, 2)

    assert.equal(getCharacterStateAt(novelId, cid, 1).equipment, '生锈铁片')
    assert.equal(getCharacterStateAt(novelId, cid, 3).equipment, '生锈铁片') // 沿用第 1 集
    assert.equal(getCharacterStateAt(novelId, cid, 5).equipment, '猎枪')
    assert.equal(getCharacterStateAt(novelId, cid, 9).equipment, '猎枪') // 沿用第 5 集
  })

  it('同集重复 upsert 覆盖而非新增', async () => {
    await upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷（修订）' }, { source: 'manual' })
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

  it('deriveCharacterStages 只在形象实质变化时切阶段', async () => {
    const c = storageService.createNovelCharacter({ id: 'c-stage-1', novelId, name: '阶段测试', aliases: [], card: {}, description: '' })
    await upsertState(novelId, c.id, 1, { appearance: '少年，破旧斗篷，脸上带疤', equipment: '铁片' }, { source: 'llm' })
    await upsertState(novelId, c.id, 2, { appearance: '少年，破旧斗篷，脸上带疤', equipment: '铁片' }, { source: 'llm' }) // 无变化
    await upsertState(novelId, c.id, 3, { appearance: '青年，皮甲，短发', equipment: '猎枪' }, { source: 'llm' }) // 变化
    await upsertState(novelId, c.id, 4, { appearance: '青年，皮甲，短发', equipment: '猎枪' }, { source: 'llm' }) // 无变化
    await upsertState(novelId, c.id, 5, { appearance: '深渊化，背生黑翼', equipment: '光刃' }, { source: 'llm' }) // 变化
    const stages = deriveCharacterStages(novelId, c.id, { maxStages: 8 })
    assert.deepEqual(
      stages.map((s) => s.episodeNo),
      [1, 3, 5]
    )
  })

  it('deriveCharacterStages 超过上限时均匀抽样并保留首尾', async () => {
    const c = storageService.createNovelCharacter({ id: 'c-stage-2', novelId, name: '阶段抽样', aliases: [], card: {}, description: '' })
    for (let i = 1; i <= 10; i += 1) {
      await upsertState(novelId, c.id, i, { appearance: `第${i}阶段完全不同外形${'x'.repeat(i)}`, equipment: `装备${i}` }, { source: 'llm' })
    }
    const stages = deriveCharacterStages(novelId, c.id, { maxStages: 4 })
    assert.equal(stages.length, 4)
    assert.equal(stages[0].episodeNo, 1)
    assert.equal(stages[stages.length - 1].episodeNo, 10)
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

describe('buildTimelineFrom', () => {
  it('按角色分组、按集数升序、过滤泛名与无状态角色', () => {
    const chars = [
      { id: 'c1', name: '血瞳' },
      { id: 'c2', name: '人类' },
      { id: 'c3', name: '无状态' },
    ]
    const states = [
      { characterId: 'c1', episodeNo: 5, appearance: '青年', equipment: '光刃', source: 'llm' },
      { characterId: 'c1', episodeNo: 1, appearance: '少年', equipment: '铁片', source: 'llm' },
      { characterId: 'c2', episodeNo: 1, appearance: '人群', source: 'llm' },
    ]
    const timeline = buildTimelineFrom(chars, states)
    assert.equal(timeline.length, 1)
    assert.equal(timeline[0].characterId, 'c1')
    assert.deepEqual(timeline[0].states.map((s) => s.episodeNo), [1, 5])
    assert.equal(timeline[0].states[0].appearance, '少年')
  })
})
