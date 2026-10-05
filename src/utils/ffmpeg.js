import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * ffmpeg 工具封装
 */
export const ffmpeg = {
  /**
   * 执行 ffmpeg 命令
   */
  async run(args, options = {}) {
    try {
      const { stdout, stderr } = await execFileAsync('ffmpeg', ['-y', ...args], {
        timeout: options.timeout || 120000,
        maxBuffer: 10 * 1024 * 1024,
      })
      return { stdout, stderr }
    } catch (error) {
      throw new Error(`ffmpeg failed: ${error.stderr || error.message}`)
    }
  },

  /**
   * 生成占位视频（用于 mock 模式）
   * @param {Object} params
   * @param {string} params.outputPath - 输出路径
   * @param {number} params.duration - 时长（秒）
   * @param {string} params.text - 画面文字
   * @param {string} params.resolution - 分辨率（720p / 1080p）
   * @param {string} params.aspectRatio - 宽高比（16:9 / 9:16）
   */
  async generatePlaceholder({ outputPath, duration = 5, text = 'DreamReel', resolution = '720p', aspectRatio = '16:9' }) {
    const size = resolution === '1080p' ? '1920x1080' : '1280x720'
    const [w, h] = aspectRatio === '9:16' ? ['720', '1280'] : size.split('x')

    // 渐变色背景 + 动态呼吸效果（不依赖 drawtext）
    const args = [
      '-f', 'lavfi',
      '-i', `color=c=0x1a1a2e:s=${w}x${h}:d=${duration}`,
      '-f', 'lavfi',
      '-i', `color=c=0x8b5cf6:s=${w}x${h}:d=${duration}`,
      '-filter_complex',
      `[0:v][1:v]blend=all_expr='A*(0.7+0.3*sin(T*0.8))+B*(0.3-0.3*sin(T*0.8))',` +
      `noise=alls=8:allf=t+u[v]`,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '24',
      outputPath,
    ]

    await this.run(args)
    return outputPath
  },

  /**
   * 拼接多个视频
   */
  async concatVideos(videoPaths, outputPath) {
    // 创建 concat 列表文件
    const listContent = videoPaths.map((p) => `file '${p}'`).join('\n')
    const listPath = `${outputPath}.txt`
    const fs = await import('fs')
    fs.writeFileSync(listPath, listContent)

    try {
      await this.run([
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-c', 'copy',
        outputPath,
      ])
      return outputPath
    } finally {
      fs.unlinkSync(listPath)
    }
  },

  /**
   * 合并视频和音频
   */
  async mergeAudio(videoPath, audioPath, outputPath) {
    await this.run([
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
    ])
    return outputPath
  },

  /**
   * 烧录字幕到视频
   */
  async burnSubtitles(videoPath, srtPath, outputPath) {
    // ffmpeg subtitles filter 需要转义路径
    const escapedPath = srtPath.replace(/'/g, "'\\''")
    await this.run([
      '-i', videoPath,
      '-vf', `subtitles='${escapedPath}':force_style='FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=1'`,
      '-c:a', 'copy',
      outputPath,
    ])
    return outputPath
  },

  /**
   * 生成静音音轨（用于没有配音的片段）
   */
  async generateSilence(outputPath, duration) {
    await this.run([
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=stereo`,
      '-t', duration.toString(),
      '-c:a', 'aac',
      outputPath,
    ])
    return outputPath
  },

  /**
   * 拼接多个音频文件
   */
  async concatAudio(audioPaths, outputPath) {
    if (audioPaths.length === 0) return null
    if (audioPaths.length === 1) {
      const fs = await import('fs')
      fs.copyFileSync(audioPaths[0], outputPath)
      return outputPath
    }

    const inputs = []
    const filters = []
    audioPaths.forEach((_, i) => {
      inputs.push('-i', audioPaths[i])
      filters.push(`[${i}:a]`)
    })

    await this.run([
      ...inputs,
      '-filter_complex',
      `${filters.join('')}concat=n=${audioPaths.length}:v=0:a=1[out]`,
      '-map', '[out]',
      '-c:a', 'aac',
      outputPath,
    ])
    return outputPath
  },

  /**
   * 获取视频时长
   */
  async getDuration(videoPath) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ])
      return parseFloat(stdout.trim())
    } catch {
      return null
    }
  },

  /**
   * 从视频提取缩略图（首帧）
   * @param {string} videoPath - 输入视频路径
   * @param {string} outputPath - 输出图片路径
   * @param {number} timestamp - 提取时间点（秒），默认 0.5
   * @param {string} size - 输出尺寸，如 '320x180'
   */
  async extractThumbnail(videoPath, outputPath, timestamp = 0.5, size = '320x180') {
    try {
      await this.run([
        '-ss', String(timestamp),
        '-i', videoPath,
        '-vframes', '1',
        '-s', size,
        '-q:v', '2',
        outputPath,
      ])
      return outputPath
    } catch (error) {
      throw new Error(`Thumbnail extraction failed: ${error.message}`)
    }
  },

  /**
   * 检查视频是否有视频流
   */
  async hasVideoStream(videoPath) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ])
      return stdout.trim() === 'video'
    } catch {
      return false
    }
  },

  /**
   * 处理 BGM：截取时长 + 淡入淡出
   */
  async processBgm(inputPath, outputPath, { duration, fadeIn = 2, fadeOut = 2 } = {}) {
    try {
      const fadeOutStart = Math.max(0, duration - fadeOut)
      const af = `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}`
      await this.run([
        '-i', inputPath,
        '-t', String(duration),
        '-af', af,
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath,
      ])
      return outputPath
    } catch (error) {
      throw new Error(`BGM processing failed: ${error.message}`)
    }
  },

  /**
   * 调整单轨音量
   */
  async adjustVolume(inputPath, outputPath, volume = 1.0) {
    try {
      await this.run([
        '-i', inputPath,
        '-af', `volume=${volume}`,
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath,
      ])
      return outputPath
    } catch (error) {
      throw new Error(`Volume adjustment failed: ${error.message}`)
    }
  },

  /**
   * 多轨混音（amix）
   * @param {Array} tracks - [{ path, volume }]
   * @param {string} outputPath
   * @param {number} duration - 总时长（用于填充静音）
   */
  async mixAudioTracks(tracks, outputPath, duration) {
    try {
      const inputs = []
      const filters = []

      tracks.forEach((track, i) => {
        inputs.push('-i', track.path)
        filters.push(`[${i}:a]volume=${track.volume}[a${i}]`)
      })

      const mixInputs = tracks.map((_, i) => `[a${i}]`).join('')
      filters.push(`${mixInputs}amix=inputs=${tracks.length}:duration=longest[aout]`)

      await this.run([
        ...inputs,
        '-filter_complex', filters.join(';'),
        '-map', '[aout]',
        '-t', String(duration),
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath,
      ])
      return outputPath
    } catch (error) {
      throw new Error(`Audio mixing failed: ${error.message}`)
    }
  },
}

export default ffmpeg
