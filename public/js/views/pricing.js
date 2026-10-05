import { api } from '../api.js'
import { showToast } from '../app.js'
import { isLoggedIn, getCurrentUser } from './auth.js'
import { i18n } from '../i18n.js'

/**
 * 订阅计划页面
 */
export async function renderPricingPage(container) {
  container.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>${i18n.t('loading')}</span>
    </div>
  `

  try {
    const [plansData, currentSub] = await Promise.all([
      api.getPlans(),
      isLoggedIn() ? api.getCurrentSubscription().catch(() => null) : Promise.resolve(null),
    ])

    const plans = plansData.plans || []
    const currentPlanId = currentSub?.plan?.id || 'free'

    container.innerHTML = `
      <div class="pricing-page">
        <div class="pricing-header">
          <h1 class="pricing-title">${i18n.t('pricing')}</h1>
          <p class="pricing-subtitle">${i18n.t('upgradeForMore')}</p>
          ${
            currentSub
              ? `<div class="current-plan-badge">${i18n.t('currentPlan')}：${currentSub.plan.name}</div>`
              : '<div class="current-plan-badge">Free</div>'
          }
        </div>

        <div class="pricing-toggle">
          <button class="billing-toggle active" data-cycle="monthly">${i18n.t('monthly')}</button>
          <button class="billing-toggle" data-cycle="yearly">${i18n.t('yearly')}</button>
        </div>

        <div class="pricing-grid">
          ${plans.map((plan) => renderPlanCard(plan, currentPlanId)).join('')}
        </div>
      </div>
    `

    // 绑定事件
    bindPricingEvents(container, currentPlanId)
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${err.message}</div>
      </div>
    `
  }
}

function renderPlanCard(plan, currentPlanId) {
  const isCurrent = plan.id === currentPlanId
  const isPopular = plan.id === 'pro'

  return `
    <div class="pricing-card ${isPopular ? 'popular' : ''} ${isCurrent ? 'current' : ''}">
      ${isPopular ? '<div class="popular-badge">最受欢迎</div>' : ''}
      ${isCurrent ? '<div class="current-badge">当前计划</div>' : ''}
      <div class="plan-name">${plan.name}</div>
      <div class="plan-price">
        <span class="price-currency">¥</span>
        <span class="price-amount" data-monthly="${plan.priceMonthly}" data-yearly="${plan.priceYearly}">${plan.priceMonthly}</span>
        <span class="price-period">/月</span>
      </div>
      <div class="plan-yearly-note" style="display: none;">年付 ¥${plan.priceYearly}/年</div>

      <ul class="plan-features">
        <li><strong>${plan.features.videoGenerationsPerDay}</strong> 次/天视频生成</li>
        <li>单镜最长 <strong>${plan.features.maxDurationSeconds}</strong> 秒</li>
        <li>最高 <strong>${plan.features.maxResolution}</strong> 分辨率</li>
        <li>最多 <strong>${plan.features.maxCharacters === -1 ? '无限' : plan.features.maxCharacters}</strong> 个角色</li>
        <li><strong>${plan.features.dubbingMinutesPerMonth}</strong> 分钟/月配音</li>
        <li>最多 <strong>${plan.features.maxProjects === -1 ? '无限' : plan.features.maxProjects}</strong> 个项目</li>
        <li>${plan.features.exportWatermark ? '❌ 导出带水印' : '✅ 无水印导出'}</li>
        <li>${plan.features.priorityQueue ? '✅ 优先生成队列' : '❌ 标准队列'}</li>
        <li>${plan.features.collaboration ? '✅ 多人协作' : '❌ 单人使用'}</li>
      </ul>

      <button class="btn ${isCurrent ? '' : 'btn-primary'} btn-block plan-subscribe-btn"
              data-plan-id="${plan.id}"
              ${isCurrent ? 'disabled' : ''}>
        ${isCurrent ? '当前计划' : plan.id === 'free' ? '使用免费版' : '立即订阅'}
      </button>
    </div>
  `
}

function bindPricingEvents(container, currentPlanId) {
  // 计费周期切换
  const toggles = container.querySelectorAll('.billing-toggle')
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      toggles.forEach((t) => t.classList.remove('active'))
      toggle.classList.add('active')
      const cycle = toggle.dataset.cycle
      container.querySelectorAll('.price-amount').forEach((el) => {
        el.textContent = cycle === 'yearly' ? el.dataset.yearly : el.dataset.monthly
      })
      container.querySelectorAll('.plan-yearly-note').forEach((el) => {
        el.style.display = cycle === 'yearly' ? 'block' : 'none'
      })
    })
  })

  // 订阅按钮
  container.querySelectorAll('.plan-subscribe-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!isLoggedIn()) {
        showToast('请先登录后再订阅', 'error')
        window.location.hash = '#/login'
        return
      }

      const planId = btn.dataset.planId
      const cycle = container.querySelector('.billing-toggle.active').dataset.cycle

      if (planId === 'free') {
        // 降级到免费版
        try {
          await api.cancelSubscription()
          showToast('已切换到免费版')
          renderPricingPage(container)
        } catch (err) {
          showToast(err.message, 'error')
        }
        return
      }

      // 显示支付弹窗
      showPaymentModal(planId, cycle, () => renderPricingPage(container))
    })
  })
}

/**
 * 支付弹窗
 */
function showPaymentModal(planId, billingCycle, onSuccess) {
  const plans = {
    basic: { name: '基础版', monthly: 29, yearly: 290 },
    pro: { name: '专业版', monthly: 99, yearly: 990 },
    enterprise: { name: '企业版', monthly: 499, yearly: 4990 },
  }
  const plan = plans[planId]
  const amount = billingCycle === 'yearly' ? plan.yearly : plan.monthly

  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" style="max-width: 420px;">
      <div class="modal-title">确认订阅</div>
      <div style="margin-bottom: 20px;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${plan.name}（${billingCycle === 'yearly' ? '年付' : '月付'}）</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent);">¥${amount}</div>
      </div>

      <div class="form-group">
        <label class="form-label">卡号</label>
        <input type="text" class="form-input" id="payCardNumber" placeholder="4242 4242 4242 4242" maxlength="19" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">有效期</label>
          <input type="text" class="form-input" id="payExpiry" placeholder="MM/YY" maxlength="5" />
        </div>
        <div class="form-group">
          <label class="form-label">CVV</label>
          <input type="text" class="form-input" id="payCvv" placeholder="123" maxlength="4" />
        </div>
      </div>

      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 16px;">
        🔒 这是演示支付，不会产生真实扣费。实际部署时接入 Stripe。
      </div>

      <div class="modal-actions">
        <button class="btn" id="payCancelBtn">取消</button>
        <button class="btn btn-primary" id="payConfirmBtn">确认支付 ¥${amount}</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => e.target === modal && close())
  document.getElementById('payCancelBtn').addEventListener('click', close)

  document.getElementById('payConfirmBtn').addEventListener('click', async () => {
    const btn = document.getElementById('payConfirmBtn')
    btn.disabled = true
    btn.textContent = '处理中...'

    try {
      await api.subscribe({
        planId,
        billingCycle,
        paymentInfo: {
          cardNumber: document.getElementById('payCardNumber').value,
          expiry: document.getElementById('payExpiry').value,
          cvv: document.getElementById('payCvv').value,
          method: 'card',
        },
      })
      showToast(`订阅成功！已升级到${plan.name}`)
      close()
      onSuccess()
    } catch (err) {
      showToast(err.message, 'error')
      btn.disabled = false
      btn.textContent = `确认支付 ¥${amount}`
    }
  })
}
