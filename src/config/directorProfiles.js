/**
 * R29：导演模式档案库（纯数据 / 纯函数模块）
 *
 * 对标 LibTV「导演执导」，本质是 prompt 编排增强。
 * 本模块不 import 任何 service，可被 videoService 与 directorService 共同引用，
 * 避免循环依赖（模式参照 src/config/characterExpressions.js）。
 *
 * 注意：musicMood 仅为「BGM 选曲情绪建议」，不代表导演模式会自动生成配乐或真实视频。
 */

/**
 * 5 位导演档案
 * 字段：id, name, tagline, era, statement,
 *       camera:{ style, moves:[运镜词库] },
 *       pacing:{ tempo, shotDurationBias(秒级正负偏置), description },
 *       performance:{ style, cues:[表演提示词库] },
 *       colorLighting:{ palette, lighting, description },
 *       musicMood(配乐情绪字符串)
 */
export const DIRECTORS = [
  {
    id: 'noir',
    name: '暗夜低语',
    tagline: '黑色电影·暗夜低语',
    era: '1940s 黑色电影',
    statement:
      '我相信阴影里藏着真相。光只打在脸的一半，另一半交给黑暗。对白要少，画外独白要多，让观众在沉默里听见欲望与罪。',
    camera: {
      style: '低照度低调光摄影，浓重阴影切割画面',
      moves: ['缓慢推轨', '荷兰角倾斜构图', '固定机位长镜', '缓慢横移跟拍'],
    },
    pacing: {
      tempo: 'slow',
      shotDurationBias: 1,
      description: '慢节奏留白，镜头停留在沉默与眼神上',
    },
    performance: {
      style: '冷硬克制',
      cues: ['画外独白旁白', '面部微表情克制收敛', '压抑沉默不发一言', '眼神忧郁低垂回避'],
    },
    colorLighting: {
      palette: '黑白幽蓝色调',
      lighting: '高反差低调光，百叶窗阴影',
      description: '高反差低调光，浓重阴影淹没边缘',
    },
    musicMood: '萨克斯低回的冷爵士',
  },
  {
    id: 'wong',
    name: '都市迷离',
    tagline: '都市迷离·王家卫式',
    era: '1990s 都市文艺',
    statement:
      '记忆是会发霉的。我不拍事件，我拍时间的触感。暧昧的停顿比对白更重要，情绪要先于故事漫出来。',
    camera: {
      style: '手持摄影，抽帧慢门拖影',
      moves: ['手持跟拍', '抽帧慢门拖影', '缓慢推近侧脸', '虚焦横移'],
    },
    pacing: {
      tempo: 'languid',
      shotDurationBias: 2,
      description: '暧昧停顿，长镜头滞留情绪',
    },
    performance: {
      style: '情绪先行',
      cues: ['暧昧停顿凝视', '慵懒倚靠窗边', '侧脸落寞出神', '欲言又止转身'],
    },
    colorLighting: {
      palette: '暖黄与品红霓虹',
      lighting: '霓虹溢色，光晕晕开',
      description: '霓虹溢色，暖黄与品红在暗部晕开',
    },
    musicMood: '慵懒拉丁怀旧舞曲',
  },
  {
    id: 'kubrick',
    name: '冷峻对称',
    tagline: '冷峻对称·库布里克式',
    era: '作者电影·冷峻对称',
    statement:
      '对称是一种权力。我把人物放在画面正中央，让他被秩序包围。摄影机缓慢地、不可抗拒地推进，像命运本身。',
    camera: {
      style: '单点透视绝对对称构图',
      moves: ['缓慢推镜', '绝对对称固定机位', '缓慢后拉', '几何对称横移'],
    },
    pacing: {
      tempo: 'deliberate',
      shotDurationBias: 1,
      description: '冷峻克制，机械般精准的节奏',
    },
    performance: {
      style: '冷峻克制',
      cues: ['面无表情直视镜头', '机械精准的动作', '克制疏离不带情绪', '静止凝视前方'],
    },
    colorLighting: {
      palette: '冷色调',
      lighting: '均匀冷光，无死角',
      description: '冷色调均匀布光，画面冰冷规整',
    },
    musicMood: '古典与电子极简配乐',
  },
  {
    id: 'bay',
    name: '爆裂商业',
    tagline: '爆裂商业·动作大片',
    era: '现代商业动作片',
    statement:
      '观众要的是肾上腺素。镜头要冲上去贴着脸拍，剪辑要狠，节奏要把人按在座位上。能量永远拉满。',
    camera: {
      style: '环绕甩镜，低角度冲击',
      moves: ['环绕甩镜', '低角度仰拍冲击', '快速推拉', '手持晃动追逐'],
    },
    pacing: {
      tempo: 'fast',
      shotDurationBias: -1,
      description: '快切高节奏，镜头短促有力',
    },
    performance: {
      style: '夸张高能量',
      cues: ['夸张表情爆发', '肢体张力十足', '怒吼嘶吼', '奔跑冲撞'],
    },
    colorLighting: {
      palette: '高饱和橙青对比',
      lighting: '强光硬光，火光通透',
      description: '高饱和橙青对比，强光硬光制造冲击',
    },
    musicMood: '强鼓点电子动作配乐',
  },
  {
    id: 'ghibli',
    name: '治愈自然',
    tagline: '治愈自然·吉卜力式',
    era: '治愈系手绘动画',
    statement:
      '风穿过树叶的声音、夏天午后的光、人物认真吃饭的样子——日常本身就值得被温柔地拍下来。',
    camera: {
      style: '轻柔横移，固定长镜',
      moves: ['轻柔横移', '固定长镜凝视', '缓慢上摇天空', '缓慢下摇草地'],
    },
    pacing: {
      tempo: 'gentle',
      shotDurationBias: 1,
      description: '舒缓田园，给情绪留呼吸',
    },
    performance: {
      style: '自然真挚',
      cues: ['自然舒展的笑容', '微风中头发飘动', '深呼吸舒展肩膀', '纯真好奇地张望'],
    },
    colorLighting: {
      palette: '通透水彩暖绿',
      lighting: '柔和自然光，光斑斑驳',
      description: '通透水彩质感，暖绿自然光',
    },
    musicMood: '灵动温暖管弦配乐',
  },
]

