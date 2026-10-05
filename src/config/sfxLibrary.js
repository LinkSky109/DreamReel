/**
 * 音效库
 * 常用环境音效和转场音效
 * 音频文件存放于 storage/audio/sfx/
 */

export const SFX_LIBRARY = [
  // 环境音
  { id: 'ambient-rain', name: '雨声', category: 'ambient', tags: ['雨', '环境', '自然'], filename: 'ambient-rain.mp3' },
  { id: 'ambient-wind', name: '风声', category: 'ambient', tags: ['风', '环境', '自然'], filename: 'ambient-wind.mp3' },
  { id: 'ambient-city', name: '城市噪音', category: 'ambient', tags: ['城市', '街道', '环境'], filename: 'ambient-city.mp3' },
  { id: 'ambient-forest', name: '森林鸟鸣', category: 'ambient', tags: ['森林', '鸟叫', '自然'], filename: 'ambient-forest.mp3' },
  { id: 'ambient-ocean', name: '海浪声', category: 'ambient', tags: ['海', '浪', '自然'], filename: 'ambient-ocean.mp3' },
  { id: 'ambient-crowd', name: '人群嘈杂', category: 'ambient', tags: ['人群', '噪音', '环境'], filename: 'ambient-crowd.mp3' },
  { id: 'ambient-cafe', name: '咖啡馆', category: 'ambient', tags: ['咖啡', '环境', '室内'], filename: 'ambient-cafe.mp3' },
  { id: 'ambient-traffic', name: '车流声', category: 'ambient', tags: ['车', '交通', '城市'], filename: 'ambient-traffic.mp3' },

  // 动作音
  { id: 'action-footstep', name: '脚步声', category: 'action', tags: ['脚步', '行走', '动作'], filename: 'action-footstep.mp3' },
  { id: 'action-door', name: '开门声', category: 'action', tags: ['门', '开关', '动作'], filename: 'action-door.mp3' },
  { id: 'action-phone', name: '手机铃声', category: 'action', tags: ['手机', '铃声', '通知'], filename: 'action-phone.mp3' },
  { id: 'action-typing', name: '键盘打字', category: 'action', tags: ['键盘', '打字', '工作'], filename: 'action-typing.mp3' },
  { id: 'action-punch', name: '拳击声', category: 'action', tags: ['拳', '打', '动作'], filename: 'action-punch.mp3' },
  { id: 'action-gun', name: '枪声', category: 'action', tags: ['枪', '射击', '动作'], filename: 'action-gun.mp3' },
  { id: 'action-explosion', name: '爆炸声', category: 'action', tags: ['爆炸', '动作', '大场面'], filename: 'action-explosion.mp3' },
  { id: 'action-sword', name: '刀剑声', category: 'action', tags: ['剑', '刀', '武器'], filename: 'action-sword.mp3' },

  // 转场音
  { id: 'transition-whoosh', name: '嗖声转场', category: 'transition', tags: ['转场', '嗖', '快速'], filename: 'transition-whoosh.mp3' },
  { id: 'transition-swoosh', name: '风声转场', category: 'transition', tags: ['转场', '风', '过渡'], filename: 'transition-swoosh.mp3' },
  { id: 'transition-impact', name: '冲击转场', category: 'transition', tags: ['转场', '冲击', '重音'], filename: 'transition-impact.mp3' },
  { id: 'transition-rise', name: '上升音', category: 'transition', tags: ['转场', '上升', '悬念'], filename: 'transition-rise.mp3' },
  { id: 'transition-glitch', name: '故障转场', category: 'transition', tags: ['转场', '故障', '电子'], filename: 'transition-glitch.mp3' },

  // UI/提示音
  { id: 'ui-click', name: '点击声', category: 'ui', tags: ['点击', 'UI', '按钮'], filename: 'ui-click.mp3' },
  { id: 'ui-notification', name: '通知提示', category: 'ui', tags: ['通知', '提示', '消息'], filename: 'ui-notification.mp3' },
  { id: 'ui-success', name: '成功提示', category: 'ui', tags: ['成功', '提示', '完成'], filename: 'ui-success.mp3' },
  { id: 'ui-error', name: '错误提示', category: 'ui', tags: ['错误', '警告', '提示'], filename: 'ui-error.mp3' },

  // 氛围音
  { id: 'atmosphere-drone', name: '低沉氛围', category: 'atmosphere', tags: ['氛围', '低沉', '悬疑'], filename: 'atmosphere-drone.mp3' },
  { id: 'atmosphere-pad', name: '柔和铺底', category: 'atmosphere', tags: ['氛围', '柔和', '背景'], filename: 'atmosphere-pad.mp3' },
  { id: 'atmosphere-tension', name: '紧张氛围', category: 'atmosphere', tags: ['氛围', '紧张', '悬念'], filename: 'atmosphere-tension.mp3' },
  { id: 'atmosphere-magic', name: '魔法氛围', category: 'atmosphere', tags: ['氛围', '魔法', '奇幻'], filename: 'atmosphere-magic.mp3' },
]

export const SFX_CATEGORIES = [
  { id: 'all', name: '全部', icon: '🔊' },
  { id: 'ambient', name: '环境音', icon: '🌿' },
  { id: 'action', name: '动作音', icon: '💥' },
  { id: 'transition', name: '转场音', icon: '➡️' },
  { id: 'ui', name: '提示音', icon: '🔔' },
  { id: 'atmosphere', name: '氛围音', icon: '🌫️' },
]

export default SFX_LIBRARY
