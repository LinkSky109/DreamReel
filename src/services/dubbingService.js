import { getTTSProvider } from '../providers/ttsProviderFactory.js'
import logger from '../utils/logger.js'

/**
 * 配音+字幕 Service
 * 从分镜脚本提取台词，生成 TTS 音频，生成 SRT 字幕
 */
export class DubbingService {
  constructor() {
    this.ttsProvider = getTTSProvider()
  }

  /**
   * 为项目生成配音和字幕
   * @param {Object} params
   * @param {Object} params.project - 项目对象
   * @param {string} params.language - 配音语言（zh/en/ja）
   * @param {string} params.voiceId - 音色 ID
   * @param {number} params.speed - 语速
   * @param {boolean} params.burnSubtitles - 是否烧录字幕
   */
  async generateDubbing({ project, language = 'zh', voiceId = 'zh_male_calm', speed = 1.0, burnSubtitles = true, dialogueAssignments = null, pauseSeconds = 0.4 }) {
    try {
      logger.info(`Generating dubbing for project ${project.id}, language=${language}`)

      // 1. 从分镜提取台词（含角色归属）
      const assignments = dialogueAssignments || project.dialogueAssignments || {}
      const dialogueLines = this.extractDialogueLines(project)
      if (dialogueLines.length === 0) {
        return {
          success: false,
          message: '当前剧本无台词或旁白，请先添加台词',
          audioTracks: [],
          subtitles: null,
        }
      }

      // 2. 逐句生成 TTS（按角色选音色）
      const audioTracks = []
      let currentTime = 0

      for (let i = 0; i < dialogueLines.length; i += 1) {
        const line = dialogueLines[i]
        const text = line.text.trim()
        if (!text) continue

        // 句间停顿（第一句前不加）
        if (i > 0 && pauseSeconds > 0) {
          currentTime += pauseSeconds
        }

        // 角色音色优先，否则用默认音色
        const lineVoice = line.characterId && assignments[line.characterId]
          ? assignments[line.characterId]
          : voiceId

        const audio = await this.ttsProvider.synthesize({
          text,
          language,
          voice: lineVoice,
          speed,
        })

        audioTracks.push({
          shotIndex: line.shotIndex,
          text,
          type: line.type,
          characterId: line.characterId || null,
          voiceId: lineVoice,
          audioUrl: audio.audioUrl,
          duration: audio.duration,
          startTime: currentTime,
          endTime: currentTime + audio.duration,
        })

        currentTime += audio.duration
      }

      // 3. 生成 SRT 字幕
      const srtContent = this.generateSRT(audioTracks)

      logger.info(`Dubbing generated: ${audioTracks.length} audio tracks, total ${currentTime.toFixed(1)}s`)

      return {
        success: true,
        audioTracks,
        subtitles: {
          format: 'srt',
          content: srtContent,
          language,
        },
        totalDuration: currentTime,
        dialogueAssignments: assignments,
        burnSubtitles,
      }
    } catch (error) {
      logger.error('Dubbing generation failed:', error.message)
      throw new Error(`配音生成失败：${error.message}`)
    }
  }

  /**
   * 从项目分镜中提取台词和旁白，并识别对话所属角色
   */
  extractDialogueLines(project) {
    const lines = []
    if (!project.shots) return lines

    // 构建角色名 -> id 映射
    const charNameToId = new Map()
    for (const c of project.characters || []) {
      if (c && c.name) charNameToId.set(c.name, c.id)
    }

    for (const shot of project.shots) {
      if (shot.narration && shot.narration.trim()) {
        lines.push({
          shotIndex: shot.index,
          type: 'narration',
          text: shot.narration,
          characterId: null,
        })
      }
      if (shot.dialogue && shot.dialogue.trim()) {
        // 识别角色：优先按对话文本中的"角色名："前缀，其次用镜头关联的第一个角色
        let characterId = null
        let dialogueText = shot.dialogue.trim()
        const prefixMatch = dialogueText.match(/^([^：:]{1,10})[：:]\s*(.+)$/)
        if (prefixMatch && charNameToId.has(prefixMatch[1].trim())) {
          characterId = charNameToId.get(prefixMatch[1].trim())
          dialogueText = prefixMatch[2].trim()
        } else if (shot.characterIds && shot.characterIds.length === 1) {
          characterId = shot.characterIds[0]
        } else if (shot.characterIds && shot.characterIds.length > 1) {
          characterId = shot.characterIds[0]
        }
        lines.push({
          shotIndex: shot.index,
          type: 'dialogue',
          text: dialogueText,
          characterId,
        })
      }
    }
    return lines
  }

  /**
   * 生成 SRT 字幕内容
   */
  generateSRT(audioTracks) {
    let srt = ''
    audioTracks.forEach((track, index) => {
      const startTime = this.formatSRTTime(track.startTime)
      const endTime = this.formatSRTTime(track.endTime)
      srt += `${index + 1}\n${startTime} --> ${endTime}\n${track.text}\n\n`
    })
    return srt
  }

  /**
   * 秒数转 SRT 时间格式（HH:MM:SS,mmm）
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const millis = Math.floor((seconds % 1) * 1000)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`
  }

  /**
   * 获取可用音色列表
   */
  async getAvailableVoices() {
    return this.ttsProvider.getVoices()
  }

  /**
   * 预览单句配音
   */
  async previewVoice({ text, language = 'zh', voiceId = 'zh_male_calm', speed = 1.0 }) {
    return this.ttsProvider.synthesize({ text, language, voice: voiceId, speed })
  }
}

export const dubbingService = new DubbingService()
export default dubbingService
