import { projectService } from './projectService.js'
import {
  getDirector,
  listDirectors as listDirectorProfiles,
  orchestrateShot,
} from '../config/directorProfiles.js'
import logger from '../utils/logger.js'

/**
 * R29：导演模式服务
 * - 列出/取导演档案
 * - 为项目应用导演模式（编排每个镜头的运镜/时长/表演指导）
 * - 关闭导演模式（保留导演档案与已生成指导，仅停止 prompt 注入）
 *
 * 注意：本服务从 config/directorProfiles.js 引入纯函数，不反向依赖 videoService。
 */
export class DirectorService {
  /**
   * 列出全部导演档案
   * @returns {{total:number, items:Array}}
   */
  listDirectors() {
    const items = listDirectorProfiles()
    return { total: items.length, items }
  }

  /**
   * 取单个导演档案，找不到抛错
   */
  getDirector(id) {
    const director = getDirector(id)
    if (!director) {
      throw new Error(`Director not found: ${id}`)
    }
    return director
  }

  /**
   * 为项目应用导演模式
   * - 校验导演与项目存在
   * - 设置 project.directorMode
   * - 对每个 shot 调 orchestrateShot 写入 cameraMovement/duration/directorGuidance
   * - 持久化
   */
  async applyDirector(projectId, directorId) {
    const director = this.getDirector(directorId)

    let project
    try {
      project = await projectService.getProject(projectId)
    } catch {
      throw new Error(`Project not found: ${projectId}`)
    }

    project.directorMode = {
      enabled: true,
      directorId,
      appliedAt: new Date().toISOString(),
    }

    const guidance = []
    const shots = project.shots || []
    for (let i = 0; i < shots.length; i += 1) {
      const shot = shots[i]
      const result = orchestrateShot(director, shot, i)
      shot.cameraMovement = result.cameraMovement
      shot.duration = result.duration
      shot.directorGuidance = result.directorGuidance
      shot.updatedAt = new Date().toISOString()
      guidance.push({
        index: i,
        cameraMovement: result.cameraMovement,
        duration: result.duration,
        directorGuidance: result.directorGuidance,
      })
    }
    project.updatedAt = new Date().toISOString()

    await projectService.updateProject(projectId, { directorMode: project.directorMode })
    logger.info(`Director ${directorId} applied to project ${projectId}, ${guidance.length} shots orchestrated`)

    return { director, project: project.toJSON(), guidance }
  }

  /**
   * 关闭导演模式：仅置 enabled=false，保留 directorId 与已生成指导
   */
  async disableDirector(projectId) {
    const project = await projectService.getProject(projectId)
    const prev = project.directorMode || {}
    project.directorMode = { ...prev, enabled: false }
    project.updatedAt = new Date().toISOString()
    await projectService.updateProject(projectId, { directorMode: project.directorMode })
    logger.info(`Director mode disabled for project ${projectId}`)
    return project.toJSON()
  }
}

export const directorService = new DirectorService()
export default directorService
