/**
 * 小说剧场「制作台」（#/novels 列表、#/novel/:id 详情）
 * 覆盖全链路：阶段进度/锁定、来源、角色（备选+选定+审核）、世界观（备选+选定）、
 * 分季分集、单集（剧本/资产/成片/交接）、风格、清单与同步。
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

const STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose']
// 长任务（角色/世界观抽取）前端锁：避免重复点击触发多次并发抽取。
// 后端同名锁会返回 409 兜底。
const EXTRACT_BUSY = new Set()

// 抽取进度轮询：每 2s 拉一次，逐片展示状态；无进行中任务时自动停止。
let STATUS_TIMER = null
let STATUS_NOVEL = null

// 网盘扫码登录轮询（切换标签页时必须停掉，避免定时器泄漏）
let QUARK_QR_TIMER = null

function stopQuarkQrPoll() {
  if (QUARK_QR_TIMER) {
    clearInterval(QUARK_QR_TIMER)
    QUARK_QR_TIMER = null
  }
}

function renderJobs(jobs) {
  const kinds = [
    ['both', '合并（角色+世界观）'],
    ['characters', '角色'],
    ['world', '世界观'],
  ]
  const blocks = kinds
    .map(([k, label]) => {
      const j = jobs && jobs[k]
      if (!j) return ''
      const chips = (j.tasks || [])
        .map((t) => {
          const color =
            t.status === 'done' ? '#16a34a' : t.status === 'failed' ? '#dc2626' : t.status === 'running' ? '#d97706' : 'var(--text-secondary)'
          const mark = t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'running' ? '…' : '·'
          const ms = t.ms ? ` ${(t.ms / 1000).toFixed(1)}s` : ''
          return `<span title="${esc(t.error || '')}" style="font-size:11px;color:${color};border:1px solid ${color};border-radius:4px;padding:1px 5px;margin:2px;display:inline-block;">${mark} ${esc(t.label)}${ms}</span>`
        })
        .join('')
      const settled = (j.done || 0) + (j.failed || 0)
      const pct = j.total ? Math.round((settled / j.total) * 100) : 0
      const tail = j.finishedAt ? '已结束' : `进行中… ${pct}%`
      return `<div style="margin-top:6px;">
        <div style="font-size:12px;">${label}：完成 ${j.done}/${j.total} · 失败 ${j.failed} · 运行中 ${j.running} · ${tail}</div>
        <div style="margin-top:2px;">${chips}</div>
      </div>`
    })
    .join('')
  return blocks
    ? `<div style="border:1px solid var(--border-color);border-radius:6px;padding:8px;margin-top:8px;">${blocks}</div>`
    : ''
}

async function pollStatus(id) {
  try {
    const jobs = unwrap(await api.novelExtractStatus(id)) || {}
    const el = document.getElementById('nvExtractStatus')
    if (el) el.innerHTML = renderJobs(jobs)
    const active = ['characters', 'world', 'both'].some((k) => jobs[k] && !jobs[k].finishedAt)
    if (!active && STATUS_TIMER) {
      clearInterval(STATUS_TIMER)
      STATUS_TIMER = null
    }
    return active
  } catch {
    return false
  }
}

function startStatusPoll(id) {
  if (STATUS_TIMER && STATUS_NOVEL === id) return
  if (STATUS_TIMER) clearInterval(STATUS_TIMER)
  STATUS_NOVEL = id
  pollStatus(id)
  STATUS_TIMER = setInterval(() => pollStatus(id), 2000)
}
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
// 把数组/对象字段渲染成可读文本（否则会显示 [object Object]）
function fmtVal(v) {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map(fmtVal).filter(Boolean).join('、')
  if (typeof v === 'object') {
    return Object.entries(v)
      .map(([k, val]) => `${k} ${fmtVal(val)}`)
      .filter(Boolean)
      .join('；')
  }
  return String(v)
}
// 把 root 内所有 [data-media] 的图片/视频用带 token 的 fetch 载入（受保护媒体 <img>/<video> 无法自带 Authorization）。
// 失败（未登录/无权限）时给出可见提示，而不是留白。
function mediaHint(text) {
  const d = document.createElement('div')
  d.style.cssText = 'font-size:11px;color:var(--text-secondary);'
  d.textContent = text || '需登录查看'
  return d
}
async function loadMedia(root) {
  const tasks = []
  root.querySelectorAll('img[data-media]').forEach((img) => {
    if (img.dataset.loaded) return
    tasks.push(
      api.mediaObjectUrl(img.dataset.media).then((u) => { img.src = u; img.dataset.loaded = '1' }).catch(() => img.replaceWith(mediaHint('图片需登录后查看')))
    )
  })
  root.querySelectorAll('video[data-media]').forEach((v) => {
    if (v.dataset.loaded) return
    tasks.push(
      api.mediaObjectUrl(v.dataset.media).then((u) => { v.src = u; v.dataset.loaded = '1' }).catch(() => v.insertAdjacentElement('afterend', mediaHint('视频需登录后查看')))
    )
  })
  await Promise.all(tasks)
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
  stopQuarkQrPoll()
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
          <div class="card" style="padding:14px;border:1px solid var(--border-color);display:flex;align-items:center;gap:10px;">
            <a href="#/novel/${esc(n.id)}" style="display:block;flex:1;color:inherit;text-decoration:none;">
              <div style="font-weight:600;">${esc(n.title)} <span style="font-size:12px;color:var(--text-secondary);">${esc(n.author || '')}</span></div>
              <div style="font-size:12px;color:var(--text-secondary);">阶段 ${esc(STAGE_LABEL[n.stage] || n.stage)} · 章 ${esc((n.counts && n.counts.chapters) || 0)} · 角色 ${esc((n.counts && n.counts.characters) || 0)} · 集 ${esc((n.counts && n.counts.episodes) || 0)}</div>
            </a>
            <button class="btn btn-sm" data-delnovel="${esc(n.id)}" data-title="${esc(n.title)}" style="color:#dc2626;">删除</button>
          </div>`).join('') : '<div style="color:var(--text-secondary);">还没有小说项目</div>'}
      </div>
    </div>`

  container.querySelectorAll('[data-delnovel]').forEach((b) => b.addEventListener('click', async () => {
    const title = b.dataset.title || b.dataset.delnovel
    if (!confirm(`确定删除「${title}」？\n\n会同时删除该项目的角色/剧本/资产/成片/同步记录，不可恢复。`)) return
    b.disabled = true
    try {
      await api.deleteNovel(b.dataset.delnovel)
      showToast('已删除', 'success')
      renderList(container)
    } catch (err) {
      b.disabled = false
      showToast(err.message, 'error')
    }
  }))

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
        ${rows.map((f) => `<div style="font-size:12px;color:var(--text-secondary);"><b>${esc(f.label)}</b>：${esc(fmtVal(card[f.key]))}</div>`).join('')}</div>`
    }).join('')
    return blocks || '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">（未抽取到字段，可用启发式引擎先跑通或换 LLM）</div>'
  }
  const cBusy = EXTRACT_BUSY.has('c:' + id)
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">角色 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:12px;color:var(--text-secondary);">引擎</label>
          <select id="nvExtractProvider" class="form-input" style="padding:4px;" ${lk || cBusy ? 'disabled' : ''}>
            <option value="llm">LLM（真实）</option>
            <option value="heuristic">启发式（离线）</option>
          </select>
          <button id="nvExtract" class="btn btn-primary btn-sm" ${lk || cBusy ? 'disabled' : ''}>${cBusy ? '生成中…（角色）' : '生成角色（新备选）'}</button>
          <button id="nvExtractAll" class="btn btn-sm" ${lk ? 'disabled' : ''}>角色+世界观（一次·一致）</button>
        </div>
      </div>
      <div id="nvLlmPicker" style="margin-top:8px;"></div>
      <div id="nvExtractStatus"></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">字段 ${fields.length} 项 · 修订率 ${((stats.revisionRate || 0) * 100).toFixed(1)}% · 已通过 ${esc(stats.approved || 0)} / ${esc(chars.length)}</div>
      ${sets.length ? `<div style="margin-top:10px;font-size:12px;">备选集合：${sets.map((s) => `<button class="btn btn-sm ${s.selected ? 'btn-primary' : ''}" data-cset="${esc(s.id)}" ${lk || s.live === 0 ? 'disabled' : ''} title="${s.live === 0 ? '该备选的数据已被早期版本清除，无法恢复' : ''}">${s.count} 个 · ${esc(s.provider)}${s.selected ? '（当前）' : ''}${s.live === 0 ? '（已失效）' : ''}</button>`).join(' ')}</div>` : ''}
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
  startStatusPoll(id)

  body.querySelector('#nvExtract')?.addEventListener('click', async () => {
    const key = 'c:' + id
    if (EXTRACT_BUSY.has(key)) { showToast('角色抽取正在进行中，请稍候', 'info'); return }
    EXTRACT_BUSY.add(key)
    const provider = body.querySelector('#nvExtractProvider').value
    startStatusPoll(id)
    refresh() // 立即置灰按钮，防止重复点击
    try {
      const r = unwrap(await api.extractNovelCharacters(id, { provider, minFreq: 1 }))
      if (r && r.degraded) showToast('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'error')
      else showToast('已生成角色备选', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      EXTRACT_BUSY.delete(key)
      refresh()
    }
  })
  body.querySelector('#nvExtractAll')?.addEventListener('click', async () => {
    const key = 'b:' + id
    if (EXTRACT_BUSY.has(key)) { showToast('合并抽取正在进行中，请稍候', 'info'); return }
    EXTRACT_BUSY.add(key)
    startStatusPoll(id)
    refresh()
    try {
      const r = unwrap(await api.extractNovelAll(id, { provider: 'llm' }))
      if (r && r.degraded) showToast('LLM 调用失败，已回退启发式：结果可能为空/粗糙', 'error')
      else showToast(`已生成：角色 ${(r.characters || []).length} · 世界观 ${(r.entities || []).length}（命名已对齐）`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      EXTRACT_BUSY.delete(key)
      refresh()
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

  // 形象时间线（按剧情演进）
  const tlHost = document.createElement('section')
  tlHost.className = 'card'
  tlHost.style.cssText = 'padding:16px;margin-top:14px;'
  tlHost.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;">形象时间线（角色随剧情演进）</h3>
      <button id="nvTlLoad" class="btn btn-sm">加载</button>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">同一角色在不同集的外观/装备/能力；出图会按当集状态生成。</div>
    <div id="nvTlBody" style="margin-top:8px;"></div>`
  body.appendChild(tlHost)
  tlHost.querySelector('#nvTlLoad')?.addEventListener('click', async () => {
    const host = tlHost.querySelector('#nvTlBody')
    host.textContent = '加载中…'
    try {
      const tl = unwrap(await api.listNovelTimeline(id)).timeline || []
      host.innerHTML = tl.length
        ? tl.map((c) => `<details style="margin-bottom:6px;"><summary style="cursor:pointer;font-size:13px;"><b>${esc(c.name)}</b> · ${c.states.length} 个时间点</summary>
            <div style="margin:6px 0 0 12px;">${c.states.map((s) => `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;"><b>第${esc(s.episodeNo)}集</b>：${esc(s.appearance || '')}${s.equipment ? `；装备：${esc(s.equipment)}` : ''}${s.injuries ? `；伤势：${esc(s.injuries)}` : ''}${s.abilities ? `；能力：${esc(s.abilities)}` : ''} <span style="color:#7c3aed;">[${esc(s.source)}]</span></div>`).join('')}</div>
          </details>`).join('')
        : '<div style="font-size:12px;color:var(--text-secondary);">暂无形象记录，可在「单集」页生成。</div>'
    } catch (err) { host.textContent = err.message }
  })
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
        ${rows.length ? `<table style="font-size:12px;border-collapse:collapse;margin-top:4px;">${rows.map(([k, v]) => `<tr><td style="color:#7c3aed;padding:2px 8px 2px 0;vertical-align:top;">${esc(labels[k] || k)}</td><td style="color:var(--text-secondary);">${esc(fmtVal(v))}</td></tr>`).join('')}</table>` : '<div style="font-size:12px;color:var(--text-secondary);">（无结构化属性）</div>'}
        ${rels.length ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">关系：${rels.join('、')}</div>` : ''}
      </div>
    </details>`
  }
  const wBusy = EXTRACT_BUSY.has('w:' + id)
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">世界观 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:12px;color:var(--text-secondary);">引擎</label>
          <select id="nvWorldProvider" class="form-input" style="padding:4px;" ${lk || wBusy ? 'disabled' : ''}>
            <option value="llm">LLM（真实）</option>
            <option value="heuristic">启发式（离线）</option>
          </select>
          <button id="nvWorld" class="btn btn-primary btn-sm" ${lk || wBusy ? 'disabled' : ''}>${wBusy ? '生成中…（世界观）' : '生成世界观（新备选）'}</button>
        </div>
      </div>
      <div id="nvLlmPicker" style="margin-top:8px;"></div>
      <div id="nvExtractStatus"></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
        实体 ${esc(summary.total || 0)} · 关系 ${esc(summary.relations || 0)} ·
        ${Object.entries(typeLabel).map(([k, l]) => `${esc(l)} ${esc(byType[k] || 0)}`).join(' · ')}
      </div>
      ${(summary.missingCoreTypes || []).length ? `<div style="font-size:12px;color:#d97706;margin-top:4px;">缺失核心类型：${esc(summary.missingCoreTypes.join('、'))}（可换引擎或增大章节范围）</div>` : ''}
      ${sets.length ? `<div style="margin-top:10px;font-size:12px;">备选集合：${sets.map((s) => `<button class="btn btn-sm ${s.selected ? 'btn-primary' : ''}" data-wset="${esc(s.id)}" ${lk || s.live === 0 ? 'disabled' : ''} title="${s.live === 0 ? '该备选的数据已被早期版本清除，无法恢复' : ''}">${s.count} 实体 · ${esc(s.provider)}${s.selected ? '（当前）' : ''}${s.live === 0 ? '（已失效）' : ''}</button>`).join(' ')}</div>` : ''}
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
  startStatusPoll(id)

  body.querySelector('#nvWorld')?.addEventListener('click', async () => {
    const key = 'w:' + id
    if (EXTRACT_BUSY.has(key)) { showToast('世界观抽取正在进行中，请稍候', 'info'); return }
    EXTRACT_BUSY.add(key)
    const provider = body.querySelector('#nvWorldProvider').value
    startStatusPoll(id)
    refresh() // 立即置灰按钮，防止重复点击
    try {
      const r = unwrap(await api.extractNovelWorld(id, { provider }))
      if (r && r.degraded) showToast('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'error')
      else showToast('已生成世界观备选', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      EXTRACT_BUSY.delete(key)
      refresh()
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
  const stageAssets = assets.filter((a) => a.episodeNo)
  const filtered = active === 'all' ? assets : active === '__stage' ? stageAssets : assets.filter((a) => a.category === active)
  const card = (a) => `
    <div class="card" style="padding:10px;border:1px solid var(--border-color);">
      <div style="aspect-ratio:16/9;background:var(--bg-secondary,#f3f4f6);border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${a.imageUrl ? `<img data-media="${esc(a.imageUrl)}" alt="${esc(a.name)}" style="width:100%;height:100%;object-fit:cover;" />` : '<span style="font-size:12px;color:var(--text-secondary);">未出图</span>'}
      </div>
      <div style="font-size:13px;margin-top:6px;font-weight:600;">${esc(a.name)} <span style="font-size:11px;color:#7c3aed;">${esc(ASSET_CAT_LABEL[a.category] || a.category)}</span>${a.episodeNo ? ` <span style="font-size:11px;color:#16a34a;">· 第${esc(a.episodeNo)}集阶段</span>` : ''}${a.source !== 'manual' && !a.episodeNo ? ` <span style="font-size:11px;color:var(--text-secondary);">· ${esc(a.source)}</span>` : ''}</div>
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
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span id="nvArtBulkInfo" style="font-size:12px;color:#7c3aed;"></span>
          <button id="nvArtBulk" class="btn btn-sm">本类批量出图</button>
          <button id="nvArtStop" class="btn btn-sm" style="display:none;color:#dc2626;">停止出图</button>
          <button id="nvArtSuggest" class="btn btn-sm">从角色/世界观导入候选（含各阶段）</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">共 ${assets.length} · 已出图 ${esc(stats.generated || 0)} · 失败 ${esc(stats.failed || 0)} · ${ASSET_CATEGORIES.map(([k, l]) => `${l} ${esc((stats.byCategory && stats.byCategory[k]) || 0)}`).join(' · ')}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">批量出图按「当前类别」逐张生成（单张约 1 分钟、走付费 provider）；分批续跑，可随时停。</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">角色会按「形象时间线」拆成多个阶段（如 少年期 / 荒漠期 / 终局形态），每个阶段一张设定图；无时间线时回退为单张角色卡。</div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-sm ${active === 'all' ? 'btn-primary' : ''}" data-acat="all">全部 ${assets.length}</button>
        <button class="btn btn-sm ${active === '__stage' ? 'btn-primary' : ''}" data-acat="__stage">角色阶段 ${stageAssets.length}</button>
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

  loadMedia(body) // 设定图缩略图（带 token 载入；未登录时给出可见提示）
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
  body.querySelector('#nvArtBulk')?.addEventListener('click', async () => {
    const btn = body.querySelector('#nvArtBulk')
    const stopBtn = body.querySelector('#nvArtStop')
    const info = body.querySelector('#nvArtBulkInfo')
    const cats = state.artCategory && state.artCategory !== 'all' && state.artCategory !== '__stage' ? [state.artCategory] : undefined
    const old = btn.textContent
    let stopped = false
    ;[...body.querySelectorAll('button,input,select')].forEach((x) => { if (x.id !== 'nvArtStop') x.disabled = true })
    btn.textContent = '出图中…'
    if (stopBtn) {
      stopBtn.style.display = 'inline-block'
      stopBtn.disabled = false
      stopBtn.textContent = '停止出图'
      stopBtn.onclick = async () => {
        stopped = true
        stopBtn.disabled = true
        stopBtn.textContent = '停止中…'
        try { await api.cancelNovelAssetBulk(id) } catch { /* 已停 */ }
      }
    }
    try {
      let guard = 0
      for (;;) {
        const r = unwrap(await api.bulkGenerateAssets(id, {
          categories: cats,
          onlyMissing: true,
          limit: 3,
          concurrency: 2,
          reset: guard === 0 && !stopped,
        }))
        if (info) info.textContent = `已出图 ${r.withImages}/${r.total}（本轮 ${r.ok} 成功 / ${r.failed} 失败）`
        if (r.cancelled || r.stopped || stopped) {
          showToast('已停止出图', 'success')
          break
        }
        if (r.remaining <= 0 || r.processed === 0 || ++guard > 400) break
      }
      if (!stopped && info && !info.textContent.includes('停止')) showToast('批量出图完成', 'success')
    } catch (err) {
      if (/已停止/.test(err.message)) showToast('已停止出图', 'success')
      else showToast(err.message, 'error')
    } finally {
      btn.textContent = old
      if (stopBtn) { stopBtn.style.display = 'none'; stopBtn.disabled = false }
      refresh()
    }
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
  const [seasons, episodes, est] = await Promise.all([
    api.listNovelSeasons(id).then(unwrap).catch(() => []),
    api.listNovelEpisodes(id).then(unwrap).catch(() => []),
    api.seriesEstimate(id).then(unwrap).catch(() => null),
  ])
  const hrs = (s) => (s / 3600).toFixed(1)
  const estLine = est
    ? (() => {
        const planned = est.plannedSeconds
        const cur = est.supportSeconds[est.charsPerSecond] || est.supportSeconds['4.5']
        const diff = cur - planned
        const okColor = Math.abs(diff) / (planned || 1) < 0.08 ? '#16a34a' : '#d97706'
        return `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);border-top:1px dashed var(--border-color);padding-top:8px;">
          正文 ${(est.totalChars / 1e6).toFixed(2)}M 字｜规划 <b>${hrs(planned)}h</b>｜按 <b>${est.charsPerSecond} 字/秒</b> 可支撑 <b style="color:${okColor};">${hrs(cur)}h</b>
          （${diff >= 0 ? '多 ' : '差 '}${hrs(Math.abs(diff))}h，${Math.abs(diff) / (planned || 1) < 0.08 ? '基本吻合' : '偏差偏大'}）
          · 参考：4 字/秒 ${hrs(est.supportSeconds[4])}h ／ 5 字/秒 ${hrs(est.supportSeconds[5])}h
        </div>`
      })()
    : ''
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">分季分集 ${lk ? '<span style="font-size:12px;color:#d97706;">（已锁定）</span>' : ''}</h3>
        <button id="nvPlan" class="btn btn-primary btn-sm" ${lk ? 'disabled' : ''}>规划（1章≥1集，每季≥200集）</button>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">季 ${esc(seasons.length)} · 集 ${esc(episodes.length)}（每集目标 90s，85–95s，语速 4.5 字/秒）</div>
      ${estLine}
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
  const seasonAssets = seasonId ? await api.seasonAssetSubset(id, seasonId).then(unwrap).catch(() => null) : null
  const lkScript = locked(novel, 'episodes')
  const lkAssets = locked(novel, 'assets')
  const lkCompose = locked(novel, 'compose')

  // 单集列表分页/搜索（一季可达 200+ 集，不能一次全渲染）
  const PAGE_SIZE = 20
  const q = String(state.epQuery || '').trim()
  const filtered = q
    ? episodes.filter((e) => String(e.episodeNo) === q || String(e.title || '').includes(q))
    : episodes
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const epPage = Math.min(Math.max(1, state.epPage || 1), totalPages)
  state.epPage = epPage
  const pageItems = filtered.slice((epPage - 1) * PAGE_SIZE, epPage * PAGE_SIZE)
  // 每集完成度徽标：剧本 / 资产 / 成片
  const epBadges = (e) => {
    const hasScript = !!(e.screenplay && (e.screenplay.shots || []).length)
    const hasAsset = !!(e.assets && e.assets.image && e.assets.image.url)
    const v = (e.assets && e.assets.video) || {}
    const hasVideo = !!v.url
    const vidErr = !!v.error
    const mk = (ok, err, label) =>
      ok ? `<span style="color:#16a34a;">${label}✓</span>` : err ? `<span style="color:#dc2626;" title="${esc(String(v.error).slice(0, 120))}">${label}✗</span>` : `<span style="color:var(--text-secondary);">${label}—</span>`
    return `<span style="font-size:11px;">${mk(hasScript, false, '剧本')} ${mk(hasAsset, false, '资产')} ${mk(hasVideo, vidErr, '成片')}</span>`
  }
  // 单集操作统一加“生成中…”+禁用，避免慢操作期间重复点击
  const runEpAction = async (btn, label, fn, okMsg) => {
    const old = btn.textContent
    ;[...body.querySelectorAll('button,input')].forEach((x) => { x.disabled = true })
    btn.textContent = label
    try {
      const r = await fn()
      showToast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.textContent = old
      refresh()
    }
  }

  let panel = ''
  const shotEp = state.shotEpisodeId ? episodes.find((e) => e.id === state.shotEpisodeId) : null
  const seasonTitle = (seasons.find((s) => s.id === seasonId) || {}).title || '本季'
  if (state.shotEpisodeId) {
    const [shots, assetData, epStates] = await Promise.all([
      api.listEpisodeShots(id, state.shotEpisodeId).then(unwrap).catch(() => []),
      api.listNovelAssets(id).then(unwrap).catch(() => ({ assets: [] })),
      api.listEpisodeStates(id, state.shotEpisodeId).then(unwrap).catch(() => ({ episodeNo: null, items: [] })),
    ])
    const assetsWithImg = ((assetData && assetData.assets) || []).filter((a) => a.imageUrl)
    const CATS = [...new Set(assetsWithImg.map((a) => a.category))]
    const returned = shots.filter((s) => s.videoUrl).length
    const refd = shots.filter((s) => (s.referenceImages || []).length).length
    const active = shots.find((s) => s.index === state.shotAddFor) || null
    const activeRefs = active ? active.referenceImages || [] : []
    // 供搜索/类别过滤使用（picker 里按需渲染，避免 573 资产 × N 分镜的 DOM 爆炸）
    window.__nvAssets = assetsWithImg
    window.__nvActiveRefs = activeRefs
    window.__nvShotRefs = Object.fromEntries(shots.map((s) => [s.index, s.referenceImages || []]))
    panel = `
      <section id="nvShotPanel" class="card" style="padding:16px;margin-bottom:14px;border:2px solid #7c3aed;">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">${esc(seasonTitle)} ｜ 单集分镜详情</div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 style="margin:0;">第 ${esc(shotEp ? shotEp.episodeNo : '?')} 集 · 分镜 / 外部生成</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button id="nvShotAuto" class="btn btn-sm">自动匹配参考图</button>
            <button id="nvShotExport" class="btn btn-sm btn-primary">导出分镜清单</button>
            <button id="nvShotImport" class="btn btn-sm">导入回传视频</button>
            <button id="nvShotClose" class="btn btn-sm">返回集列表</button>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:4px;font-weight:600;">${esc(shotEp ? shotEp.title : `集 ${state.shotEpisodeId}`)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">分镜 <b>${shots.length}</b> · 已回传 <b>${returned}</b> · 已配参考图 <b>${refd}</b> · 图集可用 <b>${assetsWithImg.length}</b></div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">流程：导出 manifest+refs → 外部工具逐分镜生成 → 放回 <code>/storage/videos/novels/&lt;id&gt;/shots/&lt;eid&gt;/shotNN.mp4</code> → 导入 → 成片按分镜拼接</div>
        <div style="display:grid;gap:8px;margin-top:10px;">
          ${shots.length ? shots.map((s) => {
            const refs = s.referenceImages || []
            return `<div style="border:1px solid var(--border-color);border-radius:6px;padding:8px;">
              <div style="font-size:13px;"><b>#${esc(s.index)}</b> <span style="color:var(--text-secondary);">${esc(s.duration)}s</span> ${
                s.videoUrl ? '<span style="color:#16a34a;">· ✅已回传</span>' : '<span style="color:var(--text-secondary);">· 待生成</span>'
              }</div>
              <div style="font-size:11px;color:var(--text-secondary);margin:4px 0;">${esc(s.description || '')}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:11px;color:var(--text-secondary);">参考图(${refs.length})</span>
                ${refs.map((u) => `<span style="position:relative;display:inline-block;">
                  <img data-media="${esc(u)}" title="${esc(u)}" style="width:64px;height:44px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);display:block;" />
                  <button class="btn" data-refdel="${esc(s.index)}" data-refurl="${esc(u)}" title="移除" style="position:absolute;top:-7px;right:-7px;padding:0 5px;font-size:10px;line-height:16px;border-radius:8px;">×</button>
                </span>`).join('')}
                <button class="btn btn-sm" data-refadd="${esc(s.index)}">＋添加参考图</button>
              </div>
              ${s.videoUrl ? `<video data-media="${esc(s.videoUrl)}" controls preload="metadata" style="max-width:320px;margin-top:8px;border-radius:4px;border:1px solid var(--border-color);"></video>` : ''}
            </div>`
          }).join('') : '<div style="color:var(--text-secondary);">该集暂无分镜，先点「剧本」生成。</div>'}
        </div>
        <div style="margin-top:12px;border-top:1px dashed var(--border-color);padding-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <b style="font-size:13px;">本集角色形象（第 ${esc(epStates.episodeNo || '?')} 集，随剧情时间演进）</b>
            <button id="nvEpStateGen" class="btn btn-sm">生成 / 刷新本集形象</button>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">出图 / 出片会按这里的外观与装备生成，避免出现尚未获得的装备。</div>
          <div id="nvEpStateList" style="display:grid;gap:6px;margin-top:8px;">
            ${(epStates.items || []).length ? (epStates.items).map((it) => {
              const s = it.exact || it.effective || {}
              return `<div style="border:1px solid var(--border-color);border-radius:6px;padding:8px;" data-state-cid="${esc(it.characterId)}" data-state-name="${esc(it.name)}" data-state-ep="${esc(epStates.episodeNo)}">
                <div style="font-size:12px;font-weight:600;">${esc(it.name)} ${it.exact ? '<span style="color:#16a34a;font-size:11px;">· 本集已定</span>' : '<span style="color:#d97706;font-size:11px;">· 沿用第' + esc((it.effective && it.effective.episodeNo) || '?') + '集</span>'}</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px;margin-top:6px;">
                  <input class="form-input" style="padding:4px;" data-sf="appearance" placeholder="外观" value="${esc(s.appearance || '')}" />
                  <input class="form-input" style="padding:4px;" data-sf="equipment" placeholder="装备（本集已持有）" value="${esc(s.equipment || '')}" />
                  <input class="form-input" style="padding:4px;" data-sf="injuries" placeholder="伤势/状态" value="${esc(s.injuries || '')}" />
                  <input class="form-input" style="padding:4px;" data-sf="abilities" placeholder="能力阶段" value="${esc(s.abilities || '')}" />
                </div>
                <div style="margin-top:6px;"><button class="btn btn-sm" data-state-save="1">保存本集形象</button></div>
              </div>`
            }).join('') : '<div style="color:var(--text-secondary);font-size:12px;">该集尚无角色形象，点「生成 / 刷新本集形象」。</div>'}
          </div>
        </div>
        ${active ? `
          <div class="card" style="margin-top:10px;border:1px solid #7c3aed;padding:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <b>为分镜 #${esc(active.index)} 选择参考图</b>
              <button class="btn btn-sm" id="nvRefClose">完成</button>
            </div>
            <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;">
              <input id="nvRefSearch" class="form-input" style="padding:4px;max-width:200px;" placeholder="搜索名称/类别" />
              <select id="nvRefCat" class="form-input" style="padding:4px;max-width:170px;">
                <option value="">全部类别</option>
                ${CATS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select>
              <span style="font-size:11px;color:var(--text-secondary);align-self:center;">已选 ${activeRefs.length} 张（点缩略图切换）</span>
            </div>
            <div id="nvRefGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;max-height:340px;overflow:auto;"></div>
          </div>` : ''}
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
        <span style="flex:1;"></span>
        <button id="nvBulkScript" class="btn btn-sm" ${lkScript ? 'disabled' : ''}>本季批量生成剧本</button>
        <button id="nvBulkAssets" class="btn btn-sm" ${lkAssets ? 'disabled' : ''}>本季批量生成资产</button>
        <span id="nvBulkInfo" style="font-size:12px;color:#7c3aed;"></span>
      </div>
      ${seasonAssets ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;border-top:1px dashed var(--border-color);padding-top:8px;">
        本季设定图子集：涉及 <b>${esc(seasonAssets.subsetCount)}</b> 张（已出图 ${esc(seasonAssets.withImages)} · 待出 <b style="color:#d97706;">${esc(seasonAssets.remaining)}</b>）／全书共 ${esc(seasonAssets.totalAssets)} 张
        <span style="flex:1;"></span>
        <button id="nvSeasonAssetGen" class="btn btn-sm" style="margin-left:8px;">生成本季涉及的设定图</button>
        <span id="nvSeasonAssetInfo" style="font-size:12px;color:#7c3aed;margin-left:6px;"></span>
      </div>` : ''}
      </div>
    </section>
    ${panel}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 12px;">
      <input id="nvEpSearch" class="form-input" style="padding:4px;max-width:220px;" placeholder="搜集号 或 标题关键词" value="${esc(state.epQuery || '')}" />
      <button id="nvEpSearchBtn" class="btn btn-sm">筛选</button>
      ${q ? '<button id="nvEpClear" class="btn btn-sm">清空</button>' : ''}
      <span style="font-size:12px;color:var(--text-secondary);">共 ${esc(filtered.length)} 集 · 第 ${esc(epPage)}/${esc(totalPages)} 页</span>
      <button id="nvEpPrev" class="btn btn-sm" ${epPage <= 1 ? 'disabled' : ''}>上一页</button>
      <button id="nvEpNext" class="btn btn-sm" ${epPage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
    <div style="display:grid;gap:8px;">
      ${pageItems.length ? pageItems.map((e) => `
        <div class="card" id="nvEpCard_${esc(e.id)}" style="padding:10px;border:1px solid ${state.shotEpisodeId === e.id ? '#7c3aed' : 'var(--border-color)'};${state.shotEpisodeId === e.id ? 'box-shadow:0 0 0 2px rgba(124,58,237,.25);' : ''}">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">
            <div style="font-size:13px;min-width:260px;"><b>#${esc(e.episodeNo)}</b> ${esc(e.title)} <span style="color:var(--text-secondary);font-size:12px;">· ${esc(e.targetSeconds)}s${e.screenplay ? ` · 已成片 ${esc(e.screenplay.totalSeconds)}s` : ''}</span><div style="margin-top:3px;">${epBadges(e)}</div></div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" data-script="${esc(e.id)}" ${lkScript ? 'disabled' : ''}>${e.screenplay ? '重生成剧本' : '生成剧本'}</button>
              <button class="btn btn-sm" data-shots="${esc(e.id)}">分镜${(e.screenplay && (e.screenplay.shots || []).length) ? '（' + (e.screenplay.shots || []).length + '）' : ''}</button>
              <button class="btn btn-sm" data-assets="${esc(e.id)}" ${lkAssets ? 'disabled' : ''}>生成资产</button>
              <button class="btn btn-sm" data-compose="${esc(e.id)}" ${lkCompose ? 'disabled' : ''}>合成成片</button>
              <button class="btn btn-sm" data-handoff="${esc(e.id)}">交接导出</button>
            </div>
          </div>
        </div>`).join('') : `<div style="color:var(--text-secondary);">${episodes.length ? '没有匹配的集' : '该季暂无集，请先在「分季分集」规划'}</div>`}
    </div>`

  // 本季批量：分批循环调用直到 remaining=0（可中断/续跑），实时显示进度
  const runBulk = async (btn, task) => {
    const info = body.querySelector('#nvBulkInfo')
    const old = btn.textContent
    ;[...body.querySelectorAll('button,input,select')].forEach((x) => { x.disabled = true })
    btn.textContent = '批量中…'
    try {
      let guard = 0
      for (;;) {
        const r = unwrap(await api.bulkGenerateSeason(id, seasonId, { task, onlyMissing: true, limit: 8, concurrency: 4 }))
        if (info) info.textContent = `${task === 'assets' ? '资产' : '剧本'} ${r.done}/${r.total}（本轮 ${r.ok} 成功 / ${r.failed} 失败）`
        if (r.remaining <= 0 || r.processed === 0 || ++guard > 400) break
      }
      showToast(`本季批量${task === 'assets' ? '资产' : '剧本'}完成`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.textContent = old
      if (info) info.textContent = ''
      refresh()
    }
  }
  body.querySelector('#nvBulkScript')?.addEventListener('click', () => runBulk(body.querySelector('#nvBulkScript'), 'script'))
  body.querySelector('#nvBulkAssets')?.addEventListener('click', () => runBulk(body.querySelector('#nvBulkAssets'), 'assets'))

  // 生成本季「涉及的」设定图（只在本季子集内出图）
  body.querySelector('#nvSeasonAssetGen')?.addEventListener('click', async () => {
    const btn = body.querySelector('#nvSeasonAssetGen')
    const info = body.querySelector('#nvSeasonAssetInfo')
    const old = btn.textContent
    ;[...body.querySelectorAll('button,input,select')].forEach((x) => { x.disabled = true })
    btn.textContent = '出图中…'
    try {
      let guard = 0
      for (;;) {
        const r = unwrap(await api.bulkGenerateSeasonAssets(id, seasonId, { limit: 3, concurrency: 2 }))
        if (info) info.textContent = `本季 ${r.withImages}/${r.subsetCount}（本轮 ${r.ok} 成功 / ${r.failed} 失败）`
        if (r.remaining <= 0 || r.processed === 0 || ++guard > 200) break
      }
      showToast('本季涉及的设定图已生成', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.textContent = old
      refresh()
    }
  })

  body.querySelector('#nvSeason')?.addEventListener('change', (ev) => {
    state.seasonId = ev.target.value
    state.shotEpisodeId = null
    state.epPage = 1
    state.epQuery = ''
    refresh()
  })
  body.querySelector('#nvEpSearchBtn')?.addEventListener('click', () => {
    state.epQuery = body.querySelector('#nvEpSearch')?.value || ''
    state.epPage = 1
    refresh()
  })
  body.querySelector('#nvEpSearch')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      state.epQuery = ev.target.value || ''
      state.epPage = 1
      refresh()
    }
  })
  body.querySelector('#nvEpClear')?.addEventListener('click', () => {
    state.epQuery = ''
    state.epPage = 1
    refresh()
  })
  body.querySelector('#nvEpPrev')?.addEventListener('click', () => { state.epPage = Math.max(1, (state.epPage || 1) - 1); refresh() })
  body.querySelector('#nvEpNext')?.addEventListener('click', () => { state.epPage = (state.epPage || 1) + 1; refresh() })

  body.querySelectorAll('[data-script]').forEach((b) => b.addEventListener('click', () => {
    runEpAction(b, '生成中…', () => api.generateEpisodeScript(id, b.dataset.script, {}).then(unwrap), (r) => `剧本已生成（${((r && r.shots) || []).length} 分镜）`)
  }))
  body.querySelectorAll('[data-shots]').forEach((b) => b.addEventListener('click', () => {
    const eid = b.dataset.shots
    if (state.shotEpisodeId === eid) {
      state.shotEpisodeId = null
    } else {
      state.shotEpisodeId = eid
      state.shotAddFor = null
      // 让被打开的集停留在当前可见页，避免“点了分镜但看不到是哪一集”
      const idx = filtered.findIndex((e) => e.id === eid)
      if (idx >= 0) state.epPage = Math.floor(idx / PAGE_SIZE) + 1
    }
    refresh()
  }))

  // 打开分镜详情后，滚动到面板顶部，明确当前集
  if (state.shotEpisodeId) {
    requestAnimationFrame(() => {
      const p = body.querySelector('#nvShotPanel')
      if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  body.querySelectorAll('[data-assets]').forEach((b) => b.addEventListener('click', () => {
    runEpAction(b, '生成中…', async () => {
      const r = unwrap(await api.generateEpisodeAssets(id, b.dataset.assets, {}))
      const v = (r && r.assets && r.assets.video) || {}
      if (v.error) throw new Error('资产部分完成，但视频生成失败：' + String(v.error).slice(0, 120))
      return r
    }, '资产已生成')
  }))
  body.querySelectorAll('[data-compose]').forEach((b) => b.addEventListener('click', () => {
    runEpAction(b, '合成中…', () => api.composeEpisode(id, b.dataset.compose, {}).then(unwrap), (r) => `成片完成（${(r && r.fileName) || ''}）`)
  }))
  body.querySelectorAll('[data-handoff]').forEach((b) => b.addEventListener('click', () => {
    runEpAction(b, '导出中…', () => api.exportEpisodeHandoff(id, b.dataset.handoff).then(unwrap), (r) => '交接包已导出：' + ((r && r.dir) || ''))
  }))

  if (state.shotEpisodeId) {
    const eid = state.shotEpisodeId
    loadMedia(body) // 分镜参考图缩略图 / 回传视频预览（带 token 载入）
    body.querySelector('#nvShotClose')?.addEventListener('click', () => { state.shotEpisodeId = null; state.shotAddFor = null; refresh() })
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
    // 本集角色形象：生成/刷新
    body.querySelector('#nvEpStateGen')?.addEventListener('click', async () => {
      const btn = body.querySelector('#nvEpStateGen')
      const old = btn.textContent
      btn.disabled = true
      btn.textContent = '生成中…'
      try {
        const r = unwrap(await api.generateEpisodeStates(id, eid, {}))
        showToast(`本集角色形象已生成（${r.count} 个）`, 'success')
        refresh()
      } catch (err) {
        showToast(err.message, 'error')
      } finally {
        btn.disabled = false
        btn.textContent = old
      }
    })
    // 本集角色形象：保存
    body.querySelectorAll('[data-state-save]').forEach((b) => b.addEventListener('click', async () => {
      const row = b.closest('[data-state-cid]')
      if (!row) return
      const cid = row.dataset.stateCid
      const episodeNo = Number(row.dataset.stateEp)
      const patch = {}
      row.querySelectorAll('[data-sf]').forEach((inp) => { patch[inp.dataset.sf] = inp.value.trim() })
      b.disabled = true
      try {
        await api.upsertCharacterState(id, cid, episodeNo, patch)
        showToast(`「${row.dataset.stateName}」第 ${episodeNo} 集形象已保存`, 'success')
      } catch (err) {
        showToast(err.message, 'error')
      } finally {
        b.disabled = false
      }
    }))
    // 打开“为该分镜添加参考图”的选择器
    body.querySelectorAll('[data-refadd]').forEach((b) => b.addEventListener('click', () => {
      const idx = Number(b.dataset.refadd)
      state.shotAddFor = state.shotAddFor === idx ? null : idx
      refresh()
    }))
    // 移除某张参考图
    body.querySelectorAll('[data-refdel]').forEach((b) => b.addEventListener('click', async () => {
      const idx = Number(b.dataset.refdel)
      const url = b.dataset.refurl
      const shot = (window.__nvShotRefs || {})[idx] || []
      const urls = shot.filter((u) => u !== url)
      try { await api.setEpisodeShotRefs(id, eid, idx, urls); showToast(`已移除分镜 #${idx} 的 1 张参考图`, 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
    }))
    body.querySelector('#nvRefClose')?.addEventListener('click', () => { state.shotAddFor = null; refresh() })
    // 参考图选择器：按搜索/类别过滤 + 点击切换（按需渲染，避免上百张全量 DOM）
    const grid = body.querySelector('#nvRefGrid')
    if (grid) {
      const all = window.__nvAssets || []
      const refs = new Set(window.__nvActiveRefs || [])
      const idx = state.shotAddFor
      const renderGrid = () => {
        const kw = (body.querySelector('#nvRefSearch')?.value || '').trim()
        const cat = body.querySelector('#nvRefCat')?.value || ''
        const list = all.filter((a) => (!cat || a.category === cat) && (!kw || (a.name || '').includes(kw) || (a.category || '').includes(kw))).slice(0, 120)
        grid.innerHTML = list.length
          ? list.map((a) => `<label style="cursor:pointer;text-align:center;font-size:10px;border:2px solid ${refs.has(a.imageUrl) ? '#7c3aed' : 'transparent'};border-radius:6px;padding:2px;">
              <img data-media="${esc(a.imageUrl)}" style="width:100%;height:64px;object-fit:cover;border-radius:4px;display:block;" title="${esc(a.name)}" />
              <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.name)}</span>
              <input type="checkbox" data-reftoggle="${esc(a.imageUrl)}" ${refs.has(a.imageUrl) ? 'checked' : ''} style="margin-top:2px;" />
            </label>`).join('')
          : '<div style="font-size:12px;color:var(--text-secondary);">无匹配资产</div>'
        loadMedia(grid)
        grid.querySelectorAll('input[data-reftoggle]').forEach((cb) => cb.addEventListener('change', async () => {
          if (cb.checked) refs.add(cb.dataset.reftoggle)
          else refs.delete(cb.dataset.reftoggle)
          try { await api.setEpisodeShotRefs(id, eid, idx, [...refs]) } catch (err) { showToast(err.message, 'error') }
          renderGrid()
        }))
      }
      body.querySelector('#nvRefSearch')?.addEventListener('input', renderGrid)
      body.querySelector('#nvRefCat')?.addEventListener('change', renderGrid)
      renderGrid()
    }
  }
}

