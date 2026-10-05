import { storageService } from './storageService.js'
import { teamService } from './teamService.js'
import { auditService } from './auditService.js'
import logger from '../utils/logger.js'

/**
 * R20：企业版与私有化服务
 */

const DEFAULT_CONFIG = {
  // 单点登录
  sso: {
    enabled: false,
    provider: 'saml', // saml / oidc
    entryPoint: '',
    issuer: '',
    certificate: '',
  },
  // 密码策略
  passwordPolicy: {
    minLength: 10,
    requireMixedCase: true,
    requireNumber: true,
    requireSymbol: true,
    sessionTimeoutHours: 12,
  },
  // 安全
  security: {
    enforceIpAllowlist: false,
    ipAllowlist: [],
    exportWatermark: true,
    watermarkText: 'DreamReel Enterprise',
    disablePublicSharing: false,
  },
  // 数据驻留
  dataResidency: {
    region: 'cn-east-1',
    retentionDays: 365,
  },
}

export class EnterpriseService {
  getConfig() {
    return storageService.get('enterpriseConfig') || DEFAULT_CONFIG
  }

  updateConfig(updates, actor = 'admin') {
    const current = this.getConfig()
    const merged = this._deepMerge(current, updates)
    storageService.set('enterpriseConfig', merged)
    auditService.record({
      actor,
      action: 'enterprise.config.update',
      resourceType: 'enterprise_config',
      details: { keys: Object.keys(updates) },
    })
    logger.info('Enterprise config updated')
    return merged
  }

  /**
   * 企业管理概览：聚合团队、成员、项目与审计
   */
  async overview() {
    const teamsResult = await teamService.listTeams()
    const teams = teamsResult.items
    const memberSet = new Set()
    let projectCount = 0
    for (const t of teams) {
      for (const m of t.members) memberSet.add(m.userId)
      projectCount += t.projectCount
    }
    const auditStats = auditService.actionStats()
    return {
      teams: teams.length,
      members: memberSet.size,
      projects: projectCount,
      auditEvents: Object.values(auditStats).reduce((a, b) => a + b, 0),
      auditStats,
      config: this.getConfig(),
    }
  }

  /**
   * 私有化部署信息
   */
  deploymentInfo() {
    return {
      edition: 'enterprise',
      version: process.env.npm_package_version || '1.0.0',
      deployment: process.env.DR_DEPLOYMENT_MODE || 'self_hosted',
      features: [
        'sso_saml_oidc',
        'audit_log',
        'ip_allowlist',
        'data_residency',
        'watermark',
        'team_management',
        'dedicated_support',
      ],
      support: { sla: '99.9% uptime', channel: 'dedicated engineer' },
    }
  }

  _deepMerge(target, source) {
    const out = { ...target }
    for (const [k, v] of Object.entries(source || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
        out[k] = this._deepMerge(target[k], v)
      } else {
        out[k] = v
      }
    }
    return out
  }
}

export const enterpriseService = new EnterpriseService()
export default enterpriseService
