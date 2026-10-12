/**
 * 小说 → 剧集 页（#/novels 列表、#/novel/:id 详情/审核）
 * - 列表：创建小说项目、进入详情
 * - 详情：摄取（TXT 下载/粘贴文本）→ 抽取角色 → 角色表审核（修订/通过）→ 修订率
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str === null || str === undefined ? '' : String(str)
  return div.innerHTML
}

function unwrap(res) {
  return res && res.data !== undefined ? res.data : res
}

export async function renderNovelsPage(container, novelId) {
  if (novelId) return renderDetail(container, novelId)
  return renderList(container)
}

async function renderList(container) {
  container.innerHTML = '<div class="loading"></div>'
  let novels = []
  try {
    novels = unwrap(await api.listNovels()) || []
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${escapeHtml(err.message)}</div></div>`
    return
  }

  container.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;padding:24px;">
      <div class="page-header" style="margin-bottom:16px;">
        <h1 class="page-title" style="margin-bottom:6px;">📚 小说 → 剧集</h1>
        <p style="color:var(--text-secondary);font-size:13px;margin:0;">输入书名/链接 → 抽取角色 → 审核角色表（Sprint 19）</p>
      </div>
      <section class="card" style="padding:16px;margin-bottom:16px;">
        <form id="novelCreate" style="display:flex;gap:8px;flex-wrap:wrap;">
          <input class="form-input" name="title" placeholder="书名 *" style="flex:1;min-width:160px;" required />
          <input class="form-input" name="author" placeholder="作者" style="width:140px;" />
          <input class="form-input" name="url" placeholder="书籍链接（可选，如 https://www.qishuxia.com/book/34639/）" style="flex:1;min-width:260px;" />
          <button class="btn btn-primary" type="submit">创建</button>
        </form>
      </section>
      <div style="display:grid;gap:10px;">
        ${novels.length ? novels.map((n) => `
          <a href="#/novel/${escapeHtml(n.id)}" class="card" style="padding:14px;border:1px solid var(--border-color);display:block;">
            <div style="font-weight:600;">${escapeHtml(n.title)} <span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(n.author || '')}</span></div>
            <div style="font-size:12px;color:var(--text-secondary);">状态 ${escapeHtml(n.status)} · 章节 ${escapeHtml((n.counts && n.counts.chapters) || 0)} · 角色 ${escapeHtml((n.counts && n.counts.characters) || 0)}</div>
          </a>`).join('') : '<div style="color:var(--text-secondary);">还没有小说项目</div>'}
      </div>
    </div>
  `

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

async function renderDetail(container, novelId) {
  container.innerHTML = '<div class="loading"></div>'
  let novel
  let chars = []
  try {
    novel = unwrap(await api.getNovel(novelId))
    chars = unwrap(await api.listNovelCharacters(novelId)) || []
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${escapeHtml(err.message)}</div><button class="btn" onclick="location.hash='#/novels'">返回</button></div>`
    return
  }
  const stats = novel.reviewStats || { revisionRate: 0, approved: 0, characters: chars.length }

  container.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;">
      <a href="#/novels" style="font-size:13px;color:var(--text-secondary);">← 返回列表</a>
      <h1 class="page-title" style="margin:8px 0;">📖 ${escapeHtml(novel.title)}</h1>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
        作者 ${escapeHtml(novel.author || '-')} · 分类 ${escapeHtml(novel.category || '-')} · 状态 ${escapeHtml(novel.status)} ·
        章节 ${escapeHtml((novel.counts && novel.counts.chapters) || 0)} · 角色 ${escapeHtml(chars.length)} ·
        修订率 ${(stats.revisionRate * 100).toFixed(1)}% · 已通过 ${escapeHtml(stats.approved)}
      </div>

      <section class="card" style="padding:16px;margin-bottom:16px;display:grid;gap:10px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input id="novelUrl" class="form-input" style="flex:1;min-width:260px;" value="${escapeHtml(novel.sourceRef || '')}" placeholder="书籍链接（TXT 下载）" />
          <button id="btnIngest" class="btn">摄取（TXT/文本）</button>
          <button id="btnExtract" class="btn btn-primary">抽取角色</button>
        </div>
        <textarea id="novelText" class="form-input" rows="3" placeholder="或直接粘贴小说文本（前若干章）后点摄取"></textarea>
      </section>

      <section class="card" style="padding:16px;">
        <h3 style="margin-top:0;">角色表</h3>
        <div style="display:grid;gap:10px;">
          ${chars.length ? chars.map((c) => renderCharacterRow(novelId, c)).join('') : '<div style="color:var(--text-secondary);font-size:13px;">暂无角色，先摄取正文再抽取</div>'}
        </div>
      </section>
    </div>
  `

  container.querySelector('#btnIngest')?.addEventListener('click', async () => {
    const url = container.querySelector('#novelUrl')?.value?.trim()
    const text = container.querySelector('#novelText')?.value?.trim()
    try {
      await api.ingestNovel(novelId, url ? { sourceType: 'qishuxia-txt', url, maxChapters: 100 } : { sourceType: 'text', text })
      showToast('摄取完成', 'success')
      renderDetail(container, novelId)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  container.querySelector('#btnExtract')?.addEventListener('click', async () => {
    try {
      await api.extractNovelCharacters(novelId, { provider: 'heuristic', minFreq: 8 })
      showToast('抽取完成（启发式，低精度基线）', 'success')
      renderDetail(container, novelId)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  container.querySelectorAll('button[data-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.approveNovelCharacter(novelId, btn.dataset.approve)
        renderDetail(container, novelId)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  container.querySelectorAll('button[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.edit
      const key = window.prompt('要修改的字段（personality/appearance/voice/catchphrase/relations/abilities/growth）：', 'personality')
      if (!key) return
      const value = window.prompt(`新的 ${key}：`, '')
      if (value === null) return
      try {
        await api.patchNovelCharacter(novelId, cid, { card: { [key]: value } })
        showToast('已保存修订', 'success')
        renderDetail(container, novelId)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })
}

function renderCharacterRow(novelId, c) {
  const card = c.card || {}
  return `
    <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:600;">${escapeHtml(c.name)} ${(c.aliases || []).length ? `<span style="font-size:12px;color:var(--text-secondary);">别名 ${escapeHtml(c.aliases.join('/'))}</span>` : ''}</div>
          <div style="font-size:12px;color:var(--text-secondary);">provider ${escapeHtml(c.provider)} · ${escapeHtml(c.status)}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" data-edit="${escapeHtml(c.id)}">修订字段</button>
          <button class="btn btn-sm" data-approve="${escapeHtml(c.id)}">通过</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
        外形：${escapeHtml(card.appearance || '-')} ｜ 性格：${escapeHtml(card.personality || '-')} ｜ 声线：${escapeHtml(card.voice || '-')}
      </div>
    </div>
  `
}
