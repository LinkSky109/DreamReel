import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { StorePack } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Store.css'

type Category = 'all' | 'style_pack' | 'template_pack' | 'audio_pack'

const COVERS: Record<string, string> = {
  style_pack: '/media/img/portrait-window.jpg',
  template_pack: '/media/img/architecture.jpg',
  audio_pack: '/media/img/forest-light.jpg',
}

function currentUserId() {
  try {
    const raw = localStorage.getItem('dreamreel_user')
    return raw ? JSON.parse(raw)?.id || 'default' : 'default'
  } catch {
    return 'default'
  }
}

function typeLabel(type: string, t: (zh: string, en: string) => string) {
  if (type === 'style_pack') return t('风格包', 'Style pack')
  if (type === 'template_pack') return t('模板包', 'Template pack')
  if (type === 'audio_pack') return t('音效包', 'Audio pack')
  return type
}

export function StorePage() {
  const queryClient = useQueryClient()
  const { t } = useLang()
  const userId = useMemo(currentUserId, [])
  const [view, setView] = useState<'store' | 'assets'>('store')
  const [category, setCategory] = useState<Category>('all')
  const [selected, setSelected] = useState<StorePack | null>(null)

  const packsQuery = useQuery({ queryKey: ['store', 'packs'], queryFn: () => api.listStorePacks() })
  const assetsQuery = useQuery({ queryKey: ['store', 'assets', userId], queryFn: () => api.myStoreAssets(userId) })

  const packs = packsQuery.data?.items ?? []
  const assets = assetsQuery.data?.items ?? []
  const owned = useMemo(() => new Set(assets.map((asset) => asset.packId)), [assets])

  const purchase = useMutation({
    mutationFn: (pack: StorePack) => api.purchaseStorePack(pack.id, userId),
    onSuccess: (result, pack) => {
      showToast(
        result.price === 0 ? t('领取成功', 'Claimed') : t(`购买成功：${pack.name}`, `Purchased ${pack.name}`),
        'success'
      )
      setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['store', 'assets', userId] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const categories: { id: Category; zh: string; en: string }[] = [
    { id: 'all', zh: '全部', en: 'All' },
    { id: 'style_pack', zh: '风格包', en: 'Style' },
    { id: 'template_pack', zh: '模板包', en: 'Templates' },
    { id: 'audio_pack', zh: '音效包', en: 'Audio' },
  ]

  const countFor = (id: Category) => (id === 'all' ? packs.length : packs.filter((pack) => pack.type === id).length)
  const visible = category === 'all' ? packs : packs.filter((pack) => pack.type === category)

  const renderPack = (pack: StorePack, assetDate?: string) => {
    const isOwned = owned.has(pack.id) || Boolean(assetDate)
    return (
      <article className="store-card" key={pack.id}>
        <div className="store-cover">
          <img src={COVERS[pack.type] ?? '/media/img/fog-mountain.jpg'} alt="" loading="lazy" />
          <span>{typeLabel(pack.type, t)}</span>
          <small>{pack.items} {t('项内容', 'items')}</small>
        </div>
        <div className="store-body">
          <h2>{pack.name}</h2>
          <p>{pack.description}</p>
          <div className="store-meta">
            <span>{pack.author}</span>
            <strong>{pack.price === 0 ? t('免费', 'Free') : `¥${pack.price}`}</strong>
          </div>
          {assetDate ? <p className="store-owned-date">{t('已拥有', 'Owned')} · {assetDate.slice(0, 10)}</p> : null}
          <button
            type="button"
            className={`dr-btn ${isOwned ? '' : pack.price === 0 ? '' : 'dr-btn-primary'} store-cta`}
            disabled={isOwned}
            onClick={() => setSelected(pack)}
          >
            {isOwned ? (
              <><Icon name="check" size={13} />{t('已拥有', 'Owned')}</>
            ) : pack.price === 0 ? (
              t('免费领取', 'Claim free')
            ) : (
              t(`¥${pack.price} 购买`, `Buy ¥${pack.price}`)
            )}
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="dr-page store-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Marketplace</p>
          <h1>{t('素材商城', 'Marketplace')}</h1>
          <p className="projects-lead">
            {t('风格包、模板包与音效包，领取后即可在创作中使用。', 'Style, template and audio packs for your projects.')}
          </p>
        </div>
        <div className="store-tabs" role="group" aria-label={t('商城视图', 'Marketplace view')}>
          <button type="button" className={view === 'store' ? 'is-active' : ''} aria-pressed={view === 'store'} onClick={() => setView('store')}>
            {t('素材市场', 'Market')}
          </button>
          <button type="button" className={view === 'assets' ? 'is-active' : ''} aria-pressed={view === 'assets'} onClick={() => setView('assets')}>
            {t('我的资产', 'My assets')} <span>{assets.length}</span>
          </button>
        </div>
      </div>

      {view === 'store' ? (
        <>
          <div className="store-toolbar">
            <div className="store-categories" role="group" aria-label={t('素材分类', 'Categories')}>
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={category === item.id ? 'is-active' : ''}
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {t(item.zh, item.en)}
                  <span>{countFor(item.id)}</span>
                </button>
              ))}
            </div>
            <p className="store-tip">{t('已拥有', 'Owned')} <strong>{assets.length}</strong> · {t('累计价值', 'Total value')} ¥{assetsQuery.data?.totalValue ?? 0}</p>
          </div>

          {packsQuery.isLoading ? (
            <div className="store-grid">{[0, 1, 2].map((key) => <div className="dr-skeleton store-skeleton" key={key} />)}</div>
          ) : packsQuery.isError ? (
            <div className="dr-card dr-state">
              <p>{t('商城加载失败', 'Failed to load marketplace')}：{(packsQuery.error as Error).message}</p>
              <button className="dr-btn" onClick={() => packsQuery.refetch()}>{t('重试', 'Retry')}</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="dr-card dr-state"><p>{t('该分类暂无素材包。', 'No packs in this category.')}</p></div>
          ) : (
            <div className="store-grid">{visible.map((pack) => renderPack(pack))}</div>
          )}
        </>
      ) : (
        <>
          <div className="store-assets-head">
            <p>{t('共', 'Total')} <strong>{assets.length}</strong> {t('个素材包', 'packs')}</p>
            <p>{t('累计价值', 'Total value')} <strong>¥{assetsQuery.data?.totalValue ?? 0}</strong></p>
          </div>
          {assetsQuery.isLoading ? (
            <div className="store-grid">{[0, 1].map((key) => <div className="dr-skeleton store-skeleton" key={key} />)}</div>
          ) : assets.length === 0 ? (
            <div className="dr-card dr-state">
              <Icon name="store" size={26} />
              <p>{t('还没有领取或购买素材包。', 'No assets yet.')}</p>
              <button className="dr-btn dr-btn-primary" onClick={() => setView('store')}>{t('去素材市场', 'Browse marketplace')}</button>
            </div>
          ) : (
            <div className="store-grid">{assets.map((asset) => renderPack(asset.pack, asset.purchasedAt))}</div>
          )}
        </>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected ? (selected.price === 0 ? t('领取素材包', 'Claim pack') : t('确认购买', 'Confirm purchase')) : ''}
        width={480}
        onClose={() => (!purchase.isPending ? setSelected(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setSelected(null)}>{t('取消', 'Cancel')}</button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={purchase.isPending} onClick={() => selected && purchase.mutate(selected)}>
              {purchase.isPending ? t('处理中…', 'Processing…') : selected?.price === 0 ? t('确认领取', 'Claim') : t(`确认购买 ¥${selected?.price}`, `Buy ¥${selected?.price}`)}
            </button>
          </>
        }
      >
        {selected ? (
          <div className="store-confirm">
            <div className="store-confirm-head">
              <span>{typeLabel(selected.type, t)}</span>
              <strong>{selected.price === 0 ? t('免费', 'Free') : `¥${selected.price}`}</strong>
            </div>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <dl>
              <div><dt>{t('内容', 'Contents')}</dt><dd>{selected.items} {t('项', 'items')}</dd></div>
              <div><dt>{t('作者', 'Author')}</dt><dd>{selected.author}</dd></div>
            </dl>
            <p className="store-demo-note">
              <Icon name="shield" size={12} />
              {selected.price > 0
                ? t('当前为演示购买，不会产生真实扣款；正式环境接入支付。', 'Demo purchase: no real charge. Connect payments for production.')
                : t('领取后会立即加入「我的资产」。', 'Claiming adds this pack to My assets immediately.')}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