// ---------- 风格 / 同步 ----------
async function tabSync({ body, novel, id, refresh }) {
  stopQuarkQrPoll()
  const scopes = await api.getNovelSyncScopes(id).then(unwrap).catch(() => [])
  const scopeKey = 'deliverables'
  const manifest = await api.getNovelManifest(id, scopeKey).then(unwrap).catch(() => ({ files: [] }))
  const ledger = await api.getNovelSyncLedger(id).then(unwrap).catch(() => null)
  const drive = await api.getCloudDriveStatus(false).then(unwrap).catch(() => null)
  const voices = await api.listNovelVoices(id).then(unwrap).catch(() => null)
  const voiceOpts = (cur) => {
    const cat = (voices && voices.catalog) || []
    const cus = (voices && voices.custom) || []
    const opts = cat.map((v) => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}（${esc(v.gender)}）</option>`).join('')
    const customOpts = cus.map((v) => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}（${v.type === 'design' ? '设计' : '复刻'}）</option>`).join('')
    const known = [...cat, ...cus].some((v) => v.id === cur)
    return `<option value="">（默认）</option>${opts}${customOpts ? `<optgroup label="自建音色">${customOpts}</optgroup>` : ''}${cur && !known ? `<option value="${esc(cur)}" selected>自定义：${esc(cur)}</option>` : ''}<option value="__custom__">自定义 ID…</option>`
  }
  body.innerHTML = `
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <h3 style="margin-top:0;">全书风格（贯穿：设定图集 → 剧本 → 分镜/资产）</h3>
      ${novel.style && novel.style.name
        ? `<table style="font-size:13px;border-collapse:collapse;margin-bottom:8px;">
             <tr><td style="color:#7c3aed;padding:2px 10px 2px 0;">风格名</td><td>${esc(novel.style.name)}</td></tr>
             <tr><td style="color:#7c3aed;padding:2px 10px 2px 0;">画面/色调</td><td>${esc(novel.style.visual || '')}</td></tr>
             <tr><td style="color:#7c3aed;padding:2px 10px 2px 0;">叙事基调</td><td>${esc(novel.style.narration || '')}</td></tr>
             <tr><td style="color:#7c3aed;padding:2px 10px 2px 0;">配乐情绪</td><td>${esc(novel.style.music || '')}</td></tr>
             <tr><td style="color:#7c3aed;padding:2px 10px 2px 0;">来源</td><td>${esc(novel.style.provider || '')}${novel.style.scope ? ' · ' + esc(novel.style.scope) : ''}</td></tr>
           </table>`
        : '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">（未生成）— 生成一次即可，后续设定图集/剧本/分镜会自动沿用，保证风格一致</div>'}
      <button id="nvStyle" class="btn btn-sm">${novel.style && novel.style.name ? '重新生成风格（LLM）' : '生成风格（LLM）'}</button>
    </section>
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">角色音色（固定，跨全集一致）</h3>
        <div style="display:flex;gap:6px;">
          <button id="nvVoiceNew" class="btn btn-sm btn-primary">新建音色</button>
          <button id="nvVoiceReset" class="btn btn-sm">重置为自动分配</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">每个角色固定一把声音；旁白单独一轨。可选内置音色 / 自建音色，或选「自定义 ID」填任意音色 ID（含声音复刻的 <code>S_xxx</code>）。</div>
      <div id="nvVoiceBuilder" style="display:none;margin-top:10px;border:1px dashed #7c3aed;border-radius:8px;padding:12px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="nvVBMode" class="form-input" style="width:auto;padding:4px;">
            <option value="clone">声音复刻（上传音频样本）</option>
            <option value="design">音色设计（文本描述）</option>
          </select>
          <input id="nvVBName" class="form-input" style="padding:4px;max-width:180px;" placeholder="音色名称（如：血瞳-少年）" />
          <input id="nvVBGender" class="form-input" style="padding:4px;width:90px;" placeholder="性别(男/女)" />
          <select id="nvVBAssign" class="form-input" style="width:auto;padding:4px;">
            <option value="">生成后不指派</option>
            <option value="旁白">指派给：旁白</option>
            ${((voices && voices.characters) || []).map((c) => `<option value="${esc(c.name)}">指派给：${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div id="nvVBCloneBox" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="nvVBAudio" type="file" accept="audio/*" />
          <input id="nvVBText" class="form-input" style="padding:4px;flex:1;min-width:220px;" placeholder="参考文本（选填；与音频一致可提升成功率）" />
        </div>
        <div id="nvVBDesignBox" style="margin-top:8px;display:none;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="nvVBSpeaker" class="form-input" style="padding:4px;max-width:220px;" placeholder="已购买的 speaker_id（控制台购买）" />
          <input id="nvVBPrompt" class="form-input" style="padding:4px;flex:1;min-width:240px;" placeholder="音色描述（如：女性，语速中等偏快，语调低沉有力）" />
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
          <button id="nvVBSubmit" class="btn btn-sm btn-primary">生成并保存</button>
          <button id="nvVBCancel" class="btn btn-sm">取消</button>
          <span id="nvVBMsg" style="font-size:12px;color:var(--text-secondary);"></span>
        </div>
        <div style="font-size:11px;color:#d97706;margin-top:6px;">计费提醒：声音复刻首次合成、音色设计槽位均可能产生费用；复刻后 7 天未合成会自动清理。</div>
      </div>
      ${voices
        ? `<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
             <b style="font-size:13px;">旁白</b>
             <select class="form-input" style="padding:4px;max-width:280px;" data-voice-spk="旁白">${voiceOpts(voices.narrator)}</select>
             <button class="btn btn-sm" data-voice-preview="旁白">试听</button>
           </div>
           <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:8px;max-height:360px;overflow:auto;">
             ${(voices.characters || []).map((c) => `<div style="display:flex;gap:8px;align-items:center;">
               <span style="font-size:13px;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(c.name)}">${esc(c.name)}${c.gender ? `<span style="color:var(--text-secondary);font-size:11px;">·${esc(c.gender)}</span>` : ''}</span>
               <select class="form-input" style="padding:4px;flex:1;" data-voice-spk="${esc(c.name)}">${voiceOpts(c.voice)}</select>
               <button class="btn btn-sm" data-voice-preview="${esc(c.name)}">试听</button>
             </div>`).join('') || '<div style="color:var(--text-secondary);">暂无角色</div>'}
           </div>
           ${(voices.custom || []).length ? `<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">自建音色：${voices.custom.map((v) => `${esc(v.name)}（${v.type === 'design' ? '设计' : '复刻'}）`).join('、')}</div>` : ''}
           <div id="nvVoicePreview" style="margin-top:8px;"></div>`
        : '<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">（角色音色不可用）</div>'}
    </section>
    <section class="card" style="padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">网盘登录（夸克）</h3>
        <span id="nvQuarkState" style="font-size:12px;color:var(--text-secondary);">${drive && drive.configured ? (drive.source === 'env' ? '已配置（环境变量 QUARK_COOKIE）' : '已登录（扫码保存）') : '未登录'}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">扫码用夸克 App 授权；cookie 只保存在服务端（<code>storage/.quark-cookie</code>），不返回给浏览器。二维码本地生成，不经过第三方服务。</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">
        <button id="nvQuarkLogin" class="btn btn-sm">扫码登录</button>
        <button id="nvQuarkCheck" class="btn btn-sm">校验登录态</button>
        <button id="nvQuarkLogout" class="btn btn-sm" ${drive && drive.source === 'file' ? '' : 'disabled'}>退出登录</button>
        <span id="nvQuarkLoginMsg" style="font-size:12px;color:var(--text-secondary);"></span>
      </div>
      <div id="nvQuarkQrBox" style="display:none;margin-top:12px;text-align:center;"></div>
    </section>
    <section class="card" style="padding:16px;">
      <h3 style="margin-top:0;">剧集包 / 同步</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--text-secondary);">同步范围</span>
        <select id="nvSyncScope" class="form-input" style="width:auto;padding:4px;">
          ${(scopes.length ? scopes : [{ key: 'deliverables', label: '产物 + 文档' }, { key: 'media', label: '仅产物' }, { key: 'all', label: '全部' }])
            .map((s) => `<option value="${esc(s.key)}" ${s.key === scopeKey ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
        <span id="nvSyncCount" style="font-size:12px;color:var(--text-secondary);">${esc((manifest.files || []).length)} 个文件（增量同步：仅传输新增/改动文件）</span>
      </div>
      ${ledger && ledger.last
        ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">上次同步：${esc(ledger.last.backend)} → ${esc(ledger.last.targetDir || ledger.last.url || '')}${ledger.last.remoteDir ? ' / ' + esc(ledger.last.remoteDir) : ''} · ${esc(new Date(ledger.last.at).toLocaleString())} · 上传 ${esc(String(ledger.last.uploaded ?? ledger.last.copied ?? 0))} · 跳过 ${esc(String(ledger.last.skipped ?? 0))}${ledger.last.failed ? ` · 失败 ${esc(String(ledger.last.failed))}` : ''}</div>`
        : '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">尚无同步记录</div>'}
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;">本地目录</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <input id="nvSyncDir" class="form-input" style="flex:1;min-width:240px;" placeholder="本地同步目标目录（如 /Users/link/out）" />
        <button id="nvSyncLocalPlan" class="btn btn-sm">预览变更</button>
        <button id="nvSyncLocal" class="btn btn-sm">同步到本地</button>
      </div>
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;">网盘（WebDAV / NAS）</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="nvSyncRemote" class="form-input" style="flex:1;min-width:200px;" placeholder="远端子目录（默认用作品 id：${esc(id)}）" />
        <select id="nvSyncConflict" class="form-input" style="width:auto;">
          <option value="overwrite">覆盖同名</option>
          <option value="skip">跳过已存在</option>
        </select>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);" title="忽略本地增量记录，强制重新上传清单内所有文件">
          <input type="checkbox" id="nvSyncForce" /> 完整重传
        </label>
        <button id="nvSyncWebdavPlan" class="btn btn-sm">预览变更</button>
        <button id="nvSyncWebdav" class="btn btn-sm">同步到 WebDAV</button>
        <button id="nvSyncQuarkPlan" class="btn btn-sm">夸克预览</button>
        <button id="nvSyncQuark" class="btn btn-sm">同步到夸克</button>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">WebDAV 连接在 <code>.env</code> 配置（<code>WEBDAV_URL/USERNAME/PASSWORD</code>）；夸克需配置 <code>QUARK_COOKIE</code>（未配置时同步会如实报错，预览始终可用）。同步完成后会核对远端文件数，缺失会明确提示。</div>
      <pre id="nvSyncReport" style="display:none;margin-top:10px;font-size:11px;max-height:240px;overflow:auto;background:var(--bg-secondary,#f5f5f5);padding:8px;border-radius:6px;"></pre>
    </section>`

  body.querySelector('#nvSyncScope')?.addEventListener('change', async (e) => {
    try {
      const m = unwrap(await api.getNovelManifest(id, e.target.value))
      body.querySelector('#nvSyncCount').textContent = `${(m.files || []).length} 个文件（增量同步：仅传输新增/改动文件）`
    } catch (err) { showToast(err.message, 'error') }
  })

  const showReport = (data) => {
    const el = body.querySelector('#nvSyncReport')
    if (!el) return
    el.style.display = 'block'
    el.textContent = JSON.stringify(data, null, 2)
  }

  // ---- 网盘登录（夸克扫码）----
  const qrBox = body.querySelector('#nvQuarkQrBox')
  const loginMsg = body.querySelector('#nvQuarkLoginMsg')
  const setMsg = (t) => { if (loginMsg) loginMsg.textContent = t || '' }

  body.querySelector('#nvQuarkCheck')?.addEventListener('click', async () => {
    const btn = body.querySelector('#nvQuarkCheck')
    btn.disabled = true
    setMsg('校验中…')
    try {
      const r = unwrap(await api.getCloudDriveStatus(true))
      setMsg(r.verified ? '✅ 登录态有效' : `❌ ${r.error || '登录态无效'}`)
    } catch (err) { setMsg(`❌ ${err.message}`) } finally { btn.disabled = false }
  })

  body.querySelector('#nvQuarkLogout')?.addEventListener('click', async () => {
    try {
      unwrap(await api.logoutCloudDrive())
      showToast('已退出夸克登录', 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') }
  })

  body.querySelector('#nvQuarkLogin')?.addEventListener('click', async () => {
    stopQuarkQrPoll()
    setMsg('正在生成二维码…')
    let session
    try {
      session = unwrap(await api.createQuarkQr())
    } catch (err) {
      setMsg(`❌ ${err.message}`)
      return
    }
    // 服务端生成的 SVG（由布尔矩阵渲染，不含任何用户输入），直接内联展示
    qrBox.style.display = 'block'
    qrBox.innerHTML = `<div style="display:inline-block;background:#fff;padding:8px;border-radius:8px;">${session.svg}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">请用「夸克 App」扫描二维码（约 ${esc(String(session.expiresInSec / 60))} 分钟有效）</div>`
    setMsg('等待扫码…')

    QUARK_QR_TIMER = setInterval(async () => {
      try {
        const r = unwrap(await api.getQuarkQrStatus(session.token))
        if (r.state === 'success') {
          stopQuarkQrPoll()
          setMsg('✅ 登录成功')
          showToast('夸克登录成功', 'success')
          refresh()
        } else if (r.state === 'failed') {
          stopQuarkQrPoll()
          setMsg(`❌ ${r.message || '二维码已失效'}`)
          qrBox.style.display = 'none'
        }
      } catch (err) {
        stopQuarkQrPoll()
        setMsg(`❌ ${err.message}`)
        qrBox.style.display = 'none'
      }
    }, 2000)
  })

  body.querySelector('#nvStyle')?.addEventListener('click', async () => {
    try { await api.generateNovelStyle(id); showToast('风格已生成', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelectorAll('[data-voice-spk]').forEach((sel) => sel.addEventListener('change', async () => {
    let v = sel.value
    if (v === '__custom__') {
      const input = prompt('输入自定义音色 ID（如声音复刻的 S_xxx / ICL_...）', '')
      if (input === null) { refresh(); return }
      v = input.trim()
    }
    try { await api.setNovelVoice(id, { speaker: sel.dataset.voiceSpk, voice: v }); showToast(`「${sel.dataset.voiceSpk}」音色已保存`, 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  }))
  body.querySelector('#nvVoiceReset')?.addEventListener('click', async () => {
    try { await api.resetNovelVoices(id); showToast('已重置为自动分配', 'success'); refresh() } catch (err) { showToast(err.message, 'error') }
  })

  // 试听：对当前选中音色合成一小段
  body.querySelectorAll('[data-voice-preview]').forEach((b) => b.addEventListener('click', async () => {
    const spk = b.dataset.voicePreview
    const sel = body.querySelector(`[data-voice-spk="${CSS.escape(spk)}"]`)
    const voice = sel && sel.value && sel.value !== '__custom__' ? sel.value : ''
    b.disabled = true
    const old = b.textContent
    b.textContent = '合成中…'
    try {
      const r = unwrap(await api.previewNovelVoice(id, { voice }))
      const box = body.querySelector('#nvVoicePreview')
      if (box) box.innerHTML = `<audio controls autoplay src="${esc(r.audioUrl)}" style="height:32px;"></audio> <span style="font-size:12px;color:var(--text-secondary);">${esc(spk)} 试听（${esc(String(r.duration || ''))}s）</span>`
    } catch (err) {
      showToast(`试听失败：${err.message}`, 'error')
    } finally {
      b.disabled = false
      b.textContent = old
    }
  }))

  // 新建音色
  const vb = body.querySelector('#nvVoiceBuilder')
  body.querySelector('#nvVoiceNew')?.addEventListener('click', () => {
    if (vb) vb.style.display = vb.style.display === 'none' ? 'block' : 'none'
  })
  body.querySelector('#nvVBCancel')?.addEventListener('click', () => { if (vb) vb.style.display = 'none' })
  body.querySelector('#nvVBMode')?.addEventListener('change', (e) => {
    const clone = e.target.value === 'clone'
    const cb = body.querySelector('#nvVBCloneBox')
    const db = body.querySelector('#nvVBDesignBox')
    if (cb) cb.style.display = clone ? 'flex' : 'none'
    if (db) db.style.display = clone ? 'none' : 'flex'
  })
  const readAudioBase64 = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('读取音频失败'))
    fr.onload = () => {
      const m = String(fr.result || '').match(/^data:([^;]+);base64,(.*)$/)
      if (!m) return reject(new Error('音频格式无法识别'))
      const fmtFromMime = (m[1].split('/')[1] || '').replace('mpeg', 'mp3').replace('x-wav', 'wav')
      resolve({ base64: m[2], format: fmtFromMime })
    }
    fr.readAsDataURL(file)
  })
  body.querySelector('#nvVBSubmit')?.addEventListener('click', async () => {
    const btn = body.querySelector('#nvVBSubmit')
    const msg = body.querySelector('#nvVBMsg')
    const setMsg = (t) => { if (msg) msg.textContent = t || '' }
    const mode = body.querySelector('#nvVBMode')?.value
    const name = (body.querySelector('#nvVBName')?.value || '').trim()
    const gender = (body.querySelector('#nvVBGender')?.value || '').trim()
    const assignTo = body.querySelector('#nvVBAssign')?.value || undefined
    if (!name) return setMsg('请填音色名称')
    btn.disabled = true
    try {
      let r
      if (mode === 'clone') {
        const file = body.querySelector('#nvVBAudio')?.files?.[0]
        if (!file) { btn.disabled = false; return setMsg('请选择音频样本') }
        setMsg('上传复刻中…')
        const { base64, format } = await readAudioBase64(file)
        r = unwrap(await api.cloneNovelVoice(id, {
          name, gender, audioBase64: base64, format,
          text: (body.querySelector('#nvVBText')?.value || '').trim(),
          assignTo,
        }))
      } else {
        const speakerId = (body.querySelector('#nvVBSpeaker')?.value || '').trim()
        const textPrompt = (body.querySelector('#nvVBPrompt')?.value || '').trim()
        if (!speakerId) { btn.disabled = false; return setMsg('音色设计需填已购买的 speaker_id') }
        setMsg('设计中…')
        r = unwrap(await api.designNovelVoice(id, { name, gender, speakerId, textPrompt, assignTo }))
      }
      showToast(`音色「${name}」已生成`, 'success')
      refresh()
      return r
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    } finally {
      btn.disabled = false
    }
  })
  body.querySelector('#nvSyncLocalPlan')?.addEventListener('click', async () => {
    const targetDir = body.querySelector('#nvSyncDir')?.value?.trim()
    if (!targetDir) return showToast('请填目标目录', 'error')
    const scope = body.querySelector('#nvSyncScope')?.value
    try { const r = unwrap(await api.syncNovel(id, { backend: 'local', dryRun: true, targetDir, scope })); showReport(r); showToast(`待传输 ${r.changed}/${r.fileCount} 个文件`, 'success') } catch (err) { showToast(err.message, 'error') }
  })
  const forceFlag = () => body.querySelector('#nvSyncForce')?.checked || false
  const remoteWarn = (r) => (r && r.remoteCheck && r.remoteCheck.ok === false ? `；⚠ 远端校验缺 ${r.remoteCheck.missing?.length ?? '?'} 个` : '')
  body.querySelector('#nvSyncLocal')?.addEventListener('click', async () => {
    const targetDir = body.querySelector('#nvSyncDir')?.value?.trim()
    if (!targetDir) return showToast('请填目标目录', 'error')
    const btn = body.querySelector('#nvSyncLocal')
    btn.disabled = true
    try {
      const scope = body.querySelector('#nvSyncScope')?.value
      const r = unwrap(await api.syncNovel(id, { backend: 'local', targetDir, scope, force: forceFlag() }))
      showReport(r)
      showToast(`已复制 ${r.copied} 个 / 跳过 ${r.skipped} 个${r.failed?.length ? ` / 失败 ${r.failed.length}` : ''}`, r.failed?.length ? 'error' : 'success')
      refresh()
    } catch (err) { showToast(err.message, 'error') } finally { btn.disabled = false }
  })
  body.querySelector('#nvSyncWebdavPlan')?.addEventListener('click', async () => {
    const remoteDir = body.querySelector('#nvSyncRemote')?.value?.trim() || undefined
    const scope = body.querySelector('#nvSyncScope')?.value
    try { const r = unwrap(await api.syncNovel(id, { backend: 'webdav', dryRun: true, remoteDir, scope })); showReport(r); showToast(`待上传 ${r.changed}/${r.fileCount} 个文件`, 'success') } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelector('#nvSyncWebdav')?.addEventListener('click', async () => {
    const remoteDir = body.querySelector('#nvSyncRemote')?.value?.trim() || undefined
    const onConflict = body.querySelector('#nvSyncConflict')?.value || 'overwrite'
    const btn = body.querySelector('#nvSyncWebdav')
    btn.disabled = true
    showToast('正在同步到 WebDAV…')
    try {
      const scope = body.querySelector('#nvSyncScope')?.value
      const r = unwrap(await api.syncNovel(id, { backend: 'webdav', remoteDir, onConflict, scope, force: forceFlag() }))
      showReport(r)
      const ok = !r.failed?.length && !(r.remoteCheck && r.remoteCheck.ok === false)
      showToast(`上传 ${r.uploaded} 个 / 跳过 ${r.skipped} 个${r.failed?.length ? ` / 失败 ${r.failed.length}` : ''}${remoteWarn(r)}`, ok ? 'success' : 'error')
      refresh()
    } catch (err) { showToast(err.message, 'error') } finally { btn.disabled = false }
  })
  body.querySelector('#nvSyncQuarkPlan')?.addEventListener('click', async () => {
    const remoteDir = body.querySelector('#nvSyncRemote')?.value?.trim() || undefined
    const scope = body.querySelector('#nvSyncScope')?.value
    try { const r = unwrap(await api.syncNovel(id, { backend: 'quark', dryRun: true, remoteDir, scope })); showReport(r); showToast(`夸克待上传 ${r.changed}/${r.fileCount} 个文件`, 'success') } catch (err) { showToast(err.message, 'error') }
  })
  body.querySelector('#nvSyncQuark')?.addEventListener('click', async () => {
    const remoteDir = body.querySelector('#nvSyncRemote')?.value?.trim() || undefined
    const onConflict = body.querySelector('#nvSyncConflict')?.value || 'overwrite'
    const btn = body.querySelector('#nvSyncQuark')
    btn.disabled = true
    showToast('正在同步到夸克网盘…')
    try {
      const scope = body.querySelector('#nvSyncScope')?.value
      const r = unwrap(await api.syncNovel(id, { backend: 'quark', remoteDir, onConflict, scope, force: forceFlag() }))
      showReport(r)
      const ok = !r.failed?.length && !(r.remoteCheck && r.remoteCheck.ok === false)
      showToast(`上传 ${r.uploaded} 个 / 跳过 ${r.skipped} 个${r.failed?.length ? ` / 失败 ${r.failed.length}` : ''}${remoteWarn(r)}`, ok ? 'success' : 'error')
      refresh()
    } catch (err) { showToast(err.message, 'error') } finally { btn.disabled = false }
  })
}
