import { storageService } from './storageService.js'
import logger from '../utils/logger.js'

/**
 * R14：素材商城服务
 */

const PACKS = [
  // 风格包
  {
    id: 'pack-nolan',
    name: '诺兰叙事风格包',
    type: 'style_pack',
    icon: '🎬',
    price: 19,
    author: 'DreamReel 官方',
    description: '诺兰式冷色调、IMAX 质感与时间交叉叙事风格预设',
    items: 5,
  },
  {
    id: 'pack-wes',
    name: '韦斯·安德森配色包',
    type: 'style_pack',
    icon: '🎨',
    price: 19,
    author: 'DreamReel 官方',
    description: '对称构图、高饱和马卡龙配色与复古质感',
    items: 6,
  },
  {
    id: 'pack-anime',
    name: '日系动漫风格包',
    type: 'style_pack',
    icon: '🌸',
    price: 0,
    author: '社区贡献',
    description: '吉卜力、新海诚等日系动漫风格预设（免费）',
    items: 4,
  },
  // 模板包
  {
    id: 'pack-tpl-commerce',
    name: '电商带货模板包',
    type: 'template_pack',
    icon: '🛍️',
    price: 29,
    author: 'DreamReel 官方',
    description: '产品展示、开箱、种草、促销等 8 套带货模板',
    items: 8,
  },
  {
    id: 'pack-tpl-story',
    name: '故事短片模板包',
    type: 'template_pack',
    icon: '📖',
    price: 0,
    author: 'DreamReel 官方',
    description: '起承转合完整的故事短片模板（免费）',
    items: 5,
  },
  // 音效包
  {
    id: 'pack-audio-cinematic',
    name: '电影级配乐音效包',
    type: 'audio_pack',
    icon: '🎵',
    price: 39,
    author: '专业音乐人',
    description: '20 首电影配乐 + 40 个转场/环境音效',
    items: 60,
  },
  {
    id: 'pack-audio-lofi',
    name: 'Lo-Fi 氛围音乐包',
    type: 'audio_pack',
    icon: '🎧',
    price: 15,
    author: '独立制作人',
    description: '12 首 Lo-Fi 舒缓氛围循环',
    items: 12,
  },
]

export class MarketplaceService {
  listPacks({ type = 'all', sort = 'popular' } = {}) {
    let packs = PACKS
    if (type !== 'all') packs = packs.filter((p) => p.type === type)
    if (sort === 'price_asc') packs = [...packs].sort((a, b) => a.price - b.price)
    return { total: packs.length, items: packs }
  }

  getPack(packId) {
    const pack = PACKS.find((p) => p.id === packId)
    if (!pack) throw new Error('Pack not found')
    return pack
  }

  _purchases() {
    return storageService.get('marketplacePurchases') || {}
  }

  _savePurchases(data) {
    storageService.set('marketplacePurchases', data)
  }

  /**
   * 购买 / 领取
   */
  purchase(packId, userId = 'default') {
    const pack = this.getPack(packId)
    const all = this._purchases()
    if (!all[userId]) all[userId] = []
    if (all[userId].find((r) => r.packId === packId)) {
      throw new Error('已拥有该素材包')
    }
    const record = {
      packId,
      price: pack.price,
      purchasedAt: new Date().toISOString(),
      orderId: `ord_${Date.now()}`,
    }
    all[userId].push(record)
    this._savePurchases(all)
    logger.info(`Pack purchased: ${packId} by ${userId}, price ${pack.price}`)
    return { success: true, ...record, pack }
  }

  /**
   * 我的资产
   */
  myAssets(userId = 'default') {
    const records = this._purchases()[userId] || []
    const assets = records.map((r) => ({ ...r, pack: this.getPack(r.packId) }))
    const totalValue = records.reduce((sum, r) => sum + r.price, 0)
    return { total: assets.length, totalValue, items: assets }
  }

  hasPack(packId, userId = 'default') {
    return (this._purchases()[userId] || []).some((r) => r.packId === packId)
  }
}

export const marketplaceService = new MarketplaceService()
export default marketplaceService
