import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelProject, deleteNovelProject } from '../src/services/novelProjectService.js'
import { writeChild, deleteChildStates } from '../src/services/novelChildStore.js'
import { listCharactersAsync, listStatesAsync } from '../src/services/novelAsyncReadService.js'
import {
  upsertState,
  buildAppearanceDirective,
  deriveCharacterStages,
  buildTimelineFrom,
} from '../src/services/characterGrowthService.js'
import './helpers/pg-teardown.js'

let novelId
let cid

/** 取 ≤ 指定集的最近一条状态（与 PG 只读路径的语义一致）。 */
function stateAt(states, episodeNo) {
  const applicable = states
    .filter((s) => Number(s.episodeNo) <= Number(episodeNo))
    .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
  return applicable[applicable.length - 1] || null
}

/** PG-only 的缺失状态判定；后续由 characterGrowthService 的异步导出版替代。 */
async function missingStatesForEpisode(novelIdToCheck, episodeNo, names = []) {
  const [chars, states] = await Promise.all([
    listCharactersAsync(novelIdToCheck),
    listStatesAsync(novelIdToCheck),
  ])
  return chars
    .filter((c) => c.name && names.includes(c.name))
    .filter((c) => !stateAt(states.filter((s) => s.characterId === c.id), episodeNo))
    .map((c) => c.name)
}

async function createCharacter(id, name, aliases = []) {
  return writeChild('characters', { id, novelId, name, aliases, card: {}, description: '' })
}

describe('角色形象时间线 characterGrowthService（PostgreSQL）', () => {
  before(async () => {
    const p = await createNovelProject({ title: '时间线测试' })
    novelId = p.id
    const c = await createCharacter('c-timeline-1', '血瞳', ['一号实验体'])
    cid = c.id
  })
  after(async () => {
    await deleteNovelProject(novelId)
  })

  it('按集 upsert，并取 ≤ 该集的最近状态', async () => {
    await upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷', equipment: '生锈铁片', abilities: '普通' }, { source: 'manual' })
    await upsertState(novelId, cid, 5, { appearance: '青年，皮甲', equipment: '猎枪', abilities: '强化' }, { source: 'manual' })
    const states = await listStatesAsync(novelId, cid)
    assert.equal(states.length, 2)

    assert.equal(stateAt(states, 1).equipment, '生锈铁片')
    assert.equal(stateAt(states, 3).equipment, '生锈铁片') // 沿用第 1 集
    assert.equal(stateAt(states, 5).equipment, '猎枪')
    assert.equal(stateAt(states, 9).equipment, '猎枪') // 沿用第 5 集
  })

  it('同集重复 upsert 覆盖而非新增', async () => {
    await upsertState(novelId, cid, 1, { appearance: '少年，破旧斗篷（修订）' }, { source: 'manual' })
    const s1 = (await listStatesAsync(novelId, cid)).filter((s) => s.episodeNo === 1)
    assert.equal(s1.length, 1)
    assert.match(s1[0].appearance, /修订/)
  })

  it('buildAppearanceDirective 只输出 ≤ 该集的状态', async () => {
    const d3 = await buildAppearanceDirective(novelId, 3, ['血瞳'])
    assert.match(d3, /第3集/)
    assert.match(d3, /生锈铁片/)
    assert.doesNotMatch(d3, /猎枪/) // 第 5 集的装备不得出现在第 3 集

    const d6 = await buildAppearanceDirective(novelId, 6, ['血瞳'])
    assert.match(d6, /猎枪/)
  })

  it('missingStatesForEpisode 识别缺失角色', async () => {
    assert.deepEqual(await missingStatesForEpisode(novelId, 1, ['血瞳']), [])
    const other = await createCharacter('c-timeline-2', '丽儿')
    assert.deepEqual(await missingStatesForEpisode(novelId, 1, ['丽儿']), ['丽儿'])
    await deleteChildStates(novelId, other.id, null)
  })

  it('deriveCharacterStages 只在形象实质变化时切阶段', async () => {
    const c = await createCharacter('c-stage-1', '阶段测试')
    await upsertState(novelId, c.id, 1, { appearance: '少年，破旧斗篷，脸上带疤', equipment: '铁片' }, { source: 'llm' })
    await upsertState(novelId, c.id, 2, { appearance: '少年，破旧斗篷，脸上带疤', equipment: '铁片' }, { source: 'llm' }) // 无变化
    await upsertState(novelId, c.id, 3, { appearance: '青年，皮甲，短发', equipment: '猎枪' }, { source: 'llm' }) // 变化
    await upsertState(novelId, c.id, 4, { appearance: '青年，皮甲，短发', equipment: '猎枪' }, { source: 'llm' }) // 无变化
    await upsertState(novelId, c.id, 5, { appearance: '深渊化，背生黑翼', equipment: '光刃' }, { source: 'llm' }) // 变化
    const stages = await deriveCharacterStages(novelId, c.id, { maxStages: 8 })
    assert.deepEqual(
      stages.map((s) => s.episodeNo),
      [1, 3, 5]
    )
  })

  it('deriveCharacterStages 超过上限时均匀抽样并保留首尾', async () => {
    const c = await createCharacter('c-stage-2', '阶段抽样')
    for (let i = 1; i <= 10; i += 1) {
      await upsertState(novelId, c.id, i, { appearance: `第${i}阶段完全不同外形${'x'.repeat(i)}`, equipment: `装备${i}` }, { source: 'llm' })
    }
    const stages = await deriveCharacterStages(novelId, c.id, { maxStages: 4 })
    assert.equal(stages.length, 4)
    assert.equal(stages[0].episodeNo, 1)
    assert.equal(stages[stages.length - 1].episodeNo, 10)
  })

  it('buildTimeline 按角色聚合（PG 数据 + 纯函数）', async () => {
    const [chars, states] = await Promise.all([listCharactersAsync(novelId), listStatesAsync(novelId)])
    const tl = buildTimelineFrom(chars, states)
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
