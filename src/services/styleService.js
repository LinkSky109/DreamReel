import logger from '../utils/logger.js'

/**
 * 风格预设服务
 * 导演风格 + 视觉特征 + prompt 修饰词
 */
const STYLE_PRESETS = [
  {
    id: 'nolan',
    name: '诺兰风格',
    director: 'Christopher Nolan',
    description: 'IMAX 宏大叙事，冷色调，时间交错，实拍质感',
    icon: '🎬',
    color: '#1e3a5f',
    cinematography: 'IMAX large format, deep focus, sweeping camera moves, practical effects',
    colorGrading: 'desaturated cool tones, teal and orange, high contrast',
    composition: 'symmetrical framing, low angle hero shots, cross-cutting',
    lighting: 'naturalistic, chiaroscuro, dramatic shadows',
    promptModifier:
      'shot on IMAX film, Christopher Nolan style, epic scale, practical effects, desaturated cool color palette, deep focus cinematography, dramatic lighting, high contrast',
    tags: ['宏大', '冷色调', '实拍', 'IMAX'],
  },
  {
    id: 'wes-anderson',
    name: '韦斯·安德森',
    director: 'Wes Anderson',
    description: '对称构图，柔和粉彩，复古质感，童话般的精致',
    icon: '🌸',
    color: '#f4a7b9',
    cinematography: 'locked-off camera, perfect symmetry, flat space, whip pans',
    colorGrading: 'pastel pinks, mint greens, butter yellows, faded film stock',
    composition: 'centered symmetry, tableaux framing, geometric patterns',
    lighting: 'soft even lighting, warm golden hour, no harsh shadows',
    promptModifier:
      'Wes Anderson style, perfect symmetrical composition, pastel color palette, vintage film aesthetic, centered framing, flat camera angles, whimsical detailed production design, soft warm lighting',
    tags: ['对称', '粉彩', '复古', '童话'],
  },
  {
    id: 'tarantino',
    name: '昆汀风格',
    director: 'Quentin Tarantino',
    description: '暴力美学，复古胶片，章节叙事，强烈对白张力',
    icon: '🔫',
    color: '#8b0000',
    cinematography: '35mm film, long tracking shots, trunk shots, Dutch angles',
    colorGrading: 'rich saturated colors, warm earth tones, high contrast film grain',
    composition: 'low angle trunk shots, close-up inserts, nonlinear framing',
    lighting: 'neon lit nights, warm practicals, high contrast shadows',
    promptModifier:
      'Quentin Tarantino style, 35mm film grain, rich saturated colors, violent beauty, long tracking shot, low angle, warm practical lighting, retro aesthetic, bold composition',
    tags: ['暴力美学', '胶片', '复古', '章节'],
  },
  {
    id: 'wong-kar-wai',
    name: '王家卫风格',
    director: 'Wong Kar-wai',
    description: '迷离都市，霓虹雨夜，手持晃动，时间感与孤独',
    icon: '🌃',
    color: '#4a1942',
    cinematography: 'handheld camera, step printing, slow motion, neon reflections',
    colorGrading: 'moody neon greens and magentas, warm tungsten, desaturated shadows',
    composition: 'obtuse angles, obscured framing, reflections, close-ups',
    lighting: 'neon lights, rain-soaked streets, practical lamps, moody shadows',
    promptModifier:
      'Wong Kar-wai style, moody neon lit urban night, handheld camera, step printing, rain reflections, magenta and green color palette, melancholic atmosphere, shallow depth of field, cinematic grain',
    tags: ['霓虹', '雨夜', '迷离', '都市'],
  },
  {
    id: 'studio-ghibli',
    name: '吉卜力风格',
    director: 'Hayao Miyazaki',
    description: '手绘动画质感，自然治愈，温暖光影，奇幻世界',
    icon: '🌿',
    color: '#7cb342',
    cinematography: 'hand-drawn animation, lush backgrounds, gentle camera, detailed nature',
    colorGrading: 'vibrant natural greens, warm sky blues, soft watercolor tones',
    composition: 'wide nature shots, intimate character moments, layered depth',
    lighting: 'soft diffused sunlight, dappled forest light, warm golden hour',
    promptModifier:
      'Studio Ghibli style, hand-drawn animation aesthetic, lush natural environments, warm soft lighting, watercolor texture, whimsical fantasy, detailed backgrounds, gentle camera movement, Hayao Miyazaki inspired',
    tags: ['手绘', '自然', '治愈', '奇幻'],
  },
  {
    id: 'blade-runner',
    name: '赛博朋克',
    director: 'Denis Villeneuve (Blade Runner 2049)',
    description: '未来都市，霓虹全息，浓雾阴雨，存在主义孤独',
    icon: '🌆',
    color: '#0d47a1',
    cinematography: 'Roger Deakins cinematography, slow deliberate moves, vast scale',
    colorGrading: 'orange desert haze, blue neon nights, teal shadows, high contrast',
    composition: 'brutalist architecture, solitary figures in vast spaces, symmetry',
    lighting: 'atmospheric volumetric light, neon glow, fog, holographic projections',
    promptModifier:
      'Blade Runner 2049 style, Roger Deakins cinematography, cyberpunk future, volumetric fog, neon holograms, orange and teal color palette, vast brutalist spaces, solitary figure, high contrast, cinematic epic',
    tags: ['赛博朋克', '霓虹', '未来', '浓雾'],
  },
  {
    id: 'minimalist',
    name: '极简主义',
    director: 'Yasujirō Ozu / Modern Minimal',
    description: '留白构图，干净背景，克制叙事，高级感',
    icon: '⬜',
    color: '#607d8b',
    cinematography: 'static camera, long takes, minimal movement, negative space',
    colorGrading: 'muted neutral palette, whites and grays, subtle warm accents',
    composition: 'rule of thirds, ample negative space, clean lines, minimal props',
    lighting: 'soft diffused natural light, even illumination, no harsh shadows',
    promptModifier:
      'minimalist cinematic style, static camera, negative space, clean composition, muted neutral color palette, soft natural lighting, long takes, Ozu-inspired framing, elegant restraint',
    tags: ['极简', '留白', '干净', '高级'],
  },
  {
    id: 'documentary',
    name: '纪录片风格',
    director: 'Natural Documentary',
    description: '真实手持，自然光，跟拍视角，现场感',
    icon: '📹',
    color: '#33691e',
    cinematography: 'handheld documentary, natural lighting, vérité style, real-time',
    colorGrading: 'natural ungraded colors, realistic skin tones, slight contrast',
    composition: 'observational framing, slightly imperfect, eye-level shots',
    lighting: 'available light only, natural sources, no studio lighting',
    promptModifier:
      'documentary vérité style, handheld camera, natural lighting, realistic ungraded colors, observational framing, authentic moment, raw footage feel, cinéma vérité, natural sound design visual',
    tags: ['真实', '手持', '自然', '现场'],
  },
  {
    id: 'noir',
    name: '黑色电影',
    director: 'Classic Film Noir',
    description: '黑白高反差，阴影百叶窗，侦探氛围，宿命感',
    icon: '🕵️',
    color: '#212121',
    cinematography: 'black and white, high contrast, Dutch angles, deep shadows',
    colorGrading: 'monochrome, silver gelatin tones, crushed blacks, bright highlights',
    composition: 'low key lighting, venetian blind shadows, canted framing, smoke',
    lighting: 'single source hard light, dramatic shadows, backlit silhouettes',
    promptModifier:
      'classic film noir style, black and white cinematography, high contrast lighting, venetian blind shadows, Dutch angles, smoke filled rooms, hardboiled detective atmosphere, deep shadows, monochrome',
    tags: ['黑白', '阴影', '侦探', '宿命'],
  },
  {
    id: 'tim-burton',
    name: '蒂姆·波顿',
    director: 'Tim Burton',
    description: '哥特童话，暗黑奇幻，扭曲造型，万圣节氛围',
    icon: '🦇',
    color: '#4a0e4e',
    cinematography: 'gothic architecture, distorted perspectives, stop-motion texture, whimsical camera',
    colorGrading: 'muted purples, deep blacks, ghostly whites, desaturated reds',
    composition: 'Dutch angles, exaggerated proportions, silhouette framing',
    lighting: 'moonlit nights, candlelight, dramatic shadows, foggy atmosphere',
    promptModifier:
      'Tim Burton style, gothic fairy tale aesthetic, dark fantasy, twisted whimsical designs, stop-motion texture, muted purple and black color palette, exaggerated proportions, moonlit atmospheric lighting, Halloween mood',
    tags: ['哥特', '童话', '暗黑', '奇幻'],
  },
  {
    id: 'zhang-yimou',
    name: '张艺谋风格',
    director: 'Zhang Yimou',
    description: '浓烈色彩，东方美学，大场面调度，仪式感构图',
    icon: '🏮',
    color: '#c41e3a',
    cinematography: 'sweeping wide shots, precise choreography, traditional Chinese aesthetics, slow tracking',
    colorGrading: 'bold reds, imperial golds, deep blues, saturated earth tones',
    composition: 'symmetrical large-scale framing, geometric patterns, heroic low angles',
    lighting: 'golden hour, lantern light, high contrast, dramatic natural light',
    promptModifier:
      'Zhang Yimou style, bold saturated color palette, Chinese aesthetic, epic large-scale composition, precise choreography, imperial red and gold tones, dramatic natural lighting, symmetrical framing, ceremonial atmosphere',
    tags: ['东方', '浓烈', '大场面', '仪式感'],
  },
  {
    id: 'makoto-shinkai',
    name: '新海诚风格',
    director: 'Makoto Shinkai',
    description: '细腻唯美，光影魔术，天空与云朵，青春忧伤',
    icon: '☁️',
    color: '#5b9bd5',
    cinematography: 'hyper-detailed backgrounds, lens flares, cloudscapes, slow cinematic pans',
    colorGrading: 'soft blues, warm oranges, pastel sunsets, luminous highlights',
    composition: 'wide environmental shots, small characters in vast spaces, reflective surfaces',
    lighting: 'golden hour, backlighting, lens flare, dappled sunlight through clouds',
    promptModifier:
      'Makoto Shinkai style, hyper-detailed anime aesthetic, luminous sky and cloudscapes, soft blue and warm orange palette, lens flares, golden hour lighting, reflective surfaces, melancholic youthful atmosphere, cinematic wide shots',
    tags: ['唯美', '光影', '天空', '青春'],
  },
  {
    id: 'guy-ritchie',
    name: '盖·里奇风格',
    director: 'Guy Ritchie',
    description: '快节奏剪辑，英伦黑帮，多线叙事，黑色幽默',
    icon: '🎩',
    color: '#2d4a3e',
    cinematography: 'fast cuts, slow motion punches, tracking shots, cockney grit',
    colorGrading: 'muted greens, warm browns, desaturated grays, high contrast',
    composition: 'low angle tough guy shots, quick inserts, nonlinear storytelling',
    lighting: 'neon pub lights, moody streetlights, high contrast shadows',
    promptModifier:
      'Guy Ritchie style, fast-paced editing, British gangster aesthetic, slow motion action, quick cuts, muted green and brown color palette, high contrast, cockney grit, nonlinear narrative, black humor',
    tags: ['快节奏', '黑帮', '英伦', '黑色幽默'],
  },
  {
    id: 'sofia-coppola',
    name: '索菲亚·科波拉',
    director: 'Sofia Coppola',
    description: '柔和梦幻，少女心事，柔光滤镜，疏离与孤独',
    icon: '🌸',
    color: '#e8b4b8',
    cinematography: 'soft focus, dreamy slow motion, intimate close-ups, lingering shots',
    colorGrading: 'pastel pinks, soft lavenders, faded creams, hazy glow',
    composition: 'intimate framing, negative space, characters lost in environment',
    lighting: 'soft diffused light, window light, dreamy haze, no harsh shadows',
    promptModifier:
      'Sofia Coppola style, soft dreamy aesthetic, pastel pink and lavender palette, diffused hazy lighting, intimate close-ups, slow motion, negative space, youthful melancholy, feminine gaze, faded film glow',
    tags: ['柔和', '梦幻', '少女', '疏离'],
  },
  {
    id: 'none',
    name: '无风格（原始）',
    director: null,
    description: '不添加风格修饰，按原始 prompt 生成',
    icon: '🎯',
    color: '#757575',
    cinematography: '',
    colorGrading: '',
    composition: '',
    lighting: '',
    promptModifier: '',
    tags: ['原始', '默认'],
  },
]

