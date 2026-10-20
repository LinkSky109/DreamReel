import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, hasToken } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { SubscriptionPlan } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Pricing.css'

type PlanFeatures = {
  videoGenerationsPerDay?: number
  imageGenerationsPerDay?: number
  maxDurationSeconds?: number
  maxResolution?: string
  maxCharacters?: number
  dubbingMinutesPerMonth?: number
  maxProjects?: number
  exportWatermark?: boolean
  priorityQueue?: boolean
  collaboration?: boolean
}

function featuresOf(plan: SubscriptionPlan): PlanFeatures {
  return (plan.features ?? {}) as unknown as PlanFeatures
}

function unlimited(value?: number) {
  return value === -1 ? '无限' : String(value ?? '—')
}

export function PricingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [payingPlan, setPayingPlan] = useState<SubscriptionPlan | null>(null)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' })
  const [payError, setPayError] = useState('')

  const plansQuery = useQuery({ queryKey: ['subscription', 'plans'], queryFn: () => api.getPlans() })
  const currentQuery = useQuery({
    queryKey: ['subscription', 'current'],
    queryFn: () => api.getCurrentSubscription(),
    enabled: hasToken(),
    retry: false,
  })

  const plans = plansQuery.data?.plans ?? []
  const currentId = currentQuery.data?.plan?.id ?? 'free'
  const currentName = currentQuery.data?.plan?.name

  const subscribe = useMutation({
    mutationFn: () =>
      api.subscribe({
        planId: payingPlan?.id ?? '',
        billingCycle: cycle,
        paymentInfo: { cardNumber: card.number, expiry: card.expiry, cvv: card.cvv, method: 'card' },
      }),
    onSuccess: () => {
      showToast(t(`订阅成功，已升级到${payingPlan?.name ?? ''}`, `Subscribed to ${payingPlan?.name ?? ''}`), 'success')
      setPayingPlan(null)
      setCard({ number: '', expiry: '', cvv: '' })
      setPayError('')
      queryClient.invalidateQueries({ queryKey: ['subscription', 'current'] })
      queryClient.invalidateQueries({ queryKey: ['quota'] })
    },
    onError: (error: Error) => setPayError(error.message),
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelSubscription(),
    onSuccess: () => {
      showToast(t('已切换到免费版', 'Switched to free plan'), 'success')
      queryClient.invalidateQueries({ queryKey: ['subscription', 'current'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const choosePlan = (plan: SubscriptionPlan) => {
    if (plan.id === currentId) return
    if (!hasToken()) {
      showToast(t('请先登录后再订阅', 'Sign in before subscribing'), 'error')
      navigate('/login')
      return
    }
    if (plan.id === 'free') {
      cancel.mutate()
      return
    }
    setPayingPlan(plan)
    setPayError('')
  }

  const amount = payingPlan ? (cycle === 'yearly' ? payingPlan.priceYearly : payingPlan.priceMonthly) ?? 0 : 0

  if (plansQuery.isLoading) {
    return <div className="dr-skeleton" style={{ height: 360 }} />
  }

  if (plansQuery.isError) {
    return (
      <div className="dr-card dr-state">
        <p>{t('套餐加载失败', 'Failed to load plans')}：{(plansQuery.error as Error).message}</p>
        <button className="dr-btn" onClick={() => plansQuery.refetch()}>
          {t('重试', 'Retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="dr-page pricing-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Pricing</p>
          <h1>{t('套餐与定价', 'Pricing')}</h1>
          <p className="projects-lead">
            {t('按创作量与团队规模选择，随时可以升级或降级。', 'Choose by output and team size; upgrade or downgrade anytime.')}
          </p>
        </div>
        <span className="pricing-current">
          {t('当前计划', 'Current')}：<strong>{currentName ?? (currentId === 'free' ? t('免费版', 'Free') : currentId)}</strong>
        </span>
      </div>

      <div className="pricing-cycle" role="group" aria-label={t('计费周期', 'Billing cycle')}>
        <button
          type="button"
          className={cycle === 'monthly' ? 'is-active' : ''}
          aria-pressed={cycle === 'monthly'}
          onClick={() => setCycle('monthly')}
        >
          {t('月付', 'Monthly')}
        </button>
        <button
          type="button"
          className={cycle === 'yearly' ? 'is-active' : ''}
          aria-pressed={cycle === 'yearly'}
          onClick={() => setCycle('yearly')}
        >
          {t('年付', 'Yearly')}
          <span>{t('省 2 个月', '2 months free')}</span>
        </button>
      </div>

      <div className="pricing-grid">
        {plans.map((plan) => {
          const features = featuresOf(plan)
          const current = plan.id === currentId
          const popular = plan.id === 'pro'
          const price = cycle === 'yearly' ? plan.priceYearly ?? 0 : plan.priceMonthly ?? plan.price ?? 0
          return (
            <article className={`pricing-card ${popular ? 'is-popular' : ''} ${current ? 'is-current' : ''}`} key={plan.id}>
              {popular ? <span className="pricing-badge">{t('最受欢迎', 'Popular')}</span> : null}
              {current ? <span className="pricing-badge is-current">{t('当前计划', 'Current')}</span> : null}
              <h2>{plan.name}</h2>
              <div className="pricing-price">
                <span>¥</span>
                <strong>{price}</strong>
                <small>/{cycle === 'yearly' ? t('年', 'yr') : t('月', 'mo')}</small>
              </div>
              {cycle === 'yearly' && plan.priceMonthly ? (
                <p className="pricing-yearly">¥{plan.priceYearly} / {t('年', 'year')}</p>
              ) : (
                <p className="pricing-yearly">{t('按月计费', 'Billed monthly')}</p>
              )}
              <ul className="pricing-features">
                <li><Icon name="check" size={13} />{features.videoGenerationsPerDay} {t('次/天视频生成', 'video gens/day')}</li>
                <li><Icon name="check" size={13} />{t('单镜最长', 'Max shot')} {features.maxDurationSeconds}s</li>
                <li><Icon name="check" size={13} />{t('最高', 'Up to')} {features.maxResolution}</li>
                <li><Icon name="check" size={13} />{unlimited(features.maxCharacters)} {t('个角色', 'characters')}</li>
                <li><Icon name="check" size={13} />{features.dubbingMinutesPerMonth} {t('分钟/月配音', 'dubbing min/mo')}</li>
                <li><Icon name="check" size={13} />{unlimited(features.maxProjects)} {t('个项目', 'projects')}</li>
                <li className={features.exportWatermark ? 'is-off' : ''}>
                  <Icon name={features.exportWatermark ? 'close' : 'check'} size={13} />
                  {features.exportWatermark ? t('导出带水印', 'Watermarked export') : t('无水印导出', 'No watermark')}
                </li>
                <li className={features.priorityQueue ? '' : 'is-off'}>
                  <Icon name={features.priorityQueue ? 'check' : 'close'} size={13} />
                  {features.priorityQueue ? t('优先生成队列', 'Priority queue') : t('标准队列', 'Standard queue')}
                </li>
                <li className={features.collaboration ? '' : 'is-off'}>
                  <Icon name={features.collaboration ? 'check' : 'close'} size={13} />
                  {features.collaboration ? t('多人协作', 'Collaboration') : t('单人使用', 'Solo')}
                </li>
              </ul>
              <button
                type="button"
                className={`dr-btn ${current ? '' : 'dr-btn-primary'} pricing-cta`}
                disabled={current || subscribe.isPending || cancel.isPending}
                onClick={() => choosePlan(plan)}
              >
                {current
                  ? t('当前计划', 'Current')
                  : plan.id === 'free'
                    ? t('使用免费版', 'Use free')
                    : t('立即订阅', 'Subscribe')}
              </button>
            </article>
          )
        })}
      </div>

      <p className="pricing-note">
        {t('演示支付：不会产生真实扣费；正式部署时接入 Stripe。', 'Demo checkout: no real charge. Connect Stripe for production.')}
      </p>

      <Modal
        open={Boolean(payingPlan)}
        title={t('确认订阅', 'Confirm subscription')}
        onClose={() => (!subscribe.isPending ? setPayingPlan(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" disabled={subscribe.isPending} onClick={() => setPayingPlan(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={subscribe.isPending} onClick={() => subscribe.mutate()}>
              {subscribe.isPending ? t('处理中…', 'Processing…') : t(`确认支付 ¥${amount}`, `Pay ¥${amount}`)}
            </button>
          </>
        }
      >
        <div className="pricing-pay">
          <div className="pricing-pay-head">
            <strong>{payingPlan?.name}（{cycle === 'yearly' ? t('年付', 'Yearly') : t('月付', 'Monthly')}）</strong>
            <span>¥{amount}</span>
          </div>
          <label className="dr-field">
            <span>{t('卡号', 'Card number')}</span>
            <input
              className="dr-input"
              value={card.number}
              onChange={(event) => setCard({ ...card, number: event.target.value })}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
            />
          </label>
          <div className="pricing-pay-row">
            <label className="dr-field">
              <span>{t('有效期', 'Expiry')}</span>
              <input
                className="dr-input"
                value={card.expiry}
                onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                placeholder="MM/YY"
              />
            </label>
            <label className="dr-field">
              <span>CVV</span>
              <input
                className="dr-input"
                value={card.cvv}
                onChange={(event) => setCard({ ...card, cvv: event.target.value })}
                placeholder="123"
                inputMode="numeric"
              />
            </label>
          </div>
          {payError ? <p className="pricing-error">{payError}</p> : null}
          <p className="pricing-note">{t('这是演示支付，不会产生真实扣费。', 'Demo payment; no real charge.')}</p>
        </div>
      </Modal>
    </div>
  )
}
