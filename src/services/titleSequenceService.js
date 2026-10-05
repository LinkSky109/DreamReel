import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { ffmpeg } from '../utils/ffmpeg.js'
import { titleCard } from '../utils/titleCard.js'

const DEFAULT_OUTPUT_DIR = path.resolve(config.storage.path, 'title-sequences')

/**
 * R28：创意片头模板库
 * 每个模板包含名称、视觉描述、推荐配乐情绪（BGM 选曲建议）、ffmpeg 标题卡参数。
 * 标题卡由 Pillow（scripts/render_title_card.py）真实绘制 title/subtitle 后，
 * 经 ffmpeg loop 成 3-5 秒视频并 mux 静音音轨。
 */
const TITLE_TEMPLATES = [
  {
    id: 'classic-gold',
    name: '黑底金字经典',
    visualDescription:
      '近黑背景居中呈现烫金片名，宋体端庄，副标题浅金，缓慢淡入淡出的院线开场质感',
    musicMood: '低沉弦乐铺底、庄重史诗感，渐强收尾（BGM 选曲建议）',
    ffmpeg: {
      duration: 4,
      resolution: '720p',
      aspectRatio: '16:9',
      bgColors: ['0x050505', '0x1a1408'],
      titleColor: '#d9b45a',
    },
  },
  {
    id: 'glitch-cyber',
    name: '故障赛博',
    visualDescription:
      '深青黑底片名白色叠青/品红 RGB 错位副本，细扫描线，黑客帝国式故障片头',
    musicMood: '工业电子、故障节拍、紧张推进感（BGM 选曲建议）',
    ffmpeg: {
      duration: 4,
      resolution: '720p',
      aspectRatio: '16:9',
      bgColors: ['0x06060f', '0x00ffcc'],
      titleColor: '#e8faff',
    },
  },
  {
    id: 'ink-wash',
    name: '水墨国风',
    visualDescription:
      '宣纸暖灰底晕染墨色，墨黑宋体片名居中，角落一枚朱砂方印，留白意境',
    musicMood: '古琴/箫独奏、空灵悠远、留白呼吸感（BGM 选曲建议）',
    ffmpeg: {
      duration: 5,
      resolution: '720p',
      aspectRatio: '16:9',
      bgColors: ['0xf3eddf', '0x2b2b2b'],
      titleColor: '#1c1c1c',
    },
  },
  {
    id: 'neon-retro',
    name: '霓虹复古',
    visualDescription:
      '深紫渐变背景片名霓虹粉带发光，青色点缀与底部水平网格线，80 年代合成波氛围',
    musicMood: '合成器波、复古funk律动、霓虹夜色感（BGM 选曲建议）',
    ffmpeg: {
      duration: 4,
      resolution: '720p',
      aspectRatio: '16:9',
      bgColors: ['0x1a0b3d', '0x3a1560'],
      titleColor: '#ff5fa2',
    },
  },
]

/**
 * 创意片头 Service
 */
class TitleSequenceService {
  constructor({ outputDir = DEFAULT_OUTPUT_DIR } = {}) {
    this.outputDir = outputDir
  }

  /**
   * 列出全部片头模板
   */
  listTemplates() {
    return TITLE_TEMPLATES.map((t) => ({ ...t }))
  }

  /**
   * 按 id 查询模板，不存在时抛出错误
   */
  getTemplate(templateId) {
    const template = TITLE_TEMPLATES.find((t) => t.id === templateId)
    if (!template) {
      throw new Error(`Title template not found: ${templateId}`)
    }
    return { ...template }
  }

  /**
   * 生成片头视频：标题卡 PNG → ffmpeg loop + 静音音轨
   * @param {Object} params
   * @param {string} params.templateId
   * @param {string} [params.projectId]
   * @param {string} params.title
   * @param {string} [params.subtitle]
   * @param {string} [params.outputDir]
   */
  async generateTitleSequence({ templateId, projectId, title, subtitle, outputDir } = {}) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('title 不能为空')
    }
    const template = this.getTemplate(templateId)

    const targetDir = outputDir || this.outputDir
    fs.mkdirSync(targetDir, { recursive: true })

    const safeProjectId = (projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default'
    const filename = `${templateId}_${safeProjectId}_${Date.now()}.mp4`
    const outputPath = path.join(targetDir, filename)
    const cardPngPath = path.join(targetDir, `${filename}.card.png`)

    let titleRendered = false
    try {
      // 1) Pillow 真实绘制标题卡 PNG（片名/副标题上屏）
      await titleCard.render({
        templateId,
        title: title.trim(),
        subtitle: subtitle || '',
        width: 1280,
        height: 720,
        outputPath: cardPngPath,
      })
      // 2) PNG loop 成视频 + 静音音轨 + 淡入淡出
      await this._muxCardToVideo(cardPngPath, outputPath, template.ffmpeg.duration)
      titleRendered = true
    } catch (renderError) {
      logger.warn(`Title card render failed, fallback to color backdrop: ${renderError.message}`)
      // 回退：纯色 blend 背景（无文字上屏），如实标记 titleRendered=false
      await this._renderColorBackdrop(outputPath, template)
    } finally {
      // 清理中间 PNG
      try {
        if (fs.existsSync(cardPngPath)) fs.unlinkSync(cardPngPath)
      } catch {
        // ignore
      }
    }

    const videoUrl = `/storage/title-sequences/${filename}`
    logger.info(`Title sequence generated: ${filename} (${template.name}, titleRendered=${titleRendered})`)
    return {
      templateId: template.id,
      templateName: template.name,
      projectId: projectId || null,
      title: title.trim(),
      subtitle: subtitle || '',
      duration: template.ffmpeg.duration,
      videoUrl,
      filePath: outputPath,
      titleRendered,
      audioTrack: true,
      audio: 'silent',
      musicMood: template.musicMood,
    }
  }

  /**
   * 标题卡 PNG → 3-5s mp4（含 aac 静音音轨、淡入淡出）
   */
  async _muxCardToVideo(cardPngPath, outputPath, duration) {
    const fadeOutStart = Math.max(0, duration - 0.6)
    const args = [
      '-loop', '1',
      '-t', String(duration),
      '-i', cardPngPath,
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', `fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOutStart}:d=0.6,format=yuv420p`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-r', '24',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ]
    await ffmpeg.run(args)
    return outputPath
  }

  /**
   * 回退渲染：color lavfi + blend（无文字上屏），但仍含静音音轨
   */
  async _renderColorBackdrop(outputPath, template) {
    const { duration, bgColors } = template.ffmpeg
    const args = [
      '-f', 'lavfi',
      '-i', `color=c=${bgColors[0]}:s=1280x720:d=${duration}`,
      '-f', 'lavfi',
      '-i', `color=c=${bgColors[1]}:s=1280x720:d=${duration}`,
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-filter_complex',
      `[0:v][1:v]blend=all_expr='A*(0.7+0.3*sin(T*0.8))+B*(0.3-0.3*sin(T*0.8))'[v]`,
      '-map', '[v]',
      '-map', '2:a',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '24',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ]
    await ffmpeg.run(args)
    return outputPath
  }
}

export const titleSequenceService = new TitleSequenceService()
export { TITLE_TEMPLATES }
export default TitleSequenceService
