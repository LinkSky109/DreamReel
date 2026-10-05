import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R14：素材商城
 */
export async function renderStorePage(container) {
  container.innerHTML = '<div class="loading"></div>'
  let tab = 'all'
  let view = 'store' // store / assets

  try {
    container.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2>🛒 素材商城</h2>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm" id="viewStore">素材市场</button>
            <button class="btn btn-sm" id="viewAssets">我的资产</button>
          </div>
        </div>
        <div id="storeBody"></div>
      </div>
    `
    document.getElementById('viewStore').addEventListener('click', () => { view = 'store'; render() })
    document.getElementById('viewAssets').addEventListener('click', () => { view = 'assets'; render() })

    async function render() {
      const body = container.querySelector('#storeBody')
      if (view === 'assets') {
        const assets = await api.myStoreAssets()
        body.innerHTML = `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            共 ${assets.total} 个素材包 · 累计价值 ¥${assets.totalValue}
          </div>
          ${assets.items.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">
            ${assets.items.map((i) => packCard(i.pack, true)).join('')}
          </div>` : '<div style="color:var(--text-secondary);padding:40px;text-align:center;">还没有购买素材包</div>'}
        `
        return
      }
      const data = await api.listStorePacks(tab === 'all' ? null : tab)
      const types = [
        { id: 'all', name: '全部' },
        { id: 'style_pack', name: '风格包' },
        { id: 'template_pack', name: '模板包' },
        { id: 'audio_pack', name: '音效包' },
      ]
      body.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap;">
          ${types.map((t) => `<button class="btn btn-sm store-type ${t.id === tab ? 'btn-primary' : ''}" data-type="${t.id}">${t.name}</button>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">
          ${data.items.map((p) => packCard(p, false)).join('')}
        </div>
      `
      body.querySelectorAll('.store-type').forEach((btn) => {
        btn.addEventListener('click', () => { tab = btn.dataset.type; render() })
      })
      body.querySelectorAll('.buy-pack').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            const r = await api.purchasePack(btn.dataset.id)
            showToast(r.price === 0 ? '领取成功' : '购买成功')
            render()
          } catch (e) { showToast(e.message, 'error') }
        })
      })
    }
    render()
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

function packCard(p, owned) {
  const free = p.price === 0
  return `
    <div class="card" style="overflow:hidden;">
      <div style="height:90px;display:flex;align-items:center;justify-content:center;font-size:40px;
        background:linear-gradient(135deg,#1e293b,#334155);">${p.icon}</div>
      <div style="padding:14px;">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${p.name}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;min-height:32px;">${p.description}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${p.items} 项内容 · ${p.author}</div>
        ${owned
          ? '<button class="btn btn-sm" style="width:100%;" disabled>✅ 已拥有</button>'
          : `<button class="btn btn-sm ${free ? '' : 'btn-primary'} buy-pack" data-id="${p.id}" style="width:100%;">
              ${free ? '免费领取' : `¥${p.price} 购买`}
            </button>`}
      </div>
    </div>
  `
}
