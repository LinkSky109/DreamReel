import { storageService } from './storageService.js'
import { projectService } from './projectService.js'
import logger from '../utils/logger.js'
import crypto from 'crypto'

const MAX_VERSIONS_PER_PROJECT = 50

/**
 * 项目版本历史服务
 * 自动保存快照、版本列表、版本对比、一键回滚
 */
export class VersionService {
  constructor() {
    if (!storageService.data.versions) storageService.data.versions = {}
  }

  /**
   * 保存项目快照
   * @param {string} projectId - 项目 ID
   * @param {Object} options - { label, description, auto }
   */
  async saveVersion(projectId, { label, description, auto = false } = {}) {
    try {
      const project = await projectService.getProject(projectId)
      const projectData = project.toJSON()

      const version = {
        id: crypto.randomUUID(),
        projectId,
        versionNumber: this._getNextVersionNumber(projectId),
        label: label || `版本 ${this._getNextVersionNumber(projectId)}`,
        description: description || '',
        auto,
        snapshot: JSON.parse(JSON.stringify(projectData)), // 深拷贝
        createdAt: new Date().toISOString(),
        shotCount: (projectData.shots || []).length,
        completedShots: (projectData.shots || []).filter((s) => s.status === 'completed').length,
        characterCount: (projectData.characters || []).length,
        hasScript: !!projectData.script,
      }

      if (!storageService.data.versions[projectId]) {
        storageService.data.versions[projectId] = []
      }

      storageService.data.versions[projectId].push(version)

      // 只保留最近 N 个版本
      if (storageService.data.versions[projectId].length > MAX_VERSIONS_PER_PROJECT) {
        storageService.data.versions[projectId] = storageService.data.versions[projectId].slice(-MAX_VERSIONS_PER_PROJECT)
      }

      storageService.save()
      logger.info(`Version saved for project ${projectId}: v${version.versionNumber} (${auto ? 'auto' : 'manual'})`)
      return version
    } catch (error) {
      logger.error(`Failed to save version for project ${projectId}:`, error.message)
      throw error
    }
  }

  /**
   * 获取项目的所有版本
   */
  getVersions(projectId, { limit = 20, offset = 0 } = {}) {
    const versions = storageService.data.versions[projectId] || []
    const sorted = versions.sort((a, b) => {
      const timeDiff = new Date(b.createdAt) - new Date(a.createdAt)
      if (timeDiff !== 0) return timeDiff
      return b.versionNumber - a.versionNumber
    })
    return {
      total: sorted.length,
      items: sorted.slice(offset, offset + limit),
    }
  }

  /**
   * 获取单个版本详情
   */
  getVersion(projectId, versionId) {
    const versions = storageService.data.versions[projectId] || []
    const version = versions.find((v) => v.id === versionId)
    if (!version) {
      throw new Error(`Version not found: ${versionId}`)
    }
    return version
  }

  /**
   * 回滚到指定版本
   * 会先保存当前状态为新版本，再恢复
   */
  async rollback(projectId, versionId) {
    try {
      const targetVersion = this.getVersion(projectId, versionId)

      // 先保存当前状态
      const currentVersion = await this.saveVersion(projectId, {
        label: '回滚前自动保存',
        description: `回滚到 v${targetVersion.versionNumber} 前的自动备份`,
        auto: true,
      })

      // 恢复项目数据
      const snapshot = targetVersion.snapshot
      await projectService.updateProject(projectId, {
        name: snapshot.name,
        status: snapshot.status,
        targetDuration: snapshot.targetDuration,
        style: snapshot.style,
        platform: snapshot.platform,
        script: snapshot.script,
        shots: snapshot.shots,
        characters: snapshot.characters,
        scenes: snapshot.scenes,
      })

      logger.info(`Project ${projectId} rolled back to v${targetVersion.versionNumber}`)
      return {
        success: true,
        rolledBackTo: targetVersion,
        backupVersion: currentVersion,
      }
    } catch (error) {
      logger.error(`Rollback failed for project ${projectId}:`, error.message)
      throw error
    }
  }

  /**
   * 删除版本
   */
  deleteVersion(projectId, versionId) {
    const versions = storageService.data.versions[projectId] || []
    const index = versions.findIndex((v) => v.id === versionId)
    if (index === -1) {
      throw new Error(`Version not found: ${versionId}`)
    }
    versions.splice(index, 1)
    storageService.save()
    return { success: true }
  }

  /**
   * 对比两个版本
   */
  compareVersions(projectId, versionId1, versionId2) {
    const v1 = this.getVersion(projectId, versionId1)
    const v2 = this.getVersion(projectId, versionId2)

    const differences = {
      name: v1.snapshot.name !== v2.snapshot.name,
      script: this._compareScript(v1.snapshot.script, v2.snapshot.script),
      shots: {
        countChanged: v1.shotCount !== v2.shotCount,
        from: v1.shotCount,
        to: v2.shotCount,
        completedChanged: v1.completedShots !== v2.completedShots,
        completedFrom: v1.completedShots,
        completedTo: v2.completedShots,
      },
      characters: {
        countChanged: v1.characterCount !== v2.characterCount,
        from: v1.characterCount,
        to: v2.characterCount,
      },
      style: v1.snapshot.style !== v2.snapshot.style,
    }

    return {
      version1: { id: v1.id, versionNumber: v1.versionNumber, label: v1.label, createdAt: v1.createdAt },
      version2: { id: v2.id, versionNumber: v2.versionNumber, label: v2.label, createdAt: v2.createdAt },
      differences,
    }
  }

  /**
   * 清理项目的所有版本
   */
  cleanupProject(projectId) {
    delete storageService.data.versions[projectId]
    storageService.save()
  }

  _getNextVersionNumber(projectId) {
    const versions = storageService.data.versions[projectId] || []
    return versions.length + 1
  }

  _compareScript(script1, script2) {
    if (!script1 && !script2) return false
    if (!script1 || !script2) return true
    return JSON.stringify(script1) !== JSON.stringify(script2)
  }
}

export const versionService = new VersionService()
export default versionService
