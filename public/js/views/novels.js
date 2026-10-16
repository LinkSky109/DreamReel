/**
 * 小说剧场「制作台」（#/novels 列表、#/novel/:id 详情）
 * 覆盖全链路：阶段进度/锁定、来源、角色（备选+选定+审核）、世界观（备选+选定）、
 * 分季分集、单集（剧本/资产/成片/交接）、风格、清单与同步。
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

const STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose']
const STAGE_LABEL = {
  source: '来源',
  characters: '角色',
  world: '世界观',
  series: '分季分集',
  episodes: '单集剧本',
  assets: '单集资产',
  compose: '成片',
}
const TYPE_LABEL = {
  world: '世界规则', power: '力量体系', rule: '律法与禁忌', race: '种族物种', faction: '势力组织',
  event: '重大事件', item: '装备宝物', location: '地域风貌', culture: '文化风俗', prophecy: '预言传说',
  conflict: '冲突体系', civilization: '文明体系', narrative: '叙事特色', other: '其他',
}
const CARD_GROUPS = { basic: '基础档案', ability: '能力面板', relations: '人际关系网', trauma: '过往创伤', beliefs: '信念与价值观', secrets: '伏笔与隐藏身份', ending: '结局与遗留影响', media: '声线与成长' }
const DEFAULT_CARD_FIELDS = [
  { key: 'age', label: '年龄', group: 'basic' }, { key: 'gender', label: '性别', group: 'basic' },
  { key: 'appearance', label: '外貌', group: 'basic' }, { key: 'personality', label: '性格底色', group: 'basic' },
  { key: 'habits', label: '习惯', group: 'basic' }, { key: 'catchphrase', label: '口头禅', group: 'basic' },
  { key: 'fears', label: '恐惧', group: 'basic' }, { key: 'obsessions', label: '执念', group: 'basic' },
  { key: 'weaknesses', label: '心理弱点', group: 'basic' },
  { key: 'abilities', label: '基础能力', group: 'ability' }, { key: 'talents', label: '特殊天赋', group: 'ability' },
  { key: 'shortcomings', label: '短板', group: 'ability' }, { key: 'combatStyle', label: '战斗风格', group: 'ability' },
  { key: 'strengths', label: '擅长领域', group: 'ability' }, { key: 'limits', label: '不擅长领域', group: 'ability' },
  { key: 'relations', label: '人际关系网', group: 'relations' }, { key: 'relationChanges', label: '关系变化节点', group: 'relations' },
  { key: 'childhood', label: '童年经历', group: 'trauma' }, { key: 'regrets', label: '重大遗憾', group: 'trauma' },
  { key: 'shadows', label: '心理阴影', group: 'trauma' }, { key: 'coreKnot', label: '核心心结', group: 'trauma' },
  { key: 'principles', label: '原则底线', group: 'beliefs' }, { key: 'worldview', label: '三观', group: 'beliefs' },
  { key: 'beliefShifts', label: '信念转变节点', group: 'beliefs' },
  { key: 'hiddenIdentity', label: '隐藏身世', group: 'secrets' }, { key: 'secretMission', label: '秘密任务', group: 'secrets' },
  { key: 'disguise', label: '伪装身份', group: 'secrets' }, { key: 'secrets', label: '不为人知的秘密', group: 'secrets' },
  { key: 'fate', label: '生死归宿', group: 'ending' }, { key: 'legacy', label: '遗产/传说', group: 'ending' },
  { key: 'impact', label: '对世界/他人的改变', group: 'ending' },
  { key: 'voice', label: '声线描述', group: 'media' }, { key: 'growth', label: '成长轨迹', group: 'media' },
]

const state = { novelId: null, tab: 'stage', worldType: 'all', artCategory: 'all', shotEpisodeId: null }

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s === null || s === undefined ? '' : String(s)
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function unwrap(res) {
  return res && res.data !== undefined ? res.data : res
}
function stageIdx(stage) {
  return STAGES.indexOf(stage)
}
function locked(novel, stage) {
  return stageIdx(novel.stage) > stageIdx(stage)
}

export async function renderNovelsPage(container, novelId) {
  if (novelId) {
    if (state.novelId !== novelId) state.worldType = 'all'
    state.novelId = novelId
    return renderDetail(container)
  }
  return renderList(container)
}

async function renderList(container) {
  container.innerHTML = '<div class="loading"></div>'
  let novels = []
  try {
    novels = unwrap(await api.listNovels()) || []
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${esc(err.message)}</div></div>`
    return
  }
  container.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;">
      <div class="page-header" style="margin-bottom:16px;">
        <h1 class="page-title" style="margin-bottom:6px;">📚 小说剧场 · 制作台</h1>
        <p style="color:var(--text-secondary);font-size:13px;margin:0;">书名/链接 → 清洗分章 → 角色 → 世界观 → 分季分集 → 剧本 → 资产 → 成片 → 同步</p>
      </div>
      <section class="card" style="padding:16px;margin-bottom:16px;">
        <form id="novelCreate" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input class="form-input" name="title" placeholder="书名 *" style="flex:1;min-width:160px;" required />
          <input class="form-input" name="author" placeholder="作者" style="width:130px;" />
          <input class="form-input" name="url" placeholder="书籍链接（如 https://www.qishuxia.com/book/34639/）" style="flex:1;min-width:260px;" />
          <button class="btn btn-primary" type="submit">创建</button>
        </form>
      </section>
      <div style="display:grid;gap:10px;">
        ${novels.length ? novels.map((n) => `
          <a href="#/novel/${esc(n.id)}" class="card" style="padding:14px;border:1px solid var(--border-color);display:block;">
            <div style="font-weight:600;">${esc(n.title)} <span style="font-size:12px;color:var(--text-secondary);">${esc(n.author || '')}</span></div>
            <div style="font-size:12px;color:var(--text-secondary);">阶段 ${esc(STAGE_LABEL[n.stage] || n.stage)} · 章 ${esc((n.counts && n.counts.chapters) || 0)} · 角色 ${esc((n.counts && n.counts.characters) || 0)} · 集 ${esc((n.counts && n.counts.episodes) || 0)}</div>
          </a>`).join('') : '<div style="color:var(--text-secondary);">还没有小说项目</div>'}
      </div>
    </div>`

  container.querySelector('#novelCreate')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    try {
      const res = await api.createNovel({
        title: (fd.get('title') || '').trim(),
        author: (fd.get('author') || '').trim(),
        sourceType: fd.get('url') ? 'qishuxia-txt' : 'text',
        sourceRef: (fd.get('url') || '').trim(),
      })
      const p = unwrap(res)
      showToast('已创建', 'success')
      location.hash = `#/novel/${p.id}`
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

async function renderDetail(container) {
  container.innerHTML = '<div class="loading"></div>'
  const id = state.novelId
  let novel
  try {
    novel = unwrap(await api.getNovel(id))
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${esc(err.message)}</div><button class="btn" onclick="location.hash='#/novels'">返回</button></div>`
    return
  }

  const tabs = [
    ['stage', '阶段'],
    ['source', '来源'],
    ['characters', '角色'],
    ['world', '世界观'],
    ['series', '分季分集'],
    ['episode', '单集'],
    ['art', '设定图集'],
    ['sync', '风格/同步'],
  ]

  container.innerHTML = `
    <div style="max-width:1120px;margin:0 auto;padding:24px;">
      <a href="#/novels" style="font-size:13px;color:var(--text-secondary);">← 返回列表</a>
      <h1 class="page-title" style="margin:8px 0 4px;">📖 ${esc(novel.title)}</h1>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
        ${esc(novel.author || '-')} · ${esc(novel.category || '-')} · 阶段 <b>${esc(STAGE_LABEL[novel.stage] || novel.stage)}</b> ·
        章 ${esc((novel.counts && novel.counts.chapters) || 0)} · 角色 ${esc((novel.counts && novel.counts.characters) || 0)} · 集 ${esc((novel.counts && novel.counts.episodes) || 0)}
      </div>
      <div id="nvTabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        ${tabs.map(([k, label]) => `<button class="btn btn-sm ${state.tab === k ? 'btn-primary' : ''}" data-tab="${k}">${label}</button>`).join('')}
      </div>
      <div id="nvBody"></div>
    </div>`

  container.querySelectorAll('#nvTabs button[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab
      renderDetail(container)
    })
  })

  const body = container.querySelector('#nvBody')
  const ctx = { container, body, id, novel, refresh: () => renderDetail(container) }
  try {
    if (state.tab === 'stage') await tabStage(ctx)
    else if (state.tab === 'source') await tabSource(ctx)
    else if (state.tab === 'characters') await tabCharacters(ctx)
    else if (state.tab === 'world') await tabWorld(ctx)
    else if (state.tab === 'series') await tabSeries(ctx)
    else if (state.tab === 'episode') await tabEpisode(ctx)
    else if (state.tab === 'art') await tabArt(ctx)
    else await tabSync(ctx)
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state-text">${esc(err.message)}</div></div>`
  }
}

// ---------- 阶段 ----------
async function tabStage({ body, novel, id, refresh }) {
  const cur = stageIdx(novel.stage)
  body.innerHTML = `
    <section class="card" style="padding:16px;">
      <h3 style="margin-top:0;">阶段进度</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        ${STAGES.map((s, i) => {
          const done = i < cur
          const active = i === cur
          const color = active ? 'var(--accent,#4f46e5)' : done ? '#16a34a' : 'var(--border-color)'
          return `<div style="padding:6px 10px;border-radius:999px;border:1px solid ${color};font-size:12px;${active ? 'font-weight:700;' : ''}">${i + 1}. ${esc(STAGE_LABEL[s])}${done ? ' ✓' : ''}</div>`
        }).join('')}
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">进入下一阶段后，之前的阶段将<b>锁定不可修改</b>。角色设定卡 / 世界观设定集可先多次生成<b>备选</b>，选定后再推进。</p>
      <button class="btn btn-primary" id="nvAdvance" ${cur >= STAGES.length - 1 ? 'disabled' : ''}>推进到下一阶段（${esc(STAGE_LABEL[STAGES[Math.min(cur + 1, STAGES.length - 1)]] || '完成')}）</button>
    </section>`
  body.querySelector('#nvAdvance')?.addEventListener('click', async () => {
    if (!confirm('推进阶段后，之前阶段将锁定，确定继续？')) return
    try {
      await api.advanceNovel(id)
      showToast('已推进阶段', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

// ---------- 来源 ----------
async function tabSource({ body, novel, id, refresh }) {
  const lk = locked(novel, 'source')
  body.innerHTML = `
    <section class="card" style="padding:16px;">
      <h3 style="margin-top:0;">来源 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
        <input id="nvUrl" class="form-input" style="flex:1;min-width:260px;" value="${esc(novel.sourceRef || '')}" placeholder="书籍链接（TXT 下载，只下载一次）" ${lk ? 'disabled' : ''} />
        <button id="nvIngest" class="btn" ${lk ? 'disabled' : ''}>摄取（TXT/文本）</button>
      </div>
      <textarea id="nvText" class="form-input" rows="3" placeholder="或粘贴小说文本后摄取" ${lk ? 'disabled' : ''}></textarea>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">已摄取 ${esc((novel.counts && novel.counts.chapters) || 0)} 章（清洗后文本为准，仅下载一次）</div>
    </section>`
  body.querySelector('#nvIngest')?.addEventListener('click', async () => {
    const url = body.querySelector('#nvUrl')?.value?.trim()
    const text = body.querySelector('#nvText')?.value?.trim()
    try {
      await api.ingestNovel(id, url ? { sourceType: 'qishuxia-txt', url } : { sourceType: 'text', text })
      showToast('摄取完成', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

// ---------- 该小说的供应商/模型选择（存 NovelProject，抽取按 小说→用户→全局 解析） ----------
async function mountLlmPicker(host, id, refresh) {
  if (!host) return
  let catalog
  let config
  try {
    ;[catalog, config] = await Promise.all([
      api.getAvailableProviderCatalog('llm').then(unwrap),
      api.getNovelModelConfig(id).then(unwrap),
    ])
  } catch {
    host.innerHTML = ''
    return
  }
  const providers = ((catalog && catalog.models) || []).filter((p) => p.id !== 'mock' && p.configured)
  const pref = (config && config.preferences && config.preferences.llm) || null
  const resolved = (config && config.resolved) || {}
  const cur = pref && pref.provider ? pref.provider : ''
  const curModel = (pref && pref.model) || ''
  const modelList = (providers.find((p) => p.id === cur) || {}).models || []
  host.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;">
      <label style="color:var(--text-secondary);">供应商</label>
      <select id="nvLlmProvider" class="form-input" style="padding:4px;">
        <option value="">默认</option>
        ${providers.map((p) => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <label style="color:var(--text-secondary);">模型</label>
      <select id="nvLlmModel" class="form-input" style="padding:4px;max-width:220px;" ${cur ? '' : 'disabled'}>
        <option value="">默认</option>
        ${modelList.map((m) => `<option value="${esc(m.id)}" ${m.id === curModel ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}
      </select>
      <button id="nvLlmSave" class="btn btn-sm">保存模型</button>
      <button id="nvLlmTest" class="btn btn-sm">检测</button>
      <span id="nvLlmTestResult" style="color:var(--text-secondary);"></span>
      <span style="color:var(--text-secondary);">当前生效：${esc(resolved.provider || '-')}${resolved.model ? ' / ' + esc(resolved.model) : ''}（${esc(resolved.source || '')}）</span>
    </div>`
  const pSel = host.querySelector('#nvLlmProvider')
  const mSel = host.querySelector('#nvLlmModel')
  const tOut = host.querySelector('#nvLlmTestResult')
  pSel?.addEventListener('change', () => {
    const p = providers.find((x) => x.id === pSel.value)
    mSel.disabled = !p
    mSel.innerHTML = '<option value="">默认</option>' + ((p && p.models) || []).map((m) => `<option value="${esc(m.id)}">${esc(m.name || m.id)}</option>`).join('')
  })
  host.querySelector('#nvLlmSave')?.addEventListener('click', async () => {
    const provider = pSel.value
    try {
      await api.updateNovelModelConfig(id, { llm: provider ? { provider, model: mSel.value || null } : null })
      showToast('模型配置已保存', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
  host.querySelector('#nvLlmTest')?.addEventListener('click', async () => {
    const provider = pSel.value
    if (!provider) {
      tOut.textContent = '（"默认"不单独检测，保存后按生效配置检测）'
      return
    }
    tOut.textContent = '检测中…'
    try {
      const r = unwrap(await api.testNovelModelConfig(id, { llm: { provider, model: mSel.value || null } }))
      tOut.textContent = r.ok ? `✅ ${esc(r.provider)}${r.model ? '/' + esc(r.model) : ''} 可用（${r.latencyMs}ms）` : `❌ 不可用：${esc((r.error || '').slice(0, 120))}`
      tOut.style.color = r.ok ? '#16a34a' : '#dc2626'
    } catch (err) {
      tOut.textContent = `❌ ${err.message}`
      tOut.style.color = '#dc2626'
    }
  })
}

// ---------- 角色 ----------
async function tabCharacters({ body, novel, id, refresh }) {
  const lk = locked(novel, 'characters')
  const [chars, sets, stats, schema] = await Promise.all([
    api.listNovelCharacters(id).then(unwrap),
    api.listNovelCharacterSets(id).then(unwrap).catch(() => []),
    api.novelReviewStats(id).then(unwrap).catch(() => ({})),
    api.getNovelSchema(id).then(unwrap).catch(() => null),
  ])
  const fields = (schema && schema.character && schema.character.fields) || DEFAULT_CARD_FIELDS
  const groups = (schema && schema.character && schema.character.groups) || CARD_GROUPS
  const groupKeys = Object.keys(groups)
  const renderCard = (c) => {
    const card = c.card || {}
    const blocks = groupKeys.map((g) => {
      const rows = fields.filter((f) => f.group === g && card[f.key])
      if (!rows.length) return ''
      return `<div style="margin-top:6px;"><span style="font-size:12px;color:#7c3aed;">${esc(groups[g])}</span>
        ${rows.map((f) => `<div style="font-size:12px;color:var(--text-secondary);"><b>${esc(f.label)}</b>：${esc(card[f.key])}</div>`).join('')}</div>`
    }).join('')
    return blocks || '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">（未抽取到字段，可用启发式引擎先跑通或换 LLM）</div>'
  }
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">角色 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:12px;color:var(--text-secondary);">引擎</label>
          <select id="nvExtractProvider" class="form-input" style="padding:4px;" ${lk ? 'disabled' : ''}>
            <option value="llm">LLM（真实）</option>
            <option value="heuristic">启发式（离线）</option>
          </select>
          <button id="nvExtract" class="btn btn-primary btn-sm" ${lk ? 'disabled' : ''}>生成角色（新备选）</button>
        </div>
      </div>
      <div id="nvLlmPicker" style="margin-top:8px;"></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">字段 ${fields.length} 项 · 修订率 ${((stats.revisionRate || 0) * 100).toFixed(1)}% · 已通过 ${esc(stats.approved || 0)} / ${esc(chars.length)}</div>
      ${sets.length ? `<div style="margin-top:10px;font-size:12px;">备选集合：${sets.map((s) => `<button class="btn btn-sm ${s.selected ? 'btn-primary' : ''}" data-cset="${esc(s.id)}" ${lk ? 'disabled' : ''}>${s.count} 个 · ${esc(s.provider)}${s.selected ? '（当前）' : ''}</button>`).join(' ')}</div>` : ''}
    </section>
    <div style="display:grid;gap:10px;">
      ${chars.length ? chars.map((c) => `
        <div class="card" style="padding:12px;border:1px solid var(--border-color);">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div><b>${esc(c.name)}</b> ${(c.aliases || []).length ? `<span style="font-size:12px;color:var(--text-secondary);">别名 ${esc(c.aliases.join('/'))}</span>` : ''}
              ${c.kind === 'group' ? '<span style="font-size:12px;color:#7c3aed;">· 群体</span>' : ''}
              <span style="font-size:12px;color:var(--text-secondary);"> · ${esc(c.provider)} · ${esc(c.status)}</span></div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" data-cedit="${esc(c.id)}" ${lk ? 'disabled' : ''}>修订</button>
              <button class="btn btn-sm" data-capprove="${esc(c.id)}" ${lk ? 'disabled' : ''}>通过</button>
            </div>
          </div>
          ${c.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${esc(c.description)}</div>` : ''}
          ${renderCard(c)}
        </div>`).join('') : '<div style="color:var(--text-secondary);">暂无角色，先在「来源」摄取后点“生成角色”</div>'}
    </div>`

  mountLlmPicker(body.querySelector('#nvLlmPicker'), id, refresh)

  body.querySelector('#nvExtract')?.addEventListener('click', async () => {
    const provider = body.querySelector('#nvExtractProvider').value
    try {
      const r = unwrap(await api.extractNovelCharacters(id, { provider, minFreq: 1 }))
      if (r && r.degraded) showToast('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'error')
      else showToast('已生成角色备选', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
  body.querySelectorAll('[data-cset]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.selectNovelCharacterSet(id, b.dataset.cset); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-capprove]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.approveNovelCharacter(id, b.dataset.capprove); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-cedit]').forEach((b) => b.addEventListener('click', async () => {
    const key = prompt('修改字段（输入字段名）：\n' + fields.map((f) => `${f.key}=${f.label}`).join('  '), 'personality')
    if (!key) return
    const value = prompt(`新的 ${key}：`, '')
    if (value === null) return
    try {
      await api.patchNovelCharacter(id, b.dataset.cedit, key === 'name' ? { name: value } : { card: { [key]: value } })
      showToast('已保存', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  }))
}

// ---------- 世界观 ----------
async function tabWorld({ body, novel, id, refresh }) {
  const lk = locked(novel, 'world')
  const [summary, entities, relations, sets, schema] = await Promise.all([
    api.getNovelWorld(id).then(unwrap).catch(() => ({})),
    api.listNovelWorldEntities(id).then(unwrap).catch(() => []),
    api.listNovelWorldRelations(id).then(unwrap).catch(() => []),
    api.listNovelWorldSets(id).then(unwrap).catch(() => []),
    api.getNovelSchema(id).then(unwrap).catch(() => null),
  ])
  const typeLabel = (schema && schema.world && Object.fromEntries(schema.world.types.map((t) => [t.key, t.label]))) || TYPE_LABEL
  const attrLabels = Object.fromEntries(
    Object.entries((schema && schema.world && schema.world.attributes) || {}).map(([t, list]) => [t, Object.fromEntries((list || []).map((a) => [a.key, a.label]))])
  )
  const byType = summary.byType || {}
  const activeType = state.worldType || 'all'
  const filtered = activeType === 'all' ? entities : entities.filter((e) => e.type === activeType)
  const typeKeys = Object.keys(typeLabel).filter((k) => (byType[k] || 0) > 0)
  const renderEntity = (e) => {
    const attrs = e.attributes || {}
    const labels = attrLabels[e.type] || {}
    const rows = Object.entries(attrs).filter(([, v]) => v)
    const rels = (e.relations || []).map((r) => `${esc(r.target)}${r.kind ? `（${esc(r.kind)}）` : ''}`)
    return `<details style="border:1px solid var(--border-color);border-radius:6px;padding:8px;">
      <summary style="font-size:13px;cursor:pointer;"><b>[${esc(typeLabel[e.type] || e.type)}]</b> ${esc(e.name)} <span style="color:var(--text-secondary);font-size:12px;">x${esc(e.mentions || 0)}</span>${(e.aliases || []).length ? ` <span style="color:var(--text-secondary);font-size:12px;">${esc(e.aliases.join('/'))}</span>` : ''}</summary>
      <div style="margin-top:6px;">
        ${e.description ? `<div style="font-size:12px;color:var(--text-secondary);">${esc(e.description)}</div>` : ''}
        ${rows.length ? `<table style="font-size:12px;border-collapse:collapse;margin-top:4px;">${rows.map(([k, v]) => `<tr><td style="color:#7c3aed;padding:2px 8px 2px 0;vertical-align:top;">${esc(labels[k] || k)}</td><td style="color:var(--text-secondary);">${esc(v)}</td></tr>`).join('')}</table>` : '<div style="font-size:12px;color:var(--text-secondary);">（无结构化属性）</div>'}
        ${rels.length ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">关系：${rels.join('、')}</div>` : ''}
      </div>
    </details>`
  }
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">世界观 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:12px;color:var(--text-secondary);">引擎</label>
          <select id="nvWorldProvider" class="form-input" style="padding:4px;" ${lk ? 'disabled' : ''}>
            <option value="llm">LLM（真实）</option>
            <option value="heuristic">启发式（离线）</option>
          </select>
          <button id="nvWorld" class="btn btn-primary btn-sm" ${lk ? 'disabled' : ''}>生成世界观（新备选）</button>
        </div>
      </div>
      <div id="nvLlmPicker" style="margin-top:8px;"></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
        实体 ${esc(summary.total || 0)} · 关系 ${esc(summary.relations || 0)} ·
        ${Object.entries(typeLabel).map(([k, l]) => `${esc(l)} ${esc(byType[k] || 0)}`).join(' · ')}
      </div>
      ${(summary.missingCoreTypes || []).length ? `<div style="font-size:12px;color:#d97706;margin-top:4px;">缺失核心类型：${esc(summary.missingCoreTypes.join('、'))}（可换引擎或增大章节范围）</div>` : ''}
      ${sets.length ? `<div style="margin-top:10px;font-size:12px;">备选集合：${sets.map((s) => `<button class="btn btn-sm ${s.selected ? 'btn-primary' : ''}" data-wset="${esc(s.id)}" ${lk ? 'disabled' : ''}>${s.count} 实体 · ${esc(s.provider)}${s.selected ? '（当前）' : ''}</button>`).join(' ')}</div>` : ''}
      ${typeKeys.length ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm ${activeType === 'all' ? 'btn-primary' : ''}" data-wtype="all">全部 ${esc(entities.length)}</button>
        ${typeKeys.map((k) => `<button class="btn btn-sm ${activeType === k ? 'btn-primary' : ''}" data-wtype="${esc(k)}">${esc(typeLabel[k])} ${esc(byType[k])}</button>`).join('')}
      </div>` : ''}
    </section>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;">
      <section class="card" style="padding:14px;">
        <h4 style="margin-top:0;">实体 ${activeType === 'all' ? '' : `· ${esc(typeLabel[activeType] || activeType)}`}</h4>
        <div style="display:grid;gap:6px;max-height:520px;overflow:auto;">
          ${filtered.length ? filtered.map(renderEntity).join('') : '<div style="color:var(--text-secondary);">暂无</div>'}
        </div>
      </section>
      <section class="card" style="padding:14px;">
        <h4 style="margin-top:0;">关系</h4>
        <div style="display:grid;gap:6px;max-height:520px;overflow:auto;">
          ${relations.length ? relations.map((r) => `<div style="font-size:13px;">${esc(r.fromName)} <span style="color:var(--text-secondary);">-[${esc(r.kind)}]-></span> ${esc(r.toName)}</div>`).join('') : '<div style="color:var(--text-secondary);">暂无</div>'}
        </div>
      </section>
    </div>`

  mountLlmPicker(body.querySelector('#nvLlmPicker'), id, refresh)

  body.querySelector('#nvWorld')?.addEventListener('click', async () => {
    const provider = body.querySelector('#nvWorldProvider').value
    try {
      const r = unwrap(await api.extractNovelWorld(id, { provider }))
      if (r && r.degraded) showToast('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'error')
      else showToast('已生成世界观备选', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
  body.querySelectorAll('[data-wset]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.selectNovelWorldSet(id, b.dataset.wset); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-wtype]').forEach((b) => b.addEventListener('click', () => {
    state.worldType = b.dataset.wtype
    refresh()
  }))
}

// ---------- 设定图集（角色/衣物/装备/建筑/场景/道具…） ----------
const ASSET_CATEGORIES = [['character', '角色'], ['clothing', '衣物'], ['equipment', '装备'], ['architecture', '建筑'], ['scene', '场景'], ['prop', '道具'], ['other', '其他']]
const ASSET_CAT_LABEL = Object.fromEntries(ASSET_CATEGORIES)

async function tabArt({ body, id, refresh }) {
  const data = await api.listNovelAssets(id).then(unwrap).catch(() => ({ assets: [], stats: {} }))
  const assets = (data && data.assets) || []
  const stats = (data && data.stats) || {}
  const active = state.artCategory || 'all'
  const filtered = active === 'all' ? assets : assets.filter((a) => a.category === active)
  const card = (a) => `
    <div class="card" style="padding:10px;border:1px solid var(--border-color);">
      <div style="aspect-ratio:16/9;background:var(--bg-secondary,#f3f4f6);border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${a.imageUrl ? `<img data-media="${esc(a.imageUrl)}" alt="${esc(a.name)}" style="width:100%;height:100%;object-fit:cover;" />` : '<span style="font-size:12px;color:var(--text-secondary);">未出图</span>'}
      </div>
      <div style="font-size:13px;margin-top:6px;font-weight:600;">${esc(a.name)} <span style="font-size:11px;color:#7c3aed;">${esc(ASSET_CAT_LABEL[a.category] || a.category)}</span>${a.source !== 'manual' ? ` <span style="font-size:11px;color:var(--text-secondary);">· ${esc(a.source)}</span>` : ''}</div>
      ${a.prompt ? `<div style="font-size:11px;color:var(--text-secondary);max-height:32px;overflow:hidden;">${esc(a.prompt)}</div>` : ''}
      ${a.error ? `<div style="font-size:11px;color:#dc2626;">${esc(a.error)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
        <button class="btn btn-sm" data-agen="${esc(a.id)}">${a.imageUrl ? '重出图' : '生成图'}</button>
        <button class="btn btn-sm" data-aedit="${esc(a.id)}">编辑</button>
        <button class="btn btn-sm" data-adel="${esc(a.id)}">删除</button>
      </div>
    </div>`
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">设定图集 <span style="font-size:12px;color:var(--text-secondary);">（为图生视频准备成套设定图）</span></h3>
        <button id="nvArtSuggest" class="btn btn-sm">从角色/世界观导入候选</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">共 ${assets.length} · 已出图 ${esc(stats.generated || 0)} · 失败 ${esc(stats.failed || 0)} · ${ASSET_CATEGORIES.map(([k, l]) => `${l} ${esc((stats.byCategory && stats.byCategory[k]) || 0)}`).join(' · ')}</div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm ${active === 'all' ? 'btn-primary' : ''}" data-acat="all">全部 ${assets.length}</button>
        ${ASSET_CATEGORIES.map(([k, l]) => `<button class="btn btn-sm ${active === k ? 'btn-primary' : ''}" data-acat="${k}">${l} ${esc((stats.byCategory && stats.byCategory[k]) || 0)}</button>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <select id="nvArtCat" class="form-input" style="padding:4px;">${ASSET_CATEGORIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <input id="nvArtName" class="form-input" style="flex:1;min-width:150px;" placeholder="名称（如：主角 / 星舰 / 王城）" />
        <input id="nvArtPrompt" class="form-input" style="flex:2;min-width:200px;" placeholder="描述（可选）" />
        <button id="nvArtAdd" class="btn btn-sm">+ 新增</button>
      </div>
    </section>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
      ${filtered.length ? filtered.map(card).join('') : '<div style="color:var(--text-secondary);">暂无设定图。点「从角色/世界观导入候选」，或手动新增。</div>'}
    </div>`

  body.querySelectorAll('img[data-media]').forEach(async (img) => {
    try { img.src = await api.mediaObjectUrl(img.dataset.media) } catch { /* 未登录/无权限则保持占位 */ }
  })
  body.querySelectorAll('[data-acat]').forEach((b) => b.addEventListener('click', () => {
    state.artCategory = b.dataset.acat
    refresh()
  }))
  body.querySelector('#nvArtAdd')?.addEventListener('click', async () => {
    const category = body.querySelector('#nvArtCat').value
    const name = body.querySelector('#nvArtName').value.trim()
    const prompt = body.querySelector('#nvArtPrompt').value.trim()
    if (!name) return showToast('请填名称', 'error')
    try {
      await api.createNovelAsset(id, { category, name, prompt })
      showToast('已新增', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelector('#nvArtSuggest')?.addEventListener('click', async () => {
    try {
      const r = unwrap(await api.suggestNovelAssets(id, {}))
      showToast(`已导入候选 ${r.created} 个`, 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelectorAll('[data-agen]').forEach((b) => b.addEventListener('click', async () => {
    showToast('生成中…（约 10–30 秒）')
    try {
      await api.generateNovelAsset(id, b.dataset.agen)
      showToast('已出图', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-aedit]').forEach((b) => b.addEventListener('click', async () => {
    const name = prompt('名称：')
    if (name === null) return
    const p = prompt('描述：')
    if (p === null) return
    try {
      await api.updateNovelAsset(id, b.dataset.aedit, { name, prompt: p })
      showToast('已保存', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('删除该设定图？')) return
    try {
      await api.deleteNovelAsset(id, b.dataset.adel)
      showToast('已删除', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  }))
}

// ---------- 分季分集 ----------
async function tabSeries({ body, novel, id, refresh }) {
  const lk = locked(novel, 'series')
  const [seasons, episodes] = await Promise.all([
    api.listNovelSeasons(id).then(unwrap).catch(() => []),
    api.listNovelEpisodes(id).then(unwrap).catch(() => []),
  ])
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">分季分集 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <button id="nvPlan" class="btn btn-primary btn-sm" ${lk ? 'disabled' : ''}>规划（1章≥1集，每季≥200集）</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">季 ${esc(seasons.length)} · 集 ${esc(episodes.length)}（每集目标 90s，85–95s）</div>
    </section>
    <div style="display:grid;gap:8px;">
      ${seasons.length ? seasons.slice(0, 30).map((s) => `
        <div class="card" style="padding:10px;border:1px solid var(--border-color);font-size:13px;">
          <b>${esc(s.title)}</b> · ${esc(s.episodeCount)} 集 · 章 ${esc(s.chapterStart)}-${esc(s.chapterEnd)}
        </div>`).join('') : '<div style="color:var(--text-secondary);">暂无季/集，点“规划”</div>'}
    </div>`

  body.querySelector('#nvPlan')?.addEventListener('click', async () => {
    try {
      await api.planNovelSeries(id, {})
      showToast('规划完成', 'success')
      refresh()
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

// ---------- 单集 ----------
async function tabEpisode({ body, novel, id, refresh }) {
  const seasons = await api.listNovelSeasons(id).then(unwrap).catch(() => [])
  const seasonId = state.seasonId && seasons.some((s) => s.id === state.seasonId) ? state.seasonId : seasons[0]?.id
  state.seasonId = seasonId
  const episodes = seasonId ? await api.listNovelEpisodes(id, seasonId).then(unwrap).catch(() => []) : []
  const lkScript = locked(novel, 'episodes')
  const lkAssets = locked(novel, 'assets')
  const lkCompose = locked(novel, 'compose')

  let panel = ''
  if (state.shotEpisodeId) {
    const [shots, assetData] = await Promise.all([
      api.listEpisodeShots(id, state.shotEpisodeId).then(unwrap).catch(() => []),
      api.listNovelAssets(id).then(unwrap).catch(() => ({ assets: [] })),
    ])
    const assets = (assetData && assetData.assets) || []
    panel = `
      <section class="card" style="padding:16px;margin-bottom:14px;border:1px solid #7c3aed;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;">分镜 / 外部生成</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button id="nvShotAuto" class="btn btn-sm">自动匹配参考图</button>
            <button id="nvShotExport" class="btn btn-sm btn-primary">导出分镜清单</button>
            <button id="nvShotImport" class="btn btn-sm">导入回传视频</button>
            <button id="nvShotClose" class="btn btn-sm">收起</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">流程：导出 manifest+refs → 外部工具逐分镜生成 → 放回 <code>/storage/videos/novels/&lt;id&gt;/shots/&lt;eid&gt;/shotNN.mp4</code> → 导入 → 成片按分镜拼接</div>
        <div style="display:grid;gap:8px;margin-top:10px;">
          ${shots.length ? shots.map((s) => {
            const refs = s.referenceImages || []
            return `<div style="border:1px solid var(--border-color);border-radius:6px;padding:8px;">
              <div style="font-size:13px;"><b>#${esc(s.index)}</b> <span style="color:var(--text-secondary);">${esc(s.duration)}s</span> ${s.videoUrl ? '<span style="color:#16a34a;">· ✅已回传</span>' : ''}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin:4px 0;">${esc(s.description || '')}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">${assets.length ? assets.map((a) => `<label style="font-size:11px;${a.imageUrl ? '' : 'opacity:.5;'}"><input type="checkbox" data-shotsel="${esc(s.index)}" data-url="${esc(a.imageUrl || '')}" ${refs.includes(a.imageUrl) ? 'checked' : ''} ${a.imageUrl ? '' : 'disabled'}> ${esc(a.name)}</label>`).join('') : '<span style="font-size:11px;color:var(--text-secondary);">（设定图集为空，先去「设定图集」生成）</span>'}</div>
            </div>`
          }).join('') : '<div style="color:var(--text-secondary);">该集暂无分镜，先点「剧本」生成。</div>'}
        </div>
      </section>`
  }

  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:13px;">季</label>
        <select id="nvSeason" class="form-input" style="padding:4px;max-width:260px;">
          ${seasons.map((s) => `<option value="${esc(s.id)}" ${s.id === seasonId ? 'selected' : ''}>${esc(s.title)}（${esc(s.episodeCount)} 集）</option>`).join('') || '<option>（无季）</option>'}
        </select>
        <span style="font-size:12px;color:var(--text-secondary);">单集：剧本 ${lkScript ? '锁定' : '可改'} / 资产 ${lkAssets ? '锁定' : '可改'} / 成片 ${lkCompose ? '锁定' : '可改'}</span>
      </div>
    </section>
    ${panel}
    <div style="display:grid;gap:8px;">
      ${episodes.length ? episodes.slice(0, 40).map((e) => `
        <div class="card" style="padding:10px;border:1px solid var(--border-color);">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">
            <div style="font-size:13px;"><b>#${esc(e.episodeNo)}</b> ${esc(e.title)} <span style="color:var(--text-secondary);font-size:12px;">· ${esc(e.targetSeconds)}s · ${esc(e.status)}${e.screenplay ? ` · ${esc(e.screenplay.totalSeconds)}s` : ''}</span></div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" data-script="${esc(e.id)}" ${lkScript ? 'disabled' : ''}>剧本</button>
              <button class="btn btn-sm" data-shots="${esc(e.id)}">分镜</button>
              <button class="btn btn-sm" data-assets="${esc(e.id)}" ${lkAssets ? 'disabled' : ''}>资产</button>
              <button class="btn btn-sm" data-compose="${esc(e.id)}" ${lkCompose ? 'disabled' : ''}>成片</button>
              <button class="btn btn-sm" data-handoff="${esc(e.id)}">交接导出</button>
            </div>
          </div>
        </div>`).join('') : '<div style="color:var(--text-secondary);">该季暂无集，请先在「分季分集」规划</div>'}
    </div>`

  body.querySelector('#nvSeason')?.addEventListener('change', (ev) => {
    state.seasonId = ev.target.value
    state.shotEpisodeId = null
    refresh()
  })
  body.querySelectorAll('[data-script]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.generateEpisodeScript(id, b.dataset.script, {}); showToast('剧本已生成', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-shots]').forEach((b) => b.addEventListener('click', () => {
    state.shotEpisodeId = state.shotEpisodeId === b.dataset.shots ? null : b.dataset.shots
    refresh()
  }))
  body.querySelectorAll('[data-assets]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.generateEpisodeAssets(id, b.dataset.assets, {}); showToast('资产已生成', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-compose]').forEach((b) => b.addEventListener('click', async () => {
    try { await api.composeEpisode(id, b.dataset.compose, {}); showToast('成片完成', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelectorAll('[data-handoff]').forEach((b) => b.addEventListener('click', async () => {
    try { const r = unwrap(await api.exportEpisodeHandoff(id, b.dataset.handoff)); showToast('交接包已导出：' + (r.dir || ''), 'success') } catch (err) { showToast(err.message, 'error') }
  }))

  if (state.shotEpisodeId) {
    const eid = state.shotEpisodeId
    body.querySelector('#nvShotClose')?.addEventListener('click', () => { state.shotEpisodeId = null; refresh() })
    body.querySelector('#nvShotAuto')?.addEventListener('click', async () => {
      try { const r = unwrap(await api.autoRefsEpisodeShots(id, eid)); showToast(`自动匹配：${r.shotsTouched} 个分镜、新增 ${r.refsAdded} 张参考图`, 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
    })
    body.querySelector('#nvShotExport')?.addEventListener('click', async () => {
      try { const r = unwrap(await api.exportEpisodeShotHandoff(id, eid, {})); showToast(`已导出 ${r.shotCount} 分镜（${r.refCount} 参考图）→ ${r.dir}`, 'success') } catch (err) { showToast(err.message, 'error') }
    })
    body.querySelector('#nvShotImport')?.addEventListener('click', async () => {
      try {
        const r = unwrap(await api.importEpisodeShotVideos(id, eid, {}))
        showToast(`导入 ${r.imported.length}/${r.total} 段${r.missing.length ? '（缺：' + r.missing.join(',') + '）' : ''}`, r.missing.length ? 'error' : 'success')
        refresh()
      } catch (err) { showToast(err.message, 'error') }
    })
    body.querySelectorAll('input[data-shotsel]').forEach((cb) => cb.addEventListener('change', async () => {
      const index = cb.dataset.shotsel
      const urls = [...body.querySelectorAll(`input[data-shotsel="${index}"]`)].filter((x) => x.checked && x.dataset.url).map((x) => x.dataset.url)
      try { await api.setEpisodeShotRefs(id, eid, index, urls); showToast(`分镜 #${index} 参考图已更新`, 'success') } catch (err) { showToast(err.message, 'error') }
    }))
  }
}

// ---------- 风格 / 同步 ----------
async function tabSync({ body, novel, id, refresh }) {
  const manifest = await api.getNovelManifest(id).then(unwrap).catch(() => ({ files: [] }))
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <h3 style="margin-top:0;">全书风格</h3>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">${novel.style && novel.style.name ? `${esc(novel.style.name)}｜${esc(novel.style.visual || '')}` : '（未生成）'}</div>
      <button id="nvStyle" class="btn btn-sm">生成风格（LLM）</button>
    </section>
    <section class="card" style="padding:16px;">
      <h3 style="margin-top:0;">剧集包 / 同步</h3>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">清单文件数 ${esc((manifest.files || []).length)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="nvSyncDir" class="form-input" style="flex:1;min-width:240px;" placeholder="本地同步目标目录（如 /Users/link/out）" />
        <button id="nvSyncLocal" class="btn btn-sm">同步到本地</button>
        <button id="nvSyncQuark" class="btn btn-sm">夸克网盘 dry-run</button>
      </div>
    </section>`

  body.querySelector('#nvStyle')?.addEventListener('click', async () => {
    try { await api.generateNovelStyle(id); showToast('风格已生成', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelector('#nvSyncLocal')?.addEventListener('click', async () => {
    const targetDir = body.querySelector('#nvSyncDir')?.value?.trim()
    if (!targetDir) return showToast('请填目标目录', 'error')
    try { const r = unwrap(await api.syncNovel(id, { backend: 'local', targetDir })); showToast(`已复制 ${r.copied} 个文件`, 'success') } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelector('#nvSyncQuark')?.addEventListener('click', async () => {
    try { const r = unwrap(await api.syncNovel(id, { backend: 'quark', dryRun: true })); showToast(`夸克 dry-run：${r.fileCount} 个文件`, 'success') } catch (err) { showToast(err.message, 'error') }
  })
}