export class StyleService {
  /**
   * 列出所有风格预设
   */
  listStyles({ search } = {}) {
    let list = [...STYLE_PRESETS]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.director && s.director.toLowerCase().includes(q)) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return list
  }

  /**
   * 获取单个风格
   */
  getStyle(styleId) {
    const style = STYLE_PRESETS.find((s) => s.id === styleId)
    if (!style) {
      throw new Error(`Style not found: ${styleId}`)
    }
    return style
  }

  /**
   * 将风格修饰词注入到 prompt 中
   */
  applyStyleToPrompt(prompt, styleId) {
    if (!styleId || styleId === 'none') {
      return prompt
    }
    try {
      const style = this.getStyle(styleId)
      if (!style.promptModifier) return prompt
      return `${prompt}. ${style.promptModifier}`
    } catch (error) {
      logger.warn(`Failed to apply style ${styleId}: ${error.message}`)
      return prompt
    }
  }

  /**
   * 获取风格的视觉特征摘要（用于 UI 展示）
   */
  getStyleSummary(styleId) {
    const style = this.getStyle(styleId)
    return {
      id: style.id,
      name: style.name,
      icon: style.icon,
      color: style.color,
      description: style.description,
      tags: style.tags,
      characteristics: {
        cinematography: style.cinematography,
        colorGrading: style.colorGrading,
        composition: style.composition,
        lighting: style.lighting,
      },
    }
  }
}

export const styleService = new StyleService()
export default styleService