/**
 * 按 id 取导演档案，找不到返回 undefined
 */
export function getDirector(id) {
  if (!id) return undefined
  return DIRECTORS.find((d) => d.id === id)
}

/**
 * 列出全部导演档案
 */
export function listDirectors() {
  return DIRECTORS.map((d) => ({ ...d }))
}

/**
 * 依据 shotType 给一个运镜选择偏移，让不同景别倾向不同运镜
 * （仅作确定性偏移，不引入随机性）
 */
function shotTypeOffset(shotType) {
  switch (shotType) {
    case 'close-up':
    case 'extreme-close-up':
      return 1
    case 'wide':
    case 'extreme-wide':
      return 2
    case 'medium':
    default:
      return 0
  }
}

/**
 * 确定性地为该镜头产出导演调度
 * @param {Object} director 导演档案
 * @param {Object} shot 镜头（可能含 shotType/dialogue/description）
 * @param {number} index 镜头序号
 * @returns {{cameraMovement:string, duration:number, directorGuidance:string}}
 */
export function orchestrateShot(director, shot, index = 0) {
  if (!director) {
    return { cameraMovement: 'static', duration: 5, directorGuidance: '' }
  }

  const moves = (director.camera && director.camera.moves) || ['static']
  const safeIndex = Number.isInteger(index) ? index : 0
  const offset = shotTypeOffset(shot && shot.shotType)
  const cameraMovement = moves[(safeIndex + offset) % moves.length]

  // 时长：基准 5s + 导演节奏偏置，夹在 3-8 秒
  const bias = (director.pacing && director.pacing.shotDurationBias) || 0
  const duration = Math.max(3, Math.min(8, Math.round(5 + bias)))

  // 表演指导：从 cues 中按 index 轮换取一条，结合本镜 dialogue/description
  const cues = (director.performance && director.performance.cues) || []
  const cue = cues.length > 0 ? cues[safeIndex % cues.length] : ''
  const parts = []
  if (cue) parts.push(`表演:${cue}`)
  if (director.pacing && director.pacing.description) parts.push(`节奏:${director.pacing.description}`)
  const dialogue = shot && shot.dialogue
  const desc = shot && shot.description
  if (dialogue) parts.push(`本镜台词「${dialogue}」`)
  else if (desc) parts.push(`本镜画面「${desc}」`)
  const directorGuidance = parts.join('，')

  return { cameraMovement, duration, directorGuidance }
}

/**
 * 生成该镜头的导演指令片段（注入发给 video provider 的 prompt）
 * - shot 存在：包含本镜运镜、节奏、表演指导、色调光影、配乐情绪建议
 * - shot 为 undefined/空：退化为只给全局导演风格片段
 *
 * 注意：musicMood 标注为 BGM 选曲情绪建议，不暗示自动生成配乐。
 */
export function buildDirectorPrompt(director, shot) {
  if (!director) return ''

  const parts = []
  // 全局导演风格
  parts.push(`${director.name}导演风格（${director.era}）：${director.tagline}`)
  if (director.camera && director.camera.style) parts.push(`整体摄影:${director.camera.style}`)

  const hasShot = shot && typeof shot === 'object' && (shot.cameraMovement || shot.directorGuidance || shot.description)
  if (hasShot) {
    if (shot.cameraMovement) parts.push(`本镜运镜:${shot.cameraMovement}`)
    if (director.pacing && director.pacing.description) parts.push(`本镜节奏:${director.pacing.description}`)
    if (shot.directorGuidance) parts.push(`表演指导:${shot.directorGuidance}`)
  }

  if (director.colorLighting && director.colorLighting.palette) {
    parts.push(`色调:${director.colorLighting.palette}`)
  }
  if (director.colorLighting && director.colorLighting.lighting) {
    parts.push(`光影:${director.colorLighting.lighting}`)
  }
  if (director.musicMood) {
    parts.push(`配乐情绪建议(BGM选曲参考，非自动生成配乐):${director.musicMood}`)
  }

  return parts.join('；')
}

export default { DIRECTORS, getDirector, listDirectors, orchestrateShot, buildDirectorPrompt }
