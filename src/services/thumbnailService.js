import fs from 'fs'
import path from 'path'
import { ffmpeg } from '../utils/ffmpeg.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const THUMBNAIL_DIR = path.resolve(config.storage.path, 'thumbnails')

if (!fs.existsSync(THUMBNAIL_DIR)) {
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true })
}

/**
 * 缩略图服务
 * 从视频提取首帧作为项目封面
 */
export class ThumbnailService {
  /**
   * 为项目生成封面缩略图
   * 从第一个已完成的视频中提取首帧
   */
  async generateProjectThumbnail(project) {
    try {
      const completedShot = (project.shots || []).find((s) => s.status === 'completed' && s.videoUrl)
      if (!completedShot) {
        return null
      }

      const videoPath = path.resolve(config.storage.path, completedShot.videoUrl.replace(/^\/storage\//, ''))
      if (!fs.existsSync(videoPath)) {
        logger.warn(`Video file not found for thumbnail: ${videoPath}`)
        return null
      }

      const thumbnailName = `thumb_${project.id}_${Date.now()}.jpg`
      const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailName)

      await ffmpeg.extractThumbnail(videoPath, thumbnailPath, 0.5, '320x180')

      const thumbnailUrl = `/storage/thumbnails/${thumbnailName}`
      logger.info(`Thumbnail generated for project ${project.id}: ${thumbnailUrl}`)
      return thumbnailUrl
    } catch (error) {
      logger.warn(`Thumbnail generation failed: ${error.message}`)
      return null
    }
  }

  /**
   * 删除项目的所有缩略图
   */
  cleanupProjectThumbnails(projectId) {
    try {
      const files = fs.readdirSync(THUMBNAIL_DIR)
      let deleted = 0
      for (const file of files) {
        if (file.includes(projectId)) {
          fs.unlinkSync(path.join(THUMBNAIL_DIR, file))
          deleted++
        }
      }
      return deleted
    } catch (error) {
      logger.warn(`Thumbnail cleanup failed: ${error.message}`)
      return 0
    }
  }
}

export const thumbnailService = new ThumbnailService()
export default thumbnailService
